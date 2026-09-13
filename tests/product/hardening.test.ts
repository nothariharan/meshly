/**
 * Product hardening: limits, recovery, frozen API, independent workers, MCP names.
 */
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { Meshly, MESHLY_MCP_TOOLS, ProjectStore } from "@meshly/sdk"
import { runResearchWorker } from "../../examples/workers/research.ts"
import { runCodingWorker } from "../../examples/workers/coding.ts"
import { runOperationsWorker } from "../../examples/workers/operations.ts"

export async function runHardeningTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY HARDENING — LIMITS, RECOVERY, PUBLIC API")
  console.log("=".repeat(78) + "\n")

  let passed = true
  const ok = (name: string, cond: boolean, detail?: string) => {
    if (cond) console.log(`  ✓ ${name}`)
    else {
      passed = false
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
    }
  }

  const mesh = new Meshly({ preferSimulator: true })
  const worker = await mesh.workers.spawn({
    name: "api",
    task: "Open example.com",
    capabilities: ["browser"],
  })
  const run = await worker.run({ destroyAfter: true })
  ok("frozen spawn/run", typeof worker.run === "function" && run.status === "COMPLETED", run.status)
  ok("frozen run.pause/resume/verify/cancel", typeof run.pause === "function" && typeof run.resume === "function" && typeof run.verify === "function" && typeof run.cancel === "function")
  ok("run.status is first-class", typeof run.status === "string")
  const verified = await run.verify()
  ok("run.verify() does not retry side effects", verified.matched === true)

  const spendMesh = new Meshly({ preferSimulator: true })
  const cheap = await spendMesh.workers.spawn({
    name: "cheap",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    budget: 0.01,
  })
  const overspent = await cheap.run({ destroyAfter: true })
  ok("max spend blocks execution", overspent.status === "FAILED", overspent.status + " " + overspent.error)
  ok("limit.exceeded event", spendMesh.events.query({ type: "limit.exceeded" }).length > 0)

  const envMesh = new Meshly({ preferSimulator: true })
  const oneEnv = await envMesh.workers.spawn({
    name: "one-env",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    limits: { maxEnvironments: 1 },
  })
  const capped = await oneEnv.run({ destroyAfter: true })
  ok("max environments blocks extra leases", capped.status === "FAILED", capped.status + " " + capped.error)

  const concurrent = new Meshly({ preferSimulator: true, maxConcurrency: 0 })
  const blocked = await concurrent.workers.spawn({
    name: "blocked",
    task: "Open example.com",
    capabilities: ["browser"],
  })
  let threw = false
  try {
    await blocked.run({ destroyAfter: true })
  } catch (err) {
    threw = String(err).includes("Concurrent worker limit")
  }
  ok("max concurrent workers is a hard cap", threw)

  const crashMesh = new Meshly({ preferSimulator: true })
  const invoice = await crashMesh.workers.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  const ac = new AbortController()
  const crashed = await invoice.run({
    destroyAfter: false,
    signal: ac.signal,
    onProgress: (instance) => {
      const committed = instance.steps.filter((s) => s.status === "committed").length
      if (committed >= 1 && !ac.signal.aborted) ac.abort()
    },
  })
  ok("killed mid-run is PAUSED", crashed.status === "PAUSED", crashed.status)
  ok("checkpoint exists after crash", crashed.checkpoints.length >= 1, String(crashed.checkpoints.length))
  ok("at least one committed step survived", crashed.steps.some((s) => s.status === "committed"))

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-recovery-"))
  const store = new ProjectStore(dir)
  crashMesh.runtime.persist(store)

  const revived = new Meshly({ preferSimulator: true })
  const restored = await revived.restore(store)
  ok("restore reloads worker + run identity", restored.workers >= 1 && restored.runs >= 1)
  const resumed = await revived.runtime.resumeRun(crashed.runId, { destroyAfter: true })
  ok("resume from checkpoint completes remaining work", resumed.status === "COMPLETED", resumed.status + " " + resumed.error)
  ok("resumed run kept the original run id", resumed.runId === crashed.runId)

  const lostMesh = new Meshly({ preferSimulator: true })
  const lostWorker = await lostMesh.workers.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  let crashedSandbox = false
  const unsub = lostMesh.events.subscribe((event) => {
    if (event.type === "solari.sandbox.created" && !crashedSandbox && event.environmentId) {
      crashedSandbox = true
      void lostMesh.failures.inject({ type: "CRASH_ENVIRONMENT", targetEnvironmentId: event.environmentId })
    }
  })
  const recovered = await lostWorker.run({ destroyAfter: true })
  unsub()
  ok("environment lost during sandbox is recovered", recovered.status === "COMPLETED", recovered.status + " " + recovered.error)
  ok("environment.lost was recorded", lostMesh.events.query({ type: "environment.lost" }).length >= 1)
  ok("replacement sandbox was allocated", lostMesh.events.query({ type: "solari.sandbox.created" }).length >= 2)

  const lostDesktopMesh = new Meshly({ preferSimulator: true })
  const lostDesktopWorker = await lostDesktopMesh.workers.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  let crashedDesktop = false
  const unsubDesktop = lostDesktopMesh.events.subscribe((event) => {
    if (event.type === "solari.desktop.created" && !crashedDesktop && event.environmentId) {
      crashedDesktop = true
      void lostDesktopMesh.failures.inject({ type: "CRASH_ENVIRONMENT", targetEnvironmentId: event.environmentId })
    }
  })
  const recoveredDesktop = await lostDesktopWorker.run({ destroyAfter: true })
  unsubDesktop()
  ok(
    "desktop lost before a write is retried on a replacement, not marked UNKNOWN",
    recoveredDesktop.status === "COMPLETED",
    recoveredDesktop.status + " " + recoveredDesktop.error,
  )
  ok("replacement desktop was allocated", lostDesktopMesh.events.query({ type: "solari.desktop.created" }).length >= 2)

  const research = await runResearchWorker(new Meshly({ preferSimulator: true }))
  ok("research worker uses only public API", research.status === "COMPLETED", research.error)
  const coding = await runCodingWorker(new Meshly({ preferSimulator: true }))
  ok("coding worker uses only public API", coding.status === "COMPLETED", coding.error)
  const operations = await runOperationsWorker(new Meshly({ preferSimulator: true }))
  ok("operations worker uses only public API", operations.status === "COMPLETED", operations.error)

  const names = MESHLY_MCP_TOOLS.map((t) => t.name)
  for (const tool of ["meshly_create_worker", "meshly_run", "meshly_get_run", "meshly_verify", "meshly_pause", "meshly_resume", "meshly_takeover"]) {
    ok(`MCP ${tool}`, names.includes(tool))
  }

  return { passed }
}
