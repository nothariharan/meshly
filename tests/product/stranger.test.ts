/**
 * The path a stranger actually takes: no key must not become a silent simulator,
 * and `meshly mcp` must not inherit a leftover simulator project.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Meshly, MeshlyError } from "@meshly/sdk"
import { cliUsesSimulator, mcpUsesSimulator } from "../../packages/cli/src/mode.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const cli = path.join(root, "packages/cli/src/index.ts")

function envWithoutKey(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.SOLARI_API_KEY
  return env
}

function envWithKey(key: string): NodeJS.ProcessEnv {
  return { ...process.env, SOLARI_API_KEY: key }
}

function runCli(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", cli, ...args], {
      cwd,
      env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    const timer = setTimeout(() => child.kill(), 60_000)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

function mcpOnce(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  requests: unknown[],
): Promise<{ stderr: string; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", cli, ...args], {
      cwd,
      env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stderr = ""
    let buffer = ""
    const messages: any[] = []
    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (err) reject(err)
      else resolve({ stderr, messages })
    }
    const timer = setTimeout(() => finish(new Error(`mcp timed out. stderr=${stderr}`)), 30_000)
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk)
      let idx = buffer.indexOf("\n")
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line) {
          try {
            messages.push(JSON.parse(line))
          } catch {
            /* ignore non-json logs */
          }
        }
        idx = buffer.indexOf("\n")
        if (messages.length >= requests.length) finish()
      }
    })
    child.on("error", (err) => finish(err))
    child.on("close", () => {
      if (messages.length < requests.length) finish(new Error(`mcp exited early. stderr=${stderr}`))
    })
    for (const request of requests) child.stdin.write(JSON.stringify(request) + "\n")
  })
}

export async function runStrangerTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" STRANGER PATH — NO SILENT SIMULATOR")
  console.log("=".repeat(78) + "\n")

  let passed = true
  const ok = (name: string, cond: boolean, detail?: string) => {
    if (cond) console.log(`  ✓ ${name}`)
    else {
      passed = false
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
    }
  }

  const previous = process.env.SOLARI_API_KEY
  delete process.env.SOLARI_API_KEY
  try {
    let missing = false
    try {
      new Meshly()
    } catch (err) {
      missing = err instanceof MeshlyError && err.code === "MISSING_API_KEY"
    }
    ok("new Meshly() without a key throws", missing)
  } finally {
    if (previous === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = previous
  }

  const demo = new Meshly({ preferSimulator: true })
  ok("preferSimulator is the explicit local path", demo.mode === "simulator")

  const simulatorProject = { exists: () => true, loadConfig: () => ({ execution: "simulator" }) }
  ok("mcp ignores a simulator project", mcpUsesSimulator({}) === false)
  ok("mcp --simulator is explicit", mcpUsesSimulator({ simulator: true }) === true)
  ok("cli run keeps an initialized simulator project", cliUsesSimulator({}, simulatorProject) === true)
  ok("cli --live overrides a simulator project", cliUsesSimulator({ live: true }, simulatorProject) === false)

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-stranger-"))
  const doctor = await runCli(["doctor", "--skip-probe"], empty, envWithoutKey())
  ok("doctor without a key fails", doctor.code === 1, `code ${doctor.code}`)
  ok("doctor names the missing key", doctor.stdout.includes("No SOLARI_API_KEY"), doctor.stdout)
  ok("doctor does not probe a simulator", !doctor.stdout.includes("simulator browser"), doctor.stdout)

  const simDoctor = await runCli(["doctor"], empty, envWithoutKey())
  ok(
    "doctor without --simulator does not run local probes",
    simDoctor.code !== 0 && !simDoctor.stdout.includes("simulator browser"),
    simDoctor.stdout,
  )
  const explicit = await runCli(["doctor", "--simulator"], empty, envWithoutKey())
  ok("doctor --simulator runs the local kernel", explicit.code === 0 && explicit.stdout.includes("simulator browser"), explicit.stdout)

  const listed = await mcpOnce(
    ["mcp", "--simulator"],
    empty,
    envWithoutKey(),
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "stranger", version: "0" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ],
  )
  const tools = (listed.messages.find((m) => m.id === 2)?.result?.tools || []) as Array<{ name: string }>
  ok("mcp --simulator announces itself", listed.stderr.includes("mode=simulator"), listed.stderr)
  ok("mcp exposes only meshly_* tools", tools.length >= 12 && tools.every((t) => t.name.startsWith("meshly_")), tools.map((t) => t.name).join(", "))
  ok("mcp server version matches the package", listed.messages.find((m) => m.id === 1)?.result?.serverInfo?.version === "0.1.2")

  const stale = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-stale-"))
  fs.mkdirSync(path.join(stale, ".meshly"), { recursive: true })
  fs.writeFileSync(
    path.join(stale, ".meshly", "config.json"),
    JSON.stringify({ name: "stale", createdAt: new Date().toISOString(), execution: "simulator" }),
  )
  const liveMcp = await mcpOnce(
    ["mcp"],
    stale,
    envWithKey("sk_test_not_real"),
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "stranger", version: "0" } } },
    ],
  )
  ok("mcp with a key stays live over a simulator project", liveMcp.stderr.includes("mode=live") && !liveMcp.stderr.includes("not live Solari"), liveMcp.stderr)

  const refused = await runCli(["mcp"], empty, envWithoutKey())
  ok("mcp without a key exits", refused.code === 1, `code ${refused.code}`)
  ok("mcp without a key does not start a simulator", refused.stderr.includes("will not pretend") && !refused.stderr.includes("mode=simulator"), refused.stderr)

  console.log("")
  return { passed }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
  : false
if (invokedDirectly) {
  runStrangerTests()
    .then((result) => process.exit(result.passed ? 0 : 1))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
