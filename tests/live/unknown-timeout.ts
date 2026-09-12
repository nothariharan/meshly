/**
 * Live UNKNOWN: a real desktop write races a Meshly timeout.
 * Meshly must not infer from the RPC — it independently reads the desktop file.
 */
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const runsDir = path.join(root, ".meshly", "runs")
const before = new Set(fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])

const child = spawn("npx", ["tsx", "packages/cli/src/index.ts", "run", "invoice-reconciler", "--timeout", "--keep"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  windowsHide: true,
})

const code = await once(child, "exit").then(([c]) => Number(c ?? 1))
const files = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json") && !before.has(f))
const latest = files
  .map((f) => ({ f, t: fs.statSync(path.join(runsDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0]
if (!latest) {
  console.error("No new run written")
  process.exit(1)
}
const run = JSON.parse(fs.readFileSync(path.join(runsDir, latest.f), "utf8"))
const types = (run.events || []).map((e: { type: string }) => e.type)
console.log(`UNKNOWN_TEST status=${run.status} run=${run.runId}`)
console.log(`  action.unknown=${types.includes("action.unknown")}`)
console.log(`  verification.independent=${types.includes("verification.independent")}`)
console.log(`  erp=${run.steps?.[0]?.observation?.erp_status}`)
const ok =
  (run.status === "VERIFIED" || run.status === "UNKNOWN") &&
  types.includes("action.unknown") &&
  types.includes("verification.independent")
process.exit(ok && code !== null ? 0 : 1)
