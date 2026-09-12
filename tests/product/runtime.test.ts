import { Meshly, explainDecision, formatDecision, formatUserError, MeshlyError, isUnknownStatus } from "@meshly/sdk"
import { ProjectStore } from "../../packages/core/src/persist/store.js"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"

export async function runRuntimeProductTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY RUNTIME — WORKERS, UNKNOWN, PERSISTENCE")
  console.log("=".repeat(78) + "\n")

  let passed = true
  const ok = (name: string, cond: boolean, detail?: string) => {
    if (cond) console.log(`  ✓ ${name}`)
    else {
      passed = false
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
    }
  }

  const reconMesh = new Meshly({ preferSimulator: true })
  const recon = await reconMesh.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  const committed = await recon.run({ destroyAfter: true })
  ok("reconciliation commits when ERP is POSTED", committed.status === "COMPLETED", committed.status + " " + committed.error)
  ok("reconciliation used three environments", committed.steps.length === 3, String(committed.steps.length))
  ok("final ERP is POSTED", committed.steps[2]?.observation?.erp_status === "POSTED", JSON.stringify(committed.steps[2]?.observation))

  const timeoutMesh = new Meshly({ preferSimulator: true })
  const timeoutWorker = await timeoutMesh.spawn({
    name: "timeout",
    task: "ambiguous timeout experiment",
    capabilities: ["desktop"],
  })
  const unknown = await timeoutWorker.run({ destroyAfter: false, scenario: "ambiguous-timeout" })
  ok("timeout run is first-class UNKNOWN or VERIFIED", unknown.status === "VERIFIED" || unknown.status === "UNKNOWN", unknown.status)
  ok("no automatic retry event after UNKNOWN", !timeoutMesh.events.query({ runId: unknown.runId }).some((e) => e.type === "action.executed" && e.data?.retry === true))
  ok("independent verification ran", timeoutMesh.events.query({ runId: unknown.runId }).some((e) => e.type === "verification.independent"))
  ok("side effect found → VERIFIED", unknown.status === "VERIFIED", unknown.status)
  ok("UNKNOWN is not FAILED", unknown.status !== "FAILED")
  ok("run.unknown is false after VERIFIED", unknown.unknown === false)
  const unknownWhy = formatDecision(unknown.explain({ policy: "finance.reconcile", authority: unknown.workerId }))
  ok("UNKNOWN explanation says not FAILED", unknownWhy.includes("UNKNOWN does not mean FAILED") && unknownWhy.includes("Independent verification"))
  const recheck = await unknown.verify()
  ok("run.verify does not retry the side effect", recheck.matched === true)
  const resumedVerified = await unknown.resume()
  ok("resume of VERIFIED is idempotent", resumedVerified.runId === unknown.runId && resumedVerified.status === "VERIFIED")

  const blockedMesh = new Meshly({ preferSimulator: true })
  const blockedWorker = await blockedMesh.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  const blocked = await blockedWorker.run({ destroyAfter: true, scenario: "reality-divergence" })
  const blockedWhy = formatDecision(explainDecision(blocked, { policy: "finance.reconcile", authority: blocked.workerId }))
  ok("blocked decision is COMMIT BLOCKED", blocked.status === "BLOCKED" && blockedWhy.includes("COMMIT BLOCKED"))
  ok("blocked explanation names ERP mismatch", blockedWhy.includes("UNPAID") && blockedWhy.includes("finance.reconcile"))

  const committedWhy = formatDecision(explainDecision(committed, { policy: "finance.reconcile", authority: committed.workerId }))
  ok("committed decision is explainable", committedWhy.includes("Commit was allowed."))

  const capacity = formatUserError(
    new MeshlyError({
      code: "CONCURRENCY_LIMIT",
      title: "Meshly could not allocate a Desktop environment.",
      reason: "Solari concurrency limit reached.",
      runId: "run_8721",
      action: "The worker was placed in WAITING state.\nNo work was lost.",
      retry: "meshly resume run_8721",
    }),
  )
  ok("user-facing concurrency error", capacity.includes("Solari concurrency limit reached.") && capacity.includes("meshly resume run_8721"))
  ok("isUnknownStatus", isUnknownStatus("UNKNOWN") && !isUnknownStatus("FAILED"))

  const research = await new Meshly({ preferSimulator: true }).spawn({
    name: "research",
    kind: "research",
    task: "Collect information and write a verified report",
    capabilities: ["browser", "sandbox"],
  })
  const researchRun = await research.run({ destroyAfter: true })
  ok("research worker completes without kernel changes", researchRun.status === "COMPLETED", researchRun.error)

  const coding = await new Meshly({ preferSimulator: true }).spawn({
    name: "coding",
    kind: "coding",
    task: "Modify a repository, run tests, and browser-QA the artifact",
    capabilities: ["sandbox", "browser"],
  })
  const codingRun = await coding.run({ destroyAfter: true })
  ok("coding worker completes without kernel changes", codingRun.status === "COMPLETED", codingRun.error)

  const ops = await new Meshly({ preferSimulator: true }).spawn({
    name: "operations",
    kind: "operations",
    task: "Operations worker: system lookup and desktop ticket",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  const opsRun = await ops.run({ destroyAfter: true })
  ok("operations worker completes without kernel changes", opsRun.status === "COMPLETED", opsRun.error)

  const persistMesh = new Meshly({ preferSimulator: true })
  const persistWorker = await persistMesh.spawn({
    name: "durable",
    task: "Open example.com and compute 2+2",
    capabilities: ["browser", "sandbox"],
  })
  const persistRun = await persistWorker.run({ destroyAfter: false })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-hydrate-"))
  const store = new ProjectStore(dir)
  store.init("hydrate-test", "simulator")
  persistMesh.runtime.persist(store)

  const restoredMesh = new Meshly({ preferSimulator: true })
  const restored = await restoredMesh.restore(store)
  ok("restart loads workers", restored.workers >= 1, String(restored.workers))
  ok("restart loads runs", restored.runs >= 1, String(restored.runs))
  ok("restored worker identity", Boolean(restoredMesh.workers.get(persistWorker.id)))
  ok("restored run identity", Boolean(restoredMesh.runs.get(persistRun.runId)))

  const spawned = await persistMesh.workers.spawn({
    task: "listable",
    capabilities: ["browser"],
  })
  ok("mesh.workers.spawn", Boolean(spawned.id))
  ok("mesh.workers.get", persistMesh.workers.get(spawned.id)?.id === spawned.id)
  ok("mesh.workers.list", persistMesh.workers.list().some((w) => w.id === spawned.id))

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "RUNTIME PRODUCT CHECKS PASSED" : "FAILURES ENCOUNTERED"}`)
  console.log("=".repeat(78) + "\n")
  return { passed }
}

if (process.argv[1]?.includes("runtime-product")) {
  runRuntimeProductTests().then((res) => process.exit(res.passed ? 0 : 1))
}
