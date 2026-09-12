/**
 * Live: Meshly stays up, Solari sandbox is destroyed after allocate and
 * before the step runs. Meshly must record ENVIRONMENT LOST, allocate a
 * replacement from the checkpoint, and finish the same run.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { Meshly } from "@meshly/sdk"
import { ProjectStore } from "@meshly/core"

const root = process.cwd()
const envFile = path.join(root, ".env")
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith("#") || !t.includes("=")) continue
  const eq = t.indexOf("=")
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (process.env[k] === undefined) process.env[k] = v
}

const store = new ProjectStore(root)
store.loadConfig()
const definition = store.getWorker("invoice-reconciler")
if (!definition) throw new Error("invoice-reconciler worker missing — run meshly init")

const mesh = new Meshly({
  solariApiKey: process.env.SOLARI_API_KEY,
  fallbackToSimulator: false,
})

let killed = false
mesh.events.subscribe((event) => {
  if (event.type !== "solari.sandbox.created" || killed) return
  const fabricId = event.data?.fabricId as string | undefined
  if (!fabricId) return
  killed = true
  console.log(`KILL Solari sandbox during allocate fabric=${fabricId.slice(0, 24)}`)
  execFileSync("npx", ["tsx", "tests/live/release-sessions.ts", fabricId], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
})

const worker = await mesh.spawn({
  id: definition.id,
  name: definition.name,
  kind: "reconciliation",
  task: definition.task,
  capabilities: definition.capabilities,
  priority: definition.priority,
  budget: definition.budget,
  limits: definition.limits,
})

const run = await worker.run({
  artifactDir: store.artifactDir(),
  destroyAfter: true,
  onProgress: (instance) => {
    store.snapshotRun({
      run: instance,
      worker,
      mode: "live",
      events: mesh.events.query({ runId: instance.runId }),
      destroyAfter: true,
    })
  },
})

store.snapshotRun({
  run,
  worker,
  mode: "live",
  events: mesh.events.query({ runId: run.runId }),
  destroyAfter: true,
})

const lost = mesh.events.query({ runId: run.runId, type: "environment.lost" })
const sandboxes = mesh.events.query({ runId: run.runId, type: "solari.sandbox.created" })
console.log(`DONE run=${run.runId} status=${run.status} lost=${lost.length} sandboxes=${sandboxes.length} error=${run.error || ""}`)
if (run.status !== "COMPLETED" || lost.length < 1 || sandboxes.length < 2) {
  process.exitCode = 1
}
