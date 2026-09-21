/**
 * The experiment.
 *
 * For every scenario we run repeated trials under both execution models with
 * the same seed, the same task, the same environments, and the same starting
 * state. Scoring uses the world journal, never a model's self-report.
 *
 * The substrate is swappable: simulator by default, live Solari when the
 * caller supplies a fabric factory. The two are never mixed in one report.
 */
import type { ModeSummary, TrialResult, ScenarioId } from "./types.js"
import { createRng, deriveSeed } from "./rng.js"
import { BenchmarkFabric } from "./fabric.js"
import { SCENARIOS, type ScenarioSpec } from "./scenarios.js"
import { runDirectAgent } from "./direct.js"
import { runMeshlyWorker } from "./meshly-runner.js"
import { Meshly } from "@meshly/sdk"

export interface ExecutionTrialReport {
  report: import("./types.js").ExecutionBenchmarkReport
  trials: TrialResult[]
}

export interface EngineOptions {
  trials: number
  seed: number
  scenarioIds: ScenarioId[]
  concurrencyLevels: number[]
  concurrencyTrips: number
  /** Simulator by default. Live callers pass a Solari-backed factory. */
  createFabric?: () => BenchmarkFabric
  source?: "simulator" | "solari"
  /** Hard ceiling on environments provisioned. Aborts cleanly when reached. */
  maxSessions?: number
  /** Pause between the direct and governed arms so live infrastructure can free slots. */
  armSettleMs?: number
  onScenario?: (id: ScenarioId, index: number, total: number) => void
}

interface RunContext {
  createFabric: () => BenchmarkFabric
  maxSessions?: number
  settleMs: number
  sessions: number
  aborted: boolean
}

/**
 * Scenarios that are safe to run against a live Solari account without
 * deliberately orphaning sessions. Environment loss needs a real session to die
 * while a replacement is allocated (3 VMs at once), and contention deliberately
 * exhausts the pool. Both stay simulator-only by default.
 */
