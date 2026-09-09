import { Meshly } from "@meshly/sdk"
import { ProjectStore } from "../../packages/cli/src/store.js"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"

export interface TestResult {
  category: string
  name: string
  passed: boolean
  error?: string
}

export async function runProductExecuteTests(): Promise<{ passed: boolean; results: TestResult[] }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY PRODUCT LOOP (SIMULATOR) — WORKER → RUN → VERIFY → COMMIT")
  console.log("=".repeat(78) + "\n")

  const results: TestResult[] = []
  const assert = (name: string, condition: boolean, error?: string) => {
    results.push({ category: "PRODUCT", name, passed: condition, error: condition ? undefined : error || "failed" })
  }

  const mesh = new Meshly({ preferSimulator: true })
  const worker = await mesh.spawn({
    name: "research",
    task: "Open example.com and compute 2+2",
    capabilities: ["browser", "sandbox"],
    budget: 2,
  })

  const run = await worker.run({ destroyAfter: true })

  assert("worker.run() completes", run.status === "COMPLETED", run.error)
  assert("run records two environment steps", run.steps.length === 2, `got ${run.steps.length}`)
  assert("browser step committed", run.steps[0]?.status === "committed", run.steps[0]?.status)
  assert("sandbox step committed", run.steps[1]?.status === "committed", run.steps[1]?.status)
  assert("browser observation has a title", Boolean(run.steps[0]?.observation?.title), JSON.stringify(run.steps[0]?.observation))
  assert("sandbox observation is 4", String(run.steps[0 + 1]?.observation?.stdout).includes("4"), String(run.steps[1]?.observation?.stdout))
  assert("SDK mode is simulator", mesh.mode === "simulator")
  assert("run events include commit.committed", mesh.events.query({ runId: run.runId }).some((e) => e.type === "commit.committed"))

  const failMesh = new Meshly({ preferSimulator: true })
  const failWorker = await failMesh.spawn({
    name: "reality-check",
    task: "Confirm invoice 4421 is paid",
    capabilities: ["browser"],
    budget: 2,
  })
  const blocked = await failWorker.run({ destroyAfter: true, scenario: "reality-divergence" })
  assert("divergence run is BLOCKED", blocked.status === "BLOCKED", blocked.status)
  assert("agent still claimed success", blocked.steps[0]?.agentClaim === "SUCCESS", blocked.steps[0]?.agentClaim)
  assert("tool still reported success", blocked.steps[0]?.toolExecution === "SUCCESS", blocked.steps[0]?.toolExecution)
  assert("world state mismatched", blocked.steps[0]?.worldStateMatched === false)
  assert("commit was blocked", failMesh.events.query({ runId: blocked.runId }).some((e) => e.type === "commit.blocked"))

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-store-"))
  const store = new ProjectStore(dir)
  const config = store.init("demo")
  store.saveWorker({
    id: worker.id,
    name: "research",
    task: worker.task,
    capabilities: worker.capabilities,
    priority: 8,
    budget: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  assert("init writes config", config.name === "demo" && store.exists())
  assert("worker lookup by name", store.getWorker("research")?.id === worker.id)

  for (const r of results) {
    console.log(`  ${r.passed ? "✓" : "✗"} ${r.name}${r.passed ? "" : ` — ${r.error}`}`)
  }

  return { passed: results.every((r) => r.passed), results }
}
