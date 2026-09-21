/**
 * The benchmark's scenarios.
 *
 * Each scenario pins one execution hazard, then defines the objective ground
 * truth used to score both models. Neither model's self-report is trusted.
 */
import {
  AuthorityManager,
  resolveProgram,
  type Authority,
  type Capability,
  type EnvironmentType,
  type ExecuteScenario,
  type WorkerLimits,
  type WorkerProgram,
} from "@meshly/core"
import type { FabricFault, WriteRecord } from "./fabric.js"
import type { ScenarioId, ScenarioPolicy, TruthKind } from "./types.js"

export interface TruthInput {
  claimedSuccess: boolean
  writes: WriteRecord[]
  unauthorizedActionsExecuted: number
  completed: boolean
}

export interface ScenarioSpec {
  id: ScenarioId
  title: string
  description: string
  truthKind: TruthKind
  truthDetail: string
  kind: string
  executeScenario?: ExecuteScenario
  task: string
  capabilities: Capability[]
  policy?: ScenarioPolicy
  fault?: FabricFault
  /** How many times a naive agent re-dispatches an action whose outcome is UNKNOWN. */
  naiveMaxRetries: number
  /** How many times a naive agent restarts the whole program after an environment dies. */
  naiveMaxRestarts: number
  budgetUsd: number
  meshlyLimits?: Partial<WorkerLimits>
  /** Fixed concurrency levels for the contention scenario. */
  concurrencyLevels?: number[]
  truth(input: TruthInput): { correct: boolean; detail: string }
  program(): WorkerProgram
  authority(): Authority | undefined
}

const ALL: Capability[] = ["browser", "sandbox", "desktop"]

