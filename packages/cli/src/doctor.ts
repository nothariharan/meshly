/**
 * End-to-end smoke check for a Meshly install.
 *
 *   meshly doctor
 *
 * Live Solari is the default. Pass --simulator for a local kernel check.
 */
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { Meshly, MESHLY_MCP_TOOLS } from "@meshly/sdk"
import { cliUsesSimulator } from "./mode.js"
import type { ProjectStore } from "./store.js"

const MIN_NODE_MAJOR = 20

type CheckStatus = "ok" | "fail" | "skip"

interface Check {
  name: string
  status: CheckStatus
  detail: string
}

function versionOf(pkg: string, from: string): string | undefined {
  try {
    const req = createRequire(from)
    return req(`${pkg}/package.json`).version as string
  } catch {
    return undefined
  }
}

export function cliVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"))
    return pkg.version || "0.1.0"
  } catch {
    return versionOf("meshly", import.meta.url) || versionOf("@meshly/cli", import.meta.url) || "0.1.0"
  }
}

function mark(check: Check): string {
  if (check.status === "ok") return "✓"
  if (check.status === "skip") return "·"
  return "✗"
}

export async function runDoctor(
  store: ProjectStore,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const checks: Check[] = []
  const simulator = cliUsesSimulator(flags, store)
  const skipProbe = Boolean(flags["skip-probe"])

  const nodeMajor = Number(process.versions.node.split(".")[0])
  checks.push({
    name: "Meshly installation",
    status: "ok",
    detail: `meshly ${cliVersion()}`,
  })
  checks.push({
    name: "Node version",
    status: nodeMajor >= MIN_NODE_MAJOR ? "ok" : "fail",
    detail: nodeMajor >= MIN_NODE_MAJOR ? `Node ${process.versions.node}` : `Node ${process.versions.node} (need >= ${MIN_NODE_MAJOR})`,
  })

  const key = process.env.SOLARI_API_KEY
  if (simulator) {
    checks.push({
      name: "Solari credentials",
      status: "skip",
      detail: flags.simulator
        ? "explicit --simulator. This is not live Solari."
        : "this project was initialized with --provider simulator. Pass --live to use Solari.",
    })
  } else if (key) {
    checks.push({
      name: "Solari credentials",
      status: "ok",
      detail: `SOLARI_API_KEY set (${key.length} chars)`,
    })
  } else {
    checks.push({
      name: "Solari credentials",
      status: "fail",
      detail: "No SOLARI_API_KEY. Set it, or run `meshly init --api-key <key>`.",
    })
  }

  try {
    if (store.exists()) {
      store.loadConfig()
      const probe = path.join(store.dir, ".doctor")
      fs.writeFileSync(probe, new Date().toISOString())
      fs.unlinkSync(probe)
      checks.push({
        name: "persistence",
        status: "ok",
        detail: `.meshly/ (${store.listWorkers().length} workers, ${store.listRuns().length} runs)`,
      })
    } else {
      const probe = path.join(store.root, ".meshly-doctor-write")
      fs.writeFileSync(probe, "ok")
      fs.unlinkSync(probe)
      checks.push({
        name: "persistence",
        status: "skip",
        detail: "cwd is writable — run `meshly init` to create .meshly/",
      })
    }
  } catch (err) {
    checks.push({
      name: "persistence",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const consoleMod = await import("@meshly/console")
    if (typeof consoleMod.startConsole !== "function") throw new Error("startConsole export missing")
    const server: http.Server = consoleMod.startConsole({ port: 0, cwd: store.root, quiet: true })
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve())
        server.once("error", reject)
      })
    }
    const addr = server.address()
    const bound = typeof addr === "object" && addr ? addr.port : 0
    const res = await fetch(`http://127.0.0.1:${bound}/api/snapshot`)
    const body = (await res.json()) as { initialized?: boolean }
    server.closeAllConnections?.()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    checks.push({
      name: "console",
      status: res.ok ? "ok" : "fail",
      detail: res.ok ? `operator console served snapshot (initialized=${Boolean(body.initialized)})` : `HTTP ${res.status}`,
    })
  } catch (err) {
    checks.push({
      name: "console",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    if (!Array.isArray(MESHLY_MCP_TOOLS) || MESHLY_MCP_TOOLS.length < 7) {
      throw new Error(`expected MCP tools, found ${MESHLY_MCP_TOOLS?.length ?? 0}`)
    }
    checks.push({
      name: "MCP",
      status: "ok",
      detail: `${MESHLY_MCP_TOOLS.length} tools (meshly_create_worker, meshly_run, meshly_verify, …)`,
    })
  } catch (err) {
    checks.push({
      name: "MCP",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const missingKey = !simulator && !process.env.SOLARI_API_KEY
  if (skipProbe || missingKey) {
    for (const cap of ["Browser", "Sandbox", "Desktop"]) {
      checks.push({
        name: `${cap} capability`,
        status: "skip",
        detail: missingKey ? "not probed — no SOLARI_API_KEY" : "skipped (--skip-probe)",
      })
    }
  } else {
    const mesh = simulator
      ? new Meshly({ preferSimulator: true })
      : new Meshly({ solariApiKey: process.env.SOLARI_API_KEY, fallbackToSimulator: false })
    for (const cap of ["browser", "sandbox", "desktop"] as const) {
      const label = `${cap[0].toUpperCase()}${cap.slice(1)} capability`
      try {
        const worker = await mesh.spawn({
          name: `doctor-${cap}`,
          kind: "probe",
          task: `Probe ${cap} execution`,
          capabilities: [cap],
          budget: 1,
        })
        const run = await worker.run({ destroyAfter: true })
        checks.push({
          name: label,
          status: run.status === "COMPLETED" ? "ok" : "fail",
          detail: run.status === "COMPLETED" ? `${mesh.mode} ${cap} committed` : run.error || run.status,
        })
      } catch (err) {
        checks.push({
          name: label,
          status: "fail",
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  console.log("\nMeshly doctor\n")
  for (const check of checks) {
    console.log(`  ${mark(check)} ${check.name.padEnd(22)} ${check.detail}`)
  }

  const failed = checks.filter((c) => c.status === "fail")
  if (failed.length) {
    console.log(`\n${failed.length} check${failed.length === 1 ? "" : "s"} failed.\n`)
    process.exitCode = 1
    return
  }
  console.log("\nMeshly is ready.\n")
}
