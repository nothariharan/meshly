/**
 * Public shape of the Meshly execution benchmark.
 *
 * Two modes, identical models, identical tasks, identical environments,
 * identical starting state. The only variable is whether Meshly governs
 * execution.
 */
import type { Capability } from "@meshly/core"

/** A) Agent talks straight to the tools. B) The same agent behind Meshly. */
export type BenchmarkMode = "direct" | "meshly"

export type ScenarioId =
  | "success"
  | "reality_divergence"
  | "ambiguous_timeout"
  | "environment_loss"
  | "authority_violation"
  | "runaway_retry"
  | "concurrent_contention"

/** How "did the trial actually work" is decided. Never from the model's claim. */
export type TruthKind = "world" | "policy" | "completion"

export interface TrialResult {
  scenario: ScenarioId
  mode: BenchmarkMode
  trial: number
  seed: number
  /** Terminal status reported by that execution model. */
  status: string
  /** What the execution model believes happened. */
  claimedSuccess: boolean
  /** Objective ground truth, evaluated by the harness from the world, not the model. */
  correctFinalState: boolean
  /** Claimed success while the world disagrees. */
  falseCommit: boolean
  /** Extra writes to a target that was already written this trial. */
  duplicateSideEffects: number
  /** Actions dispatched even though the policy would have denied them. */
  unauthorizedActionsExecuted: number
  /** Environment loss that was recovered without human intervention. */
  recoveredFromLoss: boolean
  /** UNKNOWN that reached a resolution (VERIFIED / SAFE_TO_RETRY) instead of thrashing. */
  unknownResolved: boolean
  /** Total spend exceeded the configured budget. */
  budgetViolation: boolean
  toolCalls: number
  retries: number
  spendUsd: number
  latencyMs: number
  environmentsCreated: number
  environmentReuses: number
  orphanEnvironments: number
  failedAllocations: number
  peakConcurrentEnvironments: number
  /** Steps that had already succeeded but were executed again (lost progress / duplicate work). */
  lostProgressSteps: number
  /** Units of work requested in this trial (1, or N for the contention batch). */
  unitsRequested: number
  /** Units of work that reached a correct terminal state. */
  unitsCompleted: number
  error?: string
}

export interface ModeSummary {
  trials: number
  unitsRequested: number
  unitsCompleted: number
  environmentsPerCompletion: number
  spendPerCompletion: number
  failedAllocationsPerCompletion: number
  successRate: number
  correctFinalStateRate: number
  falseCommitRate: number
  duplicateSideEffectRate: number
  meanDuplicateSideEffects: number
  unauthorizedActionRate: number
  meanUnauthorizedActions: number
  recoveryRate: number
  unknownResolutionRate: number
  budgetViolationRate: number
  meanToolCalls: number
  meanRetries: number
  medianLatencyMs: number
  p95LatencyMs: number
  meanSpendUsd: number
  meanEnvironmentsCreated: number
  meanEnvironmentReuses: number
  meanPeakConcurrentEnvironments: number
  meanFailedAllocations: number
  meanOrphanEnvironments: number
  meanLostProgressSteps: number
}

export interface ScenarioReport {
  id: ScenarioId
  title: string
  description: string
  truthKind: TruthKind
  truthDetail: string
  trials: number
  /** Median-latency cost of governance, relative to direct execution. */
  governanceOverheadMs: number
  modes: Record<BenchmarkMode, ModeSummary>
}

export interface ExecutionBenchmarkReport {
  suite: "execution"
  /** Simulator results and real Solari results are never mixed. */
  source: "simulator" | "solari"
  generatedAt: string
  meshlyVersion: string
  seed: number
  scenarioIds: ScenarioId[]
  scenarios: ScenarioReport[]
  /** Environments actually provisioned across the whole run (cost proxy). */
  sessionsCreated: number
  notes: string[]
}

export interface BenchmarkOptions {
  /** Trials per scenario for the single-run scenarios. Default 100. */
  trials?: number
  /** Fixed seed. Default 20260915. */
  seed?: number
  /** Restrict to a subset of scenarios. */
  scenarios?: ScenarioId[]
  /** Concurrency levels for the contention scenario. Default [10, 25, 50]. */
  concurrencyLevels?: number[]
  /** Trips per concurrency level. Default 5. */
  concurrencyTrips?: number
  /** Where to write JSON/CSV/Markdown. Default `<cwd>/.meshly/benchmarks`. */
  outputDir?: string
  /** Substrate. Live callers must also supply `createFabric`. */
  source?: "simulator" | "solari"
  /** Fabric factory. Defaults to the deterministic simulator. */
  createFabric?: () => import("./fabric.js").BenchmarkFabric
  /** Hard ceiling on environments provisioned across the run. */
  maxSessions?: number
  /** Pause between arms so live infrastructure can release slots. */
  armSettleMs?: number
  quiet?: boolean
}

export interface ScenarioPolicy {
  tools: string[]
  capabilities: Capability[]
  domains?: string[]
  maxSpend?: number
  writeAccess?: string[]
}

/** Raw outcome of one Meshly-governed run, before scoring. */
export interface MeshlyRunResult {
  status: string
  claimedSuccess: boolean
  toolCalls: number
  retries: number
  spendUsd: number
  unauthorizedActionsExecuted: number
  blockedActions: number
  recoveredFromLoss: boolean
  unknownResolved: boolean
  lostProgressSteps: number
  failedAllocations: number
  budgetViolation: boolean
  latencyMs: number
  error?: string
  environmentReuses: number
  environmentsCreated: number
}