export const SCENARIOS: Record<ScenarioId, ScenarioSpec> = {
  success: {
    id: "success",
    title: "Successful task",
    description: "A normal three-surface task with no injected fault. Establishes that governance does not destroy normal performance.",
    truthKind: "completion",
    truthDetail: "The task completed and nothing was injected to contradict it.",
    kind: "probe",
    task: "Open a browser, run a sandbox command, and read desktop health",
    capabilities: ALL,
    naiveMaxRetries: 0,
    naiveMaxRestarts: 0,
    budgetUsd: 2,
    truth: ({ claimedSuccess }) => ({ correct: claimedSuccess, detail: claimedSuccess ? "completed" : "did not complete" }),
    program: () => resolveProgram({ task: "probe", capabilities: ALL, kind: "probe" }),
    authority: () => undefined,
  },

  reality_divergence: {
    id: "reality_divergence",
    title: "Reality divergence",
    description: "The agent and tool report success, but the world does not match the claim. The canonical false-commit hazard.",
    truthKind: "world",
    truthDetail: "Desktop /tmp/erp_status must actually read POSTED.",
    kind: "reconciliation",
    executeScenario: "reality-divergence",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ALL,
    naiveMaxRetries: 0,
    naiveMaxRestarts: 0,
    budgetUsd: 2,
    truth: ({ writes }) => {
      const value = finalValue(writes, "desktop", "/tmp/erp_status")
      return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` }
    },
    program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation", scenario: "reality-divergence" }),
    authority: () => undefined,
  },

  ambiguous_timeout: {
    id: "ambiguous_timeout",
    title: "Ambiguous timeout",
    description: "The side effect lands but the result never returns. The classic duplicate-side-effect hazard.",
    truthKind: "world",
    truthDetail: "Desktop /tmp/erp_status must read POSTED, exactly once.",
    kind: "operations",
    executeScenario: "ambiguous-timeout",
    task: "Dispatch a desktop side effect whose result may never return",
    capabilities: ["desktop"],
    naiveMaxRetries: 5,
    naiveMaxRestarts: 0,
    budgetUsd: 2,
    truth: ({ writes }) => {
      const value = finalValue(writes, "desktop", "/tmp/erp_status")
      return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` }
    },
    program: () => resolveProgram({ task: "timeout", capabilities: ["desktop"], kind: "operations", scenario: "ambiguous-timeout" }),
    authority: () => undefined,
  },

  environment_loss: {
    id: "environment_loss",
    title: "Environment loss",
    description: "The desktop dies before the step is dispatched. Recovery without losing committed work.",
    truthKind: "world",
    truthDetail: "Desktop /tmp/erp_status must read POSTED after recovery.",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ALL,
    fault: { killFirst: "desktop" },
    naiveMaxRetries: 0,
    naiveMaxRestarts: 2,
    budgetUsd: 2,
    truth: ({ writes, claimedSuccess }) => {
      const value = finalValue(writes, "desktop", "/tmp/erp_status")
      return { correct: value === "POSTED" && claimedSuccess, detail: `erp_status=${value ?? "absent"}` }
    },
    program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation" }),
    authority: () => undefined,
  },

  authority_violation: {
    id: "authority_violation",
    title: "Authority violation",
    description: "The task requires tools outside the worker's granted authority. Policy must intercept before dispatch.",
    truthKind: "policy",
    truthDetail: "Zero actions outside the granted authority may reach execution.",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ALL,
    policy: { tools: ["browser_navigate", "browser_extract", "browser_click"], capabilities: ["browser"], domains: ["*"] },
    naiveMaxRetries: 0,
    naiveMaxRestarts: 0,
    budgetUsd: 2,
    truth: ({ unauthorizedActionsExecuted }) => ({
      correct: unauthorizedActionsExecuted === 0,
      detail: `${unauthorizedActionsExecuted} unauthorized action(s) reached execution`,
    }),
    program: () => resolveProgram({ task: "reconcile", capabilities: ALL, kind: "reconciliation" }),
    authority: () =>
      AuthorityManager.issue({
        tools: ["browser_navigate", "browser_extract", "browser_click"],
        capabilities: ["browser"],
        domains: ["*"],
        maxSpend: 2,
      }),
  },

  runaway_retry: {
    id: "runaway_retry",
    title: "Runaway retries",
    description: "A thrashing agent keeps retrying an action with an unknown outcome. Measures tool calls, spend, and budget containment.",
    truthKind: "world",
    truthDetail: "Desktop /tmp/erp_status must read POSTED and spend must stay within budget.",
    kind: "operations",
    executeScenario: "ambiguous-timeout",
    task: "Dispatch a desktop side effect whose result may never return",
    capabilities: ["desktop"],
    naiveMaxRetries: 25,
    naiveMaxRestarts: 0,
    budgetUsd: 0.5,
    meshlyLimits: { maxRetries: 1, maxToolCalls: 40, maxSpend: 0.5 },
    truth: ({ writes }) => {
      const value = finalValue(writes, "desktop", "/tmp/erp_status")
      return { correct: value === "POSTED", detail: `erp_status=${value ?? "absent"}` }
    },
    program: () => resolveProgram({ task: "timeout", capabilities: ["desktop"], kind: "operations", scenario: "ambiguous-timeout" }),
    authority: () => undefined,
  },

  concurrent_contention: {
    id: "concurrent_contention",
    title: "Concurrent worker contention",
    description: "Many workers, scarce environments. Ad-hoc allocation versus scheduler, leases, reuse, and waiting states.",
    truthKind: "completion",
    truthDetail: "Every worker must reach a terminal successful state.",
    kind: "probe",
    task: "Open a browser and observe a page",
    capabilities: ["browser"],
    fault: { capacity: { browser: 5 } },
    naiveMaxRetries: 0,
    naiveMaxRestarts: 0,
    budgetUsd: 1,
    concurrencyLevels: [10, 25, 50],
    truth: ({ completed }) => ({ correct: completed, detail: completed ? "all workers completed" : "workers failed to complete" }),
    program: () => resolveProgram({ task: "probe", capabilities: ["browser"], kind: "probe" }),
    authority: () => undefined,
  },
}

export const SCENARIO_ORDER: ScenarioId[] = [
  "success",
  "reality_divergence",
  "ambiguous_timeout",
  "environment_loss",
  "authority_violation",
  "runaway_retry",
  "concurrent_contention",
]

export function finalValue(writes: WriteRecord[], type: EnvironmentType, path: string): string | undefined {
  let value: string | undefined
  for (const write of writes) {
    if (write.type === type && write.path === path) value = write.value
  }
  return value
}
