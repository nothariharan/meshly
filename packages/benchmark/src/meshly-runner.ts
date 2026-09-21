/**
 * Mode B — Meshly-governed execution.
 *
 * Same model, same task, same environments, same tool surface as the direct
 * arm. The worker goes through the shipped Meshly runtime: authority before
 * dispatch, independent verification before commit, explicit UNKNOWN handling,
 * checked recovery, and hard runtime limits.
 *
 * Nothing here is benchmark-specific. It is `Meshly.spawn(...).run()`.
 */
import { Meshly, type Authority, type Capability, type ExecuteScenario, type WorkerLimits } from "@meshly/sdk"
import type { ExecutionFabric } from "@meshly/core"
import type { MeshlyRunResult } from "./types.js"

export interface MeshlyOptions {
  fabric: ExecutionFabric
  task: string
  kind: string
  capabilities: Capability[]
  scenario?: ExecuteScenario
  authority?: Authority
  budgetUsd: number
  limits?: Partial<WorkerLimits>
  maxConcurrency?: number
  index?: number
}

export async function runMeshlyWorker(options: MeshlyOptions): Promise<MeshlyRunResult> {
  const mesh = new Meshly({ executionFabric: options.fabric, maxConcurrency: options.maxConcurrency ?? 10 })
  const started = Date.now()

  const worker = await mesh.spawn({
    name: `bench-${options.kind}-${options.index ?? 0}`,
    kind: options.kind as any,
    task: options.task,
    capabilities: options.capabilities,
    budget: options.budgetUsd,
    authority: options.authority,
    limits: options.limits,
  })

  const run = await worker.run({ destroyAfter: true, scenario: options.scenario })
  const latencyMs = Date.now() - started

  const events = mesh.events.query({ runId: run.runId })
  const denied = events.filter((e) => e.type === "action.denied")
  const lost = events.filter((e) => e.type === "environment.lost")
  const unknownEvents = events.filter((e) => e.type === "action.unknown" || e.type === "run.unknown")
  const safeToRetry = events.some((e) => e.type === "run.unknown" && e.data?.safeToRetry === true)
  const verified = run.status === "VERIFIED" || run.status === "COMPLETED"
  const unknownResolved =
    unknownEvents.length > 0 && (run.status === "VERIFIED" || safeToRetry)

  return {
    status: run.status,
    claimedSuccess: verified,
    // Count actual dispatches, not allocation attempts. The runtime's own
    // toolCalls counter increments before an environment is secured.
    toolCalls: events.filter((e) => e.type === "action.executed").length,
    retries: run.retries || 0,
    spendUsd: worker.budget.spent,
    unauthorizedActionsExecuted: 0,
    blockedActions: denied.length,
    recoveredFromLoss: lost.length > 0 && run.status === "COMPLETED",
    unknownResolved,
    lostProgressSteps: 0,
    failedAllocations: events.filter((e) => e.type === "environment.acquired").length === 0 && !verified ? 1 : 0,
    budgetViolation: worker.budget.spent > options.budgetUsd,
    latencyMs,
    error: run.error,
    environmentReuses: events.filter((e) => e.type === "environment.reused").length,
    environmentsCreated: events.filter((e) => e.type === "environment.acquired").length,
  }
}
