/**
 * Mode A — Direct agent execution.
 *
 * The same model, the same task, the same environments, the same tool surface.
 * The agent talks straight to the tools and commits on its own claim. There is
 * no authority interception, no independent verification, no ambiguous-outcome
 * handling, no checkpoint, and no runtime governor. That is the point of the
 * comparison.
 */
import {
  AuthorityManager,
  dispatchTool,
  isEnvironmentGone,
  type Authority,
  type EnvironmentType,
  type ExecutionEnvironment,
  type FabricResource,
  type ProgramStep,
} from "@meshly/core"
import { BenchmarkFabric } from "./fabric.js"

export interface DirectResult {
  status: string
  claimedSuccess: boolean
  toolCalls: number
  retries: number
  spendUsd: number
  unauthorizedActionsExecuted: number
  recoveredFromLoss: boolean
  unknownResolved: boolean
  lostProgressSteps: number
  failedAllocations: number
  budgetViolation: boolean
  latencyMs: number
  error?: string
}

export interface DirectOptions {
  fabric: BenchmarkFabric
  steps: ProgramStep[]
  policy?: Authority
  naiveMaxRetries: number
  maxRestarts: number
  budgetUsd: number
}

/** Same cost model the governed runtime uses, so spend is comparable. */
export function costFor(type: EnvironmentType): number {
  if (type === "browser") return 0.05
  if (type === "sandbox") return 0.02
  return 0.08
}

class DirectEnvironmentPool {
  private environments = new Map<EnvironmentType, ExecutionEnvironment>()
  private resources = new Map<EnvironmentType, FabricResource>()
  private fabric: BenchmarkFabric
  private onFailedAllocation: () => void

  constructor(fabric: BenchmarkFabric, onFailedAllocation: () => void) {
    this.fabric = fabric
    this.onFailedAllocation = onFailedAllocation
  }

  async get(type: EnvironmentType): Promise<ExecutionEnvironment | undefined> {
    const existing = this.environments.get(type)
    if (existing) return existing
    try {
      const resource =
        type === "browser"
          ? await this.fabric.launchBrowser({ recording: true })
          : type === "sandbox"
            ? await this.fabric.createSandbox({ template: "base" })
            : await this.fabric.createDesktop({ resolution: "1280x720" })
      const env = BenchmarkFabric.asEnvironment(resource, type)
      this.environments.set(type, env)
      this.resources.set(type, resource)
      return env
    } catch {
      this.onFailedAllocation()
      return undefined
    }
  }

  async destroyAll(): Promise<void> {
    for (const resource of this.resources.values()) {
      await this.fabric.destroyResource(resource)
    }
    this.environments.clear()
    this.resources.clear()
  }
}

export async function runDirectAgent(options: DirectOptions): Promise<DirectResult> {
  const started = Date.now()
  let failedAllocations = 0
  const pool = new DirectEnvironmentPool(options.fabric, () => {
    failedAllocations += 1
  })

  let toolCalls = 0
  let retries = 0
  let spendUsd = 0
  let restarts = 0
  let lostProgressSteps = 0
  let unauthorizedActionsExecuted = 0
  let recoveredFromLoss = false
  let claimedSuccess = true
  let status = "COMMITTED"
  let error: string | undefined

  let observations: Array<Record<string, any>> = []

  restart: while (true) {
    observations = []
    for (let i = 0; i < options.steps.length; i++) {
      const step = options.steps[i]

      if (options.policy && !AuthorityManager.evaluate(options.policy, { tool: step.tool, capability: step.environment }).allowed) {
        unauthorizedActionsExecuted += 1
      }

      const env = await pool.get(step.environment)
      if (!env) {
        claimedSuccess = false
        status = "FAILED"
        error = "environment allocation failed"
        break restart
      }

      const args = carryForward(step.args, observations)
      let attempt = 0

      while (true) {
        toolCalls += 1
        const dispatched = await dispatchTool({
          tool: step.tool,
          args,
          env,
          runId: "bench_direct",
        })
        spendUsd += costFor(step.environment)

        if (dispatched.outcome === "UNKNOWN") {
          retries += 1
          attempt += 1
          if (attempt > options.naiveMaxRetries) {
            claimedSuccess = false
            status = "UNKNOWN"
            error = "outcome unknown after retries; no way to confirm the world state"
            break restart
          }
          continue
        }

        if (dispatched.outcome === "FAILURE") {
          const gone =
            dispatched.observation?.environmentGone === true || isEnvironmentGone(dispatched.observation?.error)
          if (gone) {
            if (restarts >= options.maxRestarts) {
              claimedSuccess = false
              status = "FAILED"
              error = "environment lost; context was not checkpointed"
              break restart
            }
            restarts += 1
            recoveredFromLoss = true
            lostProgressSteps += i
            await pool.destroyAll()
            continue restart
          }
          claimedSuccess = false
          status = "FAILED"
          error = String(dispatched.observation?.error || "tool failure")
          break restart
        }

        if (dispatched.claimedSuccess === false) {
          claimedSuccess = false
          status = "FAILED"
          error = "tool reported failure"
          break restart
        }

        observations.push({ ...dispatched.observation, type: step.environment })
        break
      }
    }
    break
  }

  await pool.destroyAll()

  return {
    status,
    claimedSuccess,
    toolCalls,
    retries,
    spendUsd,
    unauthorizedActionsExecuted,
    recoveredFromLoss,
    unknownResolved: false,
    lostProgressSteps,
    failedAllocations,
    budgetViolation: spendUsd > options.budgetUsd,
    latencyMs: Date.now() - started,
    error,
  }
}

/** Mirrors the governed runtime so both arms feed later steps the same state. */
function carryForward(args: Record<string, any>, observations: Array<Record<string, any>>): Record<string, any> {
  if (!args?.carryForwardFrom || !Array.isArray(args.prepare)) return args
  const type = String(args.carryForwardFrom)
  const source = [...observations].reverse().find((o) => o.type === type && typeof o.payments_record === "object")
  const payments = source?.payments_record
  if (!payments) return args
  const prepare = args.prepare.map((file: { path: string; content: string }) =>
    file?.path === "/tmp/payments.json" ? { ...file, content: JSON.stringify(payments) } : file,
  )
  return { ...args, prepare }
}

export type { ProgramStep }