export const LIVE_SAFE_SCENARIOS: ScenarioId[] = [
  "success",
  "reality_divergence",
  "ambiguous_timeout",
  "authority_violation",
  "runaway_retry",
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runExecutionBenchmark(options: EngineOptions): Promise<ExecutionTrialReport> {
  const trials: TrialResult[] = []
  const scenarioReports: import("./types.js").ScenarioReport[] = []
  const scenarios = options.scenarioIds.filter((id) => SCENARIOS[id])
  let scenarioIndex = 0

  const ctx: RunContext = {
    createFabric: options.createFabric ?? (() => new BenchmarkFabric()),
    maxSessions: options.maxSessions,
    settleMs: options.armSettleMs ?? 0,
    sessions: 0,
    aborted: false,
  }
  const source = options.source ?? "simulator"

  for (const id of scenarios) {
    scenarioIndex += 1
    options.onScenario?.(id, scenarioIndex, scenarios.length)
    const spec = SCENARIOS[id]
    const results =
      id === "concurrent_contention"
        ? await runContention(spec, options, ctx)
        : await runSingleScenario(spec, options, ctx)
    trials.push(...results)

    const direct = summarize(results.filter((r) => r.mode === "direct"))
    const meshly = summarize(results.filter((r) => r.mode === "meshly"))
    scenarioReports.push({
      id,
      title: spec.title,
      description: spec.description,
      truthKind: spec.truthKind,
      truthDetail: spec.truthDetail,
      trials: results.filter((r) => r.mode === "direct").length,
      governanceOverheadMs: Math.round(meshly.medianLatencyMs - direct.medianLatencyMs),
      modes: { direct, meshly },
    })
  }

  const notes =
    source === "simulator"
      ? [
          "Simulator execution: deterministic local substrate, not a live Solari capacity test.",
          "Both arms run the same task, the same environments, the same tool surface, and the same fault.",
          "Ground truth is read from the world journal, never from either model's claim.",
          "Real Solari results must be generated and labelled separately.",
        ]
      : [
          "Live Solari execution. Real cloud browsers, sandboxes, and desktops were provisioned and released.",
          "Both arms run the same task, the same environments, the same tool surface, and the same fault.",
          "Ground truth is read from the world journal, never from either model's claim.",
          `Scenarios: ${scenarios.join(", ")}. Environment loss and contention are simulator-only by default.`,
          "Latency and cost on live infrastructure are not comparable to the simulator run.",
        ]

  const report: import("./types.js").ExecutionBenchmarkReport = {
    suite: "execution",
    source,
    generatedAt: new Date().toISOString(),
    meshlyVersion: "0.1.0",
    seed: options.seed,
    scenarioIds: scenarios,
    scenarios: scenarioReports,
    sessionsCreated: ctx.sessions,
    notes,
  }

  return { report, trials }
}

async function runSingleScenario(spec: ScenarioSpec, options: EngineOptions, ctx: RunContext): Promise<TrialResult[]> {
  const results: TrialResult[] = []
  for (let trial = 0; trial < options.trials; trial++) {
    if (budgetReached(ctx)) {
      ctx.aborted = true
      break
    }
    const seed = deriveSeed(options.seed, spec.id, trial)
    const rng = createRng(seed)
    // Keep the RNG draw so future fault placement stays reproducible per trial.
    void rng.next()
    results.push(await runDirectTrial(spec, trial, seed, ctx))
    if (ctx.settleMs > 0) await sleep(ctx.settleMs)
    if (budgetReached(ctx)) {
      ctx.aborted = true
      break
    }
    results.push(await runMeshlyTrial(spec, trial, seed, ctx))
    if (ctx.settleMs > 0) await sleep(ctx.settleMs)
  }
  return results
}

async function runDirectTrial(spec: ScenarioSpec, trial: number, seed: number, ctx: RunContext): Promise<TrialResult> {
  const fabric = ctx.createFabric()
  fabric.beginTrial(spec.fault)
  const steps = spec.program().steps
  const authority = spec.authority()
  const result = await runDirectAgent({
    fabric,
    steps,
    policy: authority,
    naiveMaxRetries: spec.naiveMaxRetries,
    maxRestarts: spec.naiveMaxRestarts,
    budgetUsd: spec.budgetUsd,
  })
  const writes = fabric.journal()
  const stats = fabric.stats()
  await fabric.dispose()
  ctx.sessions += stats.created
  const truth = spec.truth({
    claimedSuccess: result.claimedSuccess,
    writes,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    completed: result.status === "COMMITTED",
  })
  const duplicates = BenchmarkFabric.duplicates(writes)

  return {
    scenario: spec.id,
    mode: "direct",
    trial,
    seed,
    status: result.status,
    claimedSuccess: result.claimedSuccess,
    correctFinalState: truth.correct,
    falseCommit: truth.correct ? false : result.claimedSuccess && spec.truthKind === "world",
    duplicateSideEffects: duplicates,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    recoveredFromLoss: result.recoveredFromLoss,
    unknownResolved: result.unknownResolved,
    budgetViolation: result.budgetViolation,
    toolCalls: result.toolCalls,
    retries: result.retries,
    spendUsd: round(result.spendUsd),
    latencyMs: result.latencyMs,
    environmentsCreated: stats.created,
    environmentReuses: 0,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: result.lostProgressSteps,
    unitsRequested: 1,
    unitsCompleted: result.claimedSuccess ? 1 : 0,
    error: result.error,
  }
}

async function runMeshlyTrial(spec: ScenarioSpec, trial: number, seed: number, ctx: RunContext): Promise<TrialResult> {
  const fabric = ctx.createFabric()
  fabric.beginTrial(spec.fault)
  const authority = spec.authority()
  const result = await runMeshlyWorker({
    fabric,
    task: spec.task,
    kind: spec.kind,
    capabilities: spec.capabilities,
    scenario: spec.executeScenario,
    authority,
    budgetUsd: spec.budgetUsd,
    limits: spec.meshlyLimits,
  })
  const writes = fabric.journal()
  const stats = fabric.stats()
  await fabric.dispose()
  ctx.sessions += stats.created
  const truth = spec.truth({
    claimedSuccess: result.claimedSuccess,
    writes,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    completed: result.claimedSuccess,
  })
  const duplicates = BenchmarkFabric.duplicates(writes)

  return {
    scenario: spec.id,
    mode: "meshly",
    trial,
    seed,
    status: result.status,
    claimedSuccess: result.claimedSuccess,
    correctFinalState: truth.correct,
    falseCommit: truth.correct ? false : result.claimedSuccess && spec.truthKind === "world",
    duplicateSideEffects: duplicates,
    unauthorizedActionsExecuted: result.unauthorizedActionsExecuted,
    recoveredFromLoss: result.recoveredFromLoss,
    unknownResolved: result.unknownResolved,
    budgetViolation: result.budgetViolation,
    toolCalls: result.toolCalls,
    retries: result.retries,
    spendUsd: round(result.spendUsd),
    latencyMs: result.latencyMs,
    environmentsCreated: stats.created,
    environmentReuses: result.environmentReuses,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: result.lostProgressSteps,
    unitsRequested: 1,
    unitsCompleted: result.claimedSuccess ? 1 : 0,
    error: result.error,
  }
}

async function runContention(spec: ScenarioSpec, options: EngineOptions, ctx: RunContext): Promise<TrialResult[]> {
  const results: TrialResult[] = []
  const levels = options.concurrencyLevels?.length ? options.concurrencyLevels : (spec.concurrencyLevels ?? options.concurrencyLevels)
  let trip = 0
  for (const level of levels) {
    for (let i = 0; i < options.concurrencyTrips; i++) {
      if (budgetReached(ctx)) {
        ctx.aborted = true
        return results
      }
      trip += 1
      const seed = deriveSeed(options.seed, spec.id, level, i)
      results.push(await contentionDirect(spec, level, trip, seed, ctx))
      results.push(await contentionMeshly(spec, level, trip, seed, ctx))
    }
  }
  return results
}

async function contentionDirect(spec: ScenarioSpec, level: number, trial: number, seed: number, ctx: RunContext): Promise<TrialResult> {
  const fabric = ctx.createFabric()
  fabric.beginTrial(spec.fault)
  const steps = spec.program().steps
  const started = Date.now()

  const runs = await Promise.all(
    Array.from({ length: level }, () =>
      runDirectAgent({
        fabric,
        steps,
        policy: undefined,
        naiveMaxRetries: spec.naiveMaxRetries,
        maxRestarts: spec.naiveMaxRestarts,
        budgetUsd: spec.budgetUsd,
      }),
    ),
  )
  const stats = fabric.stats()
  await fabric.dispose()
  ctx.sessions += stats.created
  const completed = runs.every((r) => r.claimedSuccess)
  const truth = spec.truth({ claimedSuccess: completed, writes: [], unauthorizedActionsExecuted: 0, completed })

  return {
    scenario: spec.id,
    mode: "direct",
    trial,
    seed,
    status: completed ? "COMMITTED" : "PARTIAL",
    claimedSuccess: completed,
    correctFinalState: truth.correct,
    falseCommit: false,
    duplicateSideEffects: 0,
    unauthorizedActionsExecuted: 0,
    recoveredFromLoss: false,
    unknownResolved: false,
    budgetViolation: runs.some((r) => r.budgetViolation),
    toolCalls: sum(runs.map((r) => r.toolCalls)),
    retries: sum(runs.map((r) => r.retries)),
    spendUsd: round(sum(runs.map((r) => r.spendUsd))),
    latencyMs: Date.now() - started,
    environmentsCreated: stats.created,
    environmentReuses: 0,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: sum(runs.map((r) => r.lostProgressSteps)),
    unitsRequested: level,
    unitsCompleted: runs.filter((r) => r.claimedSuccess).length,
    error: completed ? undefined : `${runs.filter((r) => !r.claimedSuccess).length}/${level} failed to allocate`,
  }
}

async function contentionMeshly(spec: ScenarioSpec, level: number, trial: number, seed: number, ctx: RunContext): Promise<TrialResult> {
  const fabric = ctx.createFabric()
  fabric.beginTrial(spec.fault)
  const mesh = new Meshly({ executionFabric: fabric, maxConcurrency: level })
  const started = Date.now()

  const workers = await Promise.all(
    Array.from({ length: level }, (_, i) =>
      mesh.spawn({
        name: `bench-contend-${i}`,
        kind: "probe" as any,
        task: spec.task,
        capabilities: spec.capabilities,
        budget: spec.budgetUsd,
      }),
    ),
  )

  const runs = new Map<string, import("@meshly/sdk").RunInstance>()
  await Promise.all(
    workers.map(async (worker) => {
      const run = await worker.run({ destroyAfter: true })
      runs.set(worker.id, run)
    }),
  )

  for (let attempt = 0; attempt < 60; attempt++) {
    const waiting = [...runs.values()].filter((r) => r.status === "WAITING")
    if (waiting.length === 0) break
    await sleep(5)
    await Promise.all(
      waiting.map(async (run) => {
        const resumed = await mesh.resume(run.runId, { destroyAfter: true })
        runs.set(run.workerId, resumed)
      }),
    )
  }

  const all = [...runs.values()]
  const completed = all.length === level && all.every((r) => r.status === "COMPLETED")
  const stats = fabric.stats()
  await fabric.dispose()
  ctx.sessions += stats.created
  const truth = spec.truth({ claimedSuccess: completed, writes: [], unauthorizedActionsExecuted: 0, completed })
  const events = mesh.events.query({})
  const dispatches = events.filter((e) => e.type === "action.executed").length

  return {
    scenario: spec.id,
    mode: "meshly",
    trial,
    seed,
    status: completed ? "COMPLETED" : "PARTIAL",
    claimedSuccess: completed,
    correctFinalState: truth.correct,
    falseCommit: false,
    duplicateSideEffects: 0,
    unauthorizedActionsExecuted: 0,
    recoveredFromLoss: false,
    unknownResolved: false,
    budgetViolation: false,
    toolCalls: dispatches,
    retries: sum(all.map((r) => r.retries || 0)),
    spendUsd: round(sum(all.map((r) => mesh.workers.get(r.workerId)?.budget.spent ?? 0))),
    latencyMs: Date.now() - started,
    environmentsCreated: stats.created,
    environmentReuses: events.filter((e) => e.type === "environment.reused").length,
    orphanEnvironments: stats.active,
    failedAllocations: stats.failedAllocations,
    peakConcurrentEnvironments: stats.peak,
    lostProgressSteps: 0,
    unitsRequested: level,
    unitsCompleted: all.filter((r) => r.status === "COMPLETED").length,
    error: completed ? undefined : `${runs.size - [...runs.values()].filter((r) => r.status === "COMPLETED").length}/${level} did not complete`,
  }
}

function budgetReached(ctx: RunContext): boolean {
  return ctx.maxSessions !== undefined && ctx.sessions >= ctx.maxSessions
}

export function summarize(results: TrialResult[]): ModeSummary {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)
  const requested = sum(results.map((r) => r.unitsRequested))
  const completed = sum(results.map((r) => r.unitsCompleted))
  const created = sum(results.map((r) => r.environmentsCreated))
  const spend = sum(results.map((r) => r.spendUsd))
  const failed = sum(results.map((r) => r.failedAllocations))
  return {
    trials: results.length,
    unitsRequested: requested,
    unitsCompleted: completed,
    environmentsPerCompletion: round(created / Math.max(1, completed)),
    spendPerCompletion: round(spend / Math.max(1, completed)),
    failedAllocationsPerCompletion: round(failed / Math.max(1, completed)),
    successRate: rate(results, (r) => r.claimedSuccess),
    correctFinalStateRate: rate(results, (r) => r.correctFinalState),
    falseCommitRate: rate(results, (r) => r.falseCommit),
    duplicateSideEffectRate: rate(results, (r) => r.duplicateSideEffects > 0),
    meanDuplicateSideEffects: mean(results.map((r) => r.duplicateSideEffects)),
    unauthorizedActionRate: rate(results, (r) => r.unauthorizedActionsExecuted > 0),
    meanUnauthorizedActions: mean(results.map((r) => r.unauthorizedActionsExecuted)),
    recoveryRate: rate(results, (r) => r.recoveredFromLoss),
    unknownResolutionRate: rate(results, (r) => r.unknownResolved),
    budgetViolationRate: rate(results, (r) => r.budgetViolation),
    meanToolCalls: mean(results.map((r) => r.toolCalls)),
    meanRetries: mean(results.map((r) => r.retries)),
    medianLatencyMs: median(latencies),
    p95LatencyMs: percentile(latencies, 95),
    meanSpendUsd: round(mean(results.map((r) => r.spendUsd))),
    meanEnvironmentsCreated: round(mean(results.map((r) => r.environmentsCreated))),
    meanEnvironmentReuses: round(mean(results.map((r) => r.environmentReuses))),
    meanPeakConcurrentEnvironments: round(mean(results.map((r) => r.peakConcurrentEnvironments))),
    meanFailedAllocations: round(mean(results.map((r) => r.failedAllocations))),
    meanOrphanEnvironments: round(mean(results.map((r) => r.orphanEnvironments))),
    meanLostProgressSteps: round(mean(results.map((r) => r.lostProgressSteps))),
  }
}

function rate(results: TrialResult[], predicate: (r: TrialResult) => boolean): number {
  if (results.length === 0) return 0
  return round(results.filter(predicate).length / results.length)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return round(values.reduce((a, b) => a + b, 0) / values.length)
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
