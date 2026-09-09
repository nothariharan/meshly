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
    console.log("\nReady. Next: meshly worker create   or   meshly dev\n")
    return
  }

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

  console.log("\n[3] Start operator console")
  console.log("    meshly dev → http://localhost:3400")
  console.log("\nReady.\n")
}
