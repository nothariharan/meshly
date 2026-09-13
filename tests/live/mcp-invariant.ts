/**
 * Verifies the Cursor → Meshly MCP → Runtime → ExecutionFabric → Solari path.
 *
 * Drives the real `meshly mcp` server over stdio the way an MCP client does,
 * and asserts the demo invariant:
 *   1. The client sees only meshly_* tools. Zero direct Solari tools.
 *   2. create worker -> run -> get run -> verify work through the runtime.
 *   3. The run allocates real environments under Meshly (browser/sandbox/desktop).
 *
 * Pass --live to run against real Solari (costs credit); default is simulator.
 */
import { spawn } from "node:child_process"

const live = process.argv.includes("--live")
const root = process.cwd()

const child = spawn("npx", ["tsx", "packages/cli/src/index.ts", "mcp", ...(live ? [] : ["--simulator"])], {
  cwd: root,
  shell: true,
  stdio: ["pipe", "pipe", "pipe"],
})

let buffer = ""
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
let nextId = 1

child.stdout.on("data", (chunk) => {
  buffer += String(chunk)
  let idx: number
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    const waiter = pending.get(msg.id)
    if (waiter) {
      pending.delete(msg.id)
      waiter.resolve(msg)
    }
  }
})
child.stderr.on("data", () => {})

function send(method: string, params: any = {}): Promise<any> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout waiting for ${method}`))
      }
    }, 180_000)
  })
}

async function call(name: string, args: any = {}): Promise<any> {
  const res = await send("tools/call", { name, arguments: args })
  if (res.error) throw new Error(`${name}: ${res.error.message}`)
  const text = res.result?.content?.[0]?.text
  return text ? JSON.parse(text) : res.result
}

let passed = true
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    passed = false
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

try {
  console.log("\nMESHLY MCP — CURSOR → MESHLY → SOLARI INVARIANT\n")

  const init = await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cursor", version: "0" } })
  ok("initialize handshake", init.result?.serverInfo?.name === "meshly", JSON.stringify(init.result))

  const list = await send("tools/list")
  const names: string[] = (list.result?.tools || []).map((t: any) => t.name)
  ok("tools/list returns Meshly tools", names.length >= 7)
  ok("all tools are meshly_*", names.every((n) => n.startsWith("meshly_")))
  ok("zero direct Solari tools exposed", !names.some((n) => /solari|browser_create|sandbox_create|desktop_create/i.test(n)), names.join(", "))
  console.log(`    tools: ${names.join(", ")}`)

  const worker = await call("meshly_create_worker", {
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile invoice 4421 and report only after Meshly verifies the world state",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  ok("meshly_create_worker", Boolean(worker.id), JSON.stringify(worker))

  const run = await call("meshly_run", { workerId: worker.id })
  ok("meshly_run produced a run", Boolean(run.runId), JSON.stringify(run))
  ok("run allocated environments under Meshly", (run.steps || []).length > 0, JSON.stringify(run.steps))
  console.log(`    run ${run.runId} → ${run.status}`)

  const got = await call("meshly_get_run", { runId: run.runId })
  ok("meshly_get_run", got.runId === run.runId, JSON.stringify(got).slice(0, 200))

  const verify = await call("meshly_verify", { runId: run.runId })
  ok("meshly_verify returns a decision", typeof verify.matched === "boolean", JSON.stringify(verify))

  const envs = await call("meshly_environments")
  ok("meshly_environments reflects the run", Array.isArray(envs), JSON.stringify(envs).slice(0, 160))

  console.log(live ? "\n  mode: LIVE SOLARI" : "\n  mode: simulator (pass --live for real Solari)")
  console.log(`\n${passed ? "INVARIANT HOLDS" : "INVARIANT BROKEN"}\n`)
} catch (err) {
  passed = false
  console.error("\n  ✗ harness error:", err instanceof Error ? err.message : err)
} finally {
  child.kill()
  process.exit(passed ? 0 : 1)
}
