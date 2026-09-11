import fs from "node:fs"
import path from "node:path"
import { Meshly } from "@meshly/sdk"
import type { ProjectStore } from "./store.js"

export async function runInit(
  store: ProjectStore,
  rest: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const name = rest[0] || path.basename(store.root)
  const provider = String(flags.provider || flags.execution || "").toLowerCase()
  const yes = Boolean(flags.yes || flags["non-interactive"])
  const skipProbe = Boolean(flags["skip-probe"])

  let execution: "solari" | "simulator"
  if (provider === "simulator" || provider === "local") {
    execution = "simulator"
  } else if (provider === "solari") {
    execution = "solari"
  } else if (process.env.SOLARI_API_KEY) {
    execution = "solari"
  } else if (yes) {
    execution = "simulator"
  } else {
    execution = process.env.SOLARI_API_KEY ? "solari" : "simulator"
  }

  if (execution === "solari") {
    const key = typeof flags["api-key"] === "string" ? flags["api-key"] : process.env.SOLARI_API_KEY
    if (!key) {
      throw new Error("Solari selected but no API key. Pass --api-key, set SOLARI_API_KEY, or use --provider simulator.")
    }
    process.env.SOLARI_API_KEY = key
    const envPath = path.join(store.root, ".env")
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, `SOLARI_API_KEY=${key}\n`)
    }
  }

  const config = store.exists()
    ? store.loadConfig()
    : store.init(name, execution)

  if (store.exists() && config.execution !== execution) {
    fs.writeFileSync(
      store.configPath,
      JSON.stringify({ ...config, execution }, null, 2),
    )
  }

  console.log("\nMeshly\n")
  console.log("[1] Connect execution provider")
  console.log(`    ${execution === "solari" ? "Solari" : "Local simulator"} ✓`)

  if (skipProbe) {
    console.log("\n[2] Test infrastructure")
    console.log("    skipped (--skip-probe)")
  } else {
    console.log("\n[2] Test infrastructure")
    const mesh = new Meshly(
      execution === "simulator"
        ? { preferSimulator: true }
        : { solariApiKey: process.env.SOLARI_API_KEY, fallbackToSimulator: false },
    )

    const caps = ["browser", "sandbox", "desktop"] as const
    for (const cap of caps) {
      process.stdout.write(`    ${cap[0].toUpperCase()}${cap.slice(1)} `)
      try {
        const worker = await mesh.spawn({
          name: `probe-${cap}`,
          task: `Probe ${cap} execution`,
          capabilities: [cap],
          budget: 1,
        })
        const run = await worker.run({ destroyAfter: true })
        if (run.status === "COMPLETED") {
          console.log("✓")
        } else {
          console.log(`✗  ${run.error || run.status}`)
          if (execution === "solari") process.exitCode = 1
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`✗  ${message}`)
        if (execution === "solari") process.exitCode = 1
      }
    }
  }

  console.log("\n[3] Create worker")
  seedCanonicalWorker(store)

  console.log("\n[4] Open console")
  console.log("    meshly run invoice-reconciler")
  console.log("    meshly dev → http://localhost:3400")
  console.log("\nReady.\n")
}

function seedCanonicalWorker(store: ProjectStore): void {
  if (!store.getWorker("invoice-reconciler")) {
    store.saveWorker({
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name: "invoice-reconciler",
      kind: "reconciliation",
      task: "Reconcile today's payment records with the ERP",
      capabilities: ["browser", "sandbox", "desktop"],
      priority: 8,
      budget: 2,
      spent: 0,
      limits: {
        maxSpend: 2,
        maxDurationMs: 30 * 60_000,
        maxEnvironments: 3,
        maxRetries: 1,
        maxToolCalls: 40,
      },
      status: "CREATED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    console.log("    invoice-reconciler ✓")
  } else {
    console.log("    invoice-reconciler (already exists)")
  }
}
