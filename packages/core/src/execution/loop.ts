/**
 * Agent runtime: ActionRequest → Policy → ExecutionFabric → observation → verify → commit.
 * Agents never receive a Solari client.
 */
import type { ActionOutcome, EnvironmentType, VerificationContract, WorkerLimits } from "../types.js"
import type { MeshlyRuntime } from "../runtime.js"
import type { RunInstance } from "../run/run.js"
import type { WorkerInstance } from "../worker/worker.js"
import { dispatchTool, environmentForTool, isEnvironmentGone, isUncertainSideEffect } from "./tools.js"
import { resolveProgram, type ExecuteScenario, type ProgramStep } from "./recipes.js"
import { resolveLimits } from "./limits.js"
import { MeshlyError, isRetryableAllocation, toMeshlyError } from "../errors.js"

export interface ExecuteWorkerOptions {
  artifactDir?: string
  destroyAfter?: boolean
  scenario?: ExecuteScenario
  kind?: string
  signal?: AbortSignal
  resumeRunId?: string
  onProgress?: (run: RunInstance) => void
}

export async function executeWorker(
  runtime: MeshlyRuntime,
  workerId: string,
  options: ExecuteWorkerOptions = {},
): Promise<RunInstance> {
  const worker = runtime.workers.get(workerId)
  if (!worker) throw new Error(`Worker '${workerId}' not found`)

  const program = resolveProgram({
    task: worker.task,
    capabilities: worker.capabilities,
    kind: options.kind || worker.kind || worker.context.metadata?.kind,
    scenario: options.scenario,
  })

  const limits = resolveLimits(worker)
  const existing = options.resumeRunId ? runtime.runs.get(options.resumeRunId) : undefined
  if (!existing && runtime.scheduler.getActiveCount() >= runtime.scheduler.getMaxConcurrency()) {
    throw new Error(`Concurrent worker limit reached (${runtime.scheduler.getMaxConcurrency()})`)
  }

  runtime.scheduler.claim(worker.id)
  runtime.scheduler.activate(worker)
  const run = existing || runtime.runs.create(worker)
  // A scenario (e.g. ambiguous timeout) must not rename the worker's domain.
  // The run records what ran; the worker keeps the kind it was created with.
  if (program.kind === "timeout") {
    run.kind = worker.kind || "operations"
  } else {
    run.kind = program.kind
    worker.kind = program.kind
  }
  worker.context.runId = run.runId
  worker.status = "RUNNING"
  worker.updatedAt = new Date()
  if (existing) {
    if (existing.status === "UNKNOWN" || existing.status === "FAILED") {
      run.retries = (run.retries || 0) + 1
      if (run.retries > limits.maxRetries) {
        return haltOnLimit(runtime, worker, run, "maxRetries", `Retry blocked: ${run.retries} / ${limits.maxRetries}`, options)
      }
    }
    run.status = "RUNNING"
    run.error = undefined
  }
  options.onProgress?.(run)

  const leases = new Map<EnvironmentType, string>()
  collectExistingLeases(runtime, worker, run, leases)
  const startIndex = existing ? run.steps.filter((s) => s.status === "committed").length : 0

  try {
    for (let i = startIndex; i < program.steps.length; i++) {
      if (options.signal?.aborted) {
        await run.pause()
        return run
      }
      const limited = enforceStepLimits(runtime, worker, run, limits, leases, options)
      if (limited) return run

      const outcome = await executeProgramStep(runtime, worker, run, program.steps[i], leases, options)
      if (outcome === "halt") return run
      const cp = worker.checkpointState(i + 1, run.steps[run.steps.length - 1]?.observation)
      run.recordCheckpoint(cp)
      options.onProgress?.(run)
      if (options.signal?.aborted) {
        await run.pause()
        return run
      }
    }

    runtime.complete(worker.id)
    worker.status = "COMPLETED"
    run.complete(run.evidence)
    options.onProgress?.(run)
    return run
  } catch (err: any) {
    const mapped = toMeshlyError(err, { runId: run.runId }) || err
    const message = mapped instanceof MeshlyError ? mapped.format().trim() : mapped?.message || String(err)
    if (isRetryableAllocation(err) || isRetryableAllocation(mapped)) {
      worker.status = "WAITING"
      run.status = "WAITING"
      run.error = message
      options.onProgress?.(run)
      return run
    }
    runtime.fail(worker.id, message)
    worker.status = "FAILED"
    run.fail(message)
    options.onProgress?.(run)
    return run
  } finally {
    const keep =
      run.status === "PAUSED" || run.status === "UNKNOWN" || run.status === "VERIFYING" || options.destroyAfter === false
    await releaseLeases(runtime, leases, !keep)
    options.onProgress?.(run)
  }
}

export async function executeProgramStep(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  step: ProgramStep,
  leases: Map<EnvironmentType, string>,
  options: ExecuteWorkerOptions,
): Promise<"continue" | "halt"> {
  const tool = step.tool
  const type = step.environment

  runtime.events.emit("intent.created", {
    workerId: worker.id,
    runId: run.runId,
    data: { intent: step.intent, tool, type, scenario: options.scenario || "default" },
  })

  const authorized = runtime.authority.authorize(worker.id, worker.authority, {
    tool,
    capability: type,
  })

  const execStep = run.createStep({
    intent: step.intent,
    action: { tool, args: step.args, description: step.intent },
  })
  execStep.contract = {
    intent: step.contract.intent,
    preconditions: step.contract.preconditions,
    postconditions: step.contract.postconditions,
    onFailure: step.contract.onFailure,
  }
  options.onProgress?.(run)

  run.toolCalls = (run.toolCalls || 0) + 1

  if (!authorized.allowed) {
    run.updateStepStatus(execStep.id, "rejected", { error: authorized.violation })
    runtime.events.emit("action.denied", {
      workerId: worker.id,
      runId: run.runId,
      data: { tool, reason: authorized.violation },
    })
    run.fail(authorized.violation)
    worker.status = "FAILED"
    options.onProgress?.(run)
    return "halt"
  }

  runtime.events.emit("authority.approved", {
    workerId: worker.id,
    runId: run.runId,
    data: { tool, capability: type },
  })
  runtime.events.emit("action.authorized", {
    workerId: worker.id,
    runId: run.runId,
    data: { tool, capability: type },
  })
  run.updateStepStatus(execStep.id, "authorized")
  options.onProgress?.(run)

  let env = await ensureEnvironment(runtime, worker, run, type, leases)
  run.updateStepStatus(execStep.id, "executing")
  options.onProgress?.(run)

  const stepArgs = carryForwardArgs(step.args, run)

  let dispatched = await dispatchTool({
    tool,
    args: stepArgs,
    env,
    artifactDir: options.artifactDir,
    runId: run.runId,
    timeoutMs: step.args.timeoutMs,
  })

  const goneOf = (d: { outcome: string; observation?: Record<string, any> }) =>
    d.outcome === "FAILURE" && (d.observation?.environmentGone === true || isEnvironmentGone(d.observation?.error))

  let replacements = 0
  while (goneOf(dispatched)) {
    runtime.broker.markLost(env.id, dispatched.observation?.error || "ENVIRONMENT LOST", { workerId: worker.id, runId: run.runId })
    leases.delete(type)
    // If the environment died before the action was dispatched, no side effect
    // left, so a fresh environment may safely carry the step. Only a write that
    // may have landed is treated as UNKNOWN and never retried.
    const noSideEffect = dispatched.observation?.dispatched === false
    if (isUncertainSideEffect(tool) && !noSideEffect) {
      return independentVerifyUnknown(runtime, worker, run, execStep, step, env, {
        ...dispatched.observation,
        reason: dispatched.observation?.error || "ENVIRONMENT LOST",
      }, options)
    }
    if (replacements >= 2) {
      run.updateStepStatus(execStep.id, "rejected", {
        observation: dispatched.observation,
        error: dispatched.observation?.error,
      })
      run.fail(dispatched.observation?.error || "ENVIRONMENT LOST")
      worker.status = "FAILED"
      options.onProgress?.(run)
      return "halt"
    }
    replacements += 1
    env = await ensureEnvironment(runtime, worker, run, type, leases)
    options.onProgress?.(run)
    dispatched = await dispatchTool({
      tool,
      args: stepArgs,
      env,
      artifactDir: options.artifactDir,
      runId: run.runId,
      timeoutMs: step.args.timeoutMs,
    })
  }
  return finishDispatchedStep(runtime, worker, run, execStep, step, env, dispatched, options)
}

async function finishDispatchedStep(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  execStep: { id: string },
  step: ProgramStep,
  env: { id: string },
  dispatched: { outcome: ActionOutcome; claimedSuccess: boolean; observation: Record<string, any> },
  options: ExecuteWorkerOptions,
): Promise<"continue" | "halt"> {
  const type = step.environment
  const tool = step.tool
  const cost = costFor(type)
  if (!worker.deductSpend(cost)) {
    haltOnLimit(
      runtime,
      worker,
      run,
      "maxSpend",
      `Spend cap reached: $${worker.budget.spent.toFixed(2)} / $${worker.budget.maxSpend.toFixed(2)}`,
      options,
    )
    return "halt"
  }
  runtime.events.emit("action.executed", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool, claimedSuccess: dispatched.claimedSuccess, type, outcome: dispatched.outcome },
  })

  if (dispatched.outcome === "UNKNOWN") {
    return independentVerifyUnknown(runtime, worker, run, execStep, step, env, dispatched.observation, options)
  }

  const observation = { ...dispatched.observation }
  const result = await runtime.verifyStep({
    workerId: worker.id,
    runId: run.runId,
    contract: step.contract,
    executeAction: async () => ({ claimedSuccess: dispatched.claimedSuccess !== false, ...observation }),
    observeState: async () => {
      runtime.events.emit("observation.captured", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: env.id,
        data: { type, keys: Object.keys(observation) },
      })
      runtime.events.emit("observation.recorded", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: env.id,
        data: {
          type,
          title: observation.title,
          stdout: observation.stdout,
          payment_status: observation.payment_status,
          erp_status: observation.erp_status,
          ready: observation.ready,
        },
      })
      return observation
    },
  })

  if (!result.state.worldStateMatched) {
    run.updateStepStatus(execStep.id, "rejected", {
      observation,
      agentClaim: result.state.agentClaim,
      toolExecution: result.state.toolExecution,
      actionOutcome: dispatched.outcome,
      worldStateMatched: false,
      error: result.state.error,
      evidence: result.evidence,
    })
    run.block(result.state.error || `Verification failed on ${type}`)
    worker.status = "WAITING"
    worker.verificationState = result.state
    options.onProgress?.(run)
    return "halt"
  }

  runtime.events.emit("commit.committed", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { type },
  })
  run.updateStepStatus(execStep.id, "committed", {
    observation,
    agentClaim: result.state.agentClaim,
    toolExecution: result.state.toolExecution,
    actionOutcome: dispatched.outcome,
    worldStateMatched: true,
    evidence: result.evidence,
  })
  worker.verificationState = result.state
  if (result.evidence) run.evidence = result.evidence
  options.onProgress?.(run)
  return "continue"
}

async function independentVerifyUnknown(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  execStep: { id: string },
  step: ProgramStep,
  env: any,
  timeoutObservation: Record<string, any>,
  options: ExecuteWorkerOptions,
): Promise<"halt"> {
  run.markUnknown("Action result UNKNOWN — independent verification required before retry")
  worker.status = "WAITING"
  runtime.events.emit("action.unknown", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool: step.tool, retry: false },
  })
  runtime.events.emit("action.timeout", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { reason: timeoutObservation.reason },
  })
  run.updateStepStatus(execStep.id, "unknown", {
    observation: timeoutObservation,
    agentClaim: "UNKNOWN",
    toolExecution: "UNKNOWN",
    actionOutcome: "UNKNOWN",
    worldStateMatched: false,
    error: timeoutObservation.reason,
  })
  options.onProgress?.(run)

  run.status = "VERIFYING"
  runtime.events.emit("run.verifying", { workerId: worker.id, runId: run.runId })
  runtime.events.emit("verification.independent", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { tool: step.tool },
  })

  const fresh = await dispatchTool({
    tool: environmentForTool(step.tool) === "desktop" ? "desktop_read" : step.tool === "sandbox_exec" ? "sandbox_read" : "browser_extract",
    args: { path: step.args.path || "/tmp/erp_status", fixture: step.args.fixture },
    env,
    artifactDir: options.artifactDir,
    runId: run.runId,
  })

  const world: Record<string, any> = { ...timeoutObservation, ...fresh.observation, result: undefined }

  runtime.events.emit("observation.captured", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: { reason: "independent world-state read", keys: Object.keys(fresh.observation || {}) },
  })
  runtime.events.emit("observation.recorded", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: env.id,
    data: {
      reason: "independent world-state read",
      type: env.type || step.environment,
      erp_status: world.erp_status,
      content: world.content,
      payment_status: world.payment_status,
      title: world.title,
    },
  })
  let matched = true
  let mismatch = ""
  for (const cond of step.contract.postconditions) {
    const actual = world[cond.query]
    const ok =
      cond.type === "text_contains"
        ? String(actual || "").toLowerCase().includes(String(cond.expected).toLowerCase())
        : actual === cond.expected
    if (!ok) {
      matched = false
      mismatch = `Independent verify failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`
      break
    }
  }

  if (matched) {
    runtime.events.emit("commit.committed", {
      workerId: worker.id,
      runId: run.runId,
      environmentId: env.id,
      data: { type: env.type || step.environment, independent: true },
    })
    run.updateStepStatus(execStep.id, "committed", {
      observation: world,
      agentClaim: "UNKNOWN",
      toolExecution: "UNKNOWN",
      actionOutcome: "SUCCESS",
      worldStateMatched: true,
    })
    run.status = "VERIFIED"
    runtime.complete(worker.id)
    worker.status = "COMPLETED"
  } else {
    run.updateStepStatus(execStep.id, "unknown", {
      observation: world,
      agentClaim: "UNKNOWN",
      toolExecution: "UNKNOWN",
      actionOutcome: "UNKNOWN",
      worldStateMatched: false,
      error: mismatch || "Side effect absent — retry is allowed but not automatic",
    })
    run.status = "UNKNOWN"
    worker.status = "WAITING"
    run.error = mismatch || "UNKNOWN: side effect absent; safe retry permitted"
    runtime.events.emit("run.unknown", {
      workerId: worker.id,
      runId: run.runId,
      data: {
        reason: mismatch || "Side effect absent — retry is allowed but not automatic",
        retry: false,
        safeToRetry: true,
      },
    })
  }
  options.onProgress?.(run)
  return "halt"
}

function collectExistingLeases(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  leases: Map<EnvironmentType, string>,
): void {
  for (const env of runtime.broker.list()) {
    if (env.owner !== worker.id) continue
    if (env.status === "LOST" || env.status === "TERMINATED" || env.status === "TERMINATING") continue
    if (!env.handle || !env.currentLeaseId) continue
    if (!runtime.broker.getLease(env.currentLeaseId)) continue
    if (run.environments.length && !run.environments.includes(env.id)) continue
    leases.set(env.type, env.currentLeaseId)
  }
}

function enforceStepLimits(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  limits: WorkerLimits,
  leases: Map<EnvironmentType, string>,
  options: ExecuteWorkerOptions,
): RunInstance | null {
  const elapsed = Date.now() - run.startedAt
  if (elapsed > limits.maxDurationMs) {
    haltOnLimit(runtime, worker, run, "maxDurationMs", `Duration cap reached: ${Math.round(elapsed / 1000)}s / ${Math.round(limits.maxDurationMs / 1000)}s`, options)
    return run
  }
  if ((run.toolCalls || 0) >= limits.maxToolCalls) {
    haltOnLimit(runtime, worker, run, "maxToolCalls", `Tool-call cap reached: ${run.toolCalls} / ${limits.maxToolCalls}`, options)
    return run
  }
  if (leases.size >= limits.maxEnvironments) {
    /* existing leases are fine; new types are gated in ensureEnvironment */
  }
  return null
}

function haltOnLimit(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  limit: string,
  message: string,
  options: ExecuteWorkerOptions,
): RunInstance {
  runtime.events.emit("limit.exceeded", {
    workerId: worker.id,
    runId: run.runId,
    data: { limit, message, meters: run.meters() },
  })
  runtime.fail(worker.id, message)
  worker.status = "FAILED"
  run.fail(message)
  options.onProgress?.(run)
  return run
}

/**
 * Real carry-forward: later steps consume the observations of earlier environments.
 * A sandbox reconciliation must use the payment record actually read from the browser,
 * not a hard-coded fixture.
 */
function carryForwardArgs(args: Record<string, any>, run: RunInstance): Record<string, any> {
  if (!args?.carryForwardFrom || !Array.isArray(args.prepare)) return args
  const type = String(args.carryForwardFrom)
  const source = [...run.steps]
    .reverse()
    .find((s) => s.observation?.type === type && typeof s.observation?.payments_record === "object")
  const payments = source?.observation?.payments_record
  if (!payments) return args
  const prepare = args.prepare.map((file: { path: string; content: string }) => {
    if (file?.path === "/tmp/payments.json") {
      return { ...file, content: JSON.stringify(payments) }
    }
    return file
  })
  return { ...args, prepare }
}

async function ensureEnvironment(
  runtime: MeshlyRuntime,
  worker: WorkerInstance,
  run: RunInstance,
  type: EnvironmentType,
  leases: Map<EnvironmentType, string>,
) {
  const existingLeaseId = leases.get(type)
  if (existingLeaseId) {
    const lease = runtime.broker.getLease(existingLeaseId)
    const env = lease ? runtime.broker.inspect(lease.environmentId) : undefined
    if (env?.handle && env.status !== "LOST" && env.status !== "TERMINATED") return env
    leases.delete(type)
  }

  const limits = resolveLimits(worker)
  const liveTypes = new Set(leases.keys())
  if (!liveTypes.has(type) && liveTypes.size >= limits.maxEnvironments) {
    throw new MeshlyError({
      code: "LIMIT_EXCEEDED",
      title: "Worker hit an operational limit.",
      reason: `Environment cap reached: ${liveTypes.size} / ${limits.maxEnvironments}`,
      runId: run.runId,
      action: "Execution stopped. Recorded work was kept.",
      retryable: false,
    })
  }

  let lease
  try {
    lease = await runtime.broker.acquire({
      workerId: worker.id,
      type,
      capabilities: [type],
      authority: worker.authority,
      budget: Math.max(0.01, worker.budget.maxSpend - worker.budget.spent),
    })
  } catch (err) {
    throw toMeshlyError(err, { runId: run.runId, environment: type }) || err
  }
  leases.set(type, lease.leaseId)
  worker.environmentLease = lease
  run.recordEnvironment(lease.environmentId)

  const env = runtime.broker.inspect(lease.environmentId)
  runtime.events.emit(`solari.${type}.created` as "solari.browser.created", {
    workerId: worker.id,
    runId: run.runId,
    environmentId: lease.environmentId,
    leaseId: lease.leaseId,
    data: { fabricId: env?.fabricId, provider: env?.handle ? "live-or-sim" : undefined },
  })
  return env!
}

async function releaseLeases(
  runtime: MeshlyRuntime,
  leases: Map<EnvironmentType, string>,
  destroyAfter: boolean,
): Promise<void> {
  for (const leaseId of leases.values()) {
    const lease = runtime.broker.getLease(leaseId)
    if (!lease) continue
    if (destroyAfter) {
      await runtime.broker.release(leaseId)
      await runtime.broker.destroy(lease.environmentId)
    } else {
      await runtime.broker.release(leaseId)
    }
  }
}

function costFor(type: EnvironmentType): number {
  if (type === "browser") return 0.05
  if (type === "sandbox") return 0.02
  return 0.08
}

/** @deprecated Use resolveProgram + executeWorker. Kept for existing imports. */
export function contractFor(type: EnvironmentType, scenario: ExecuteScenario = "default"): VerificationContract {
  if (scenario === "reality-divergence") {
    return {
      intent: "Independent world check: ERP must be POSTED",
      preconditions: [],
      postconditions: [{ target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" }],
      onFailure: "human",
    }
  }
  if (type === "browser") {
    return {
      intent: "Browser loaded a real page with a title",
      preconditions: [],
      postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Example" }],
    }
  }
  if (type === "sandbox") {
    return {
      intent: "Sandbox command exited 0 and printed 4",
      preconditions: [],
      postconditions: [
        { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
        { target: "sandbox", type: "text_contains", query: "stdout", expected: "4" },
      ],
    }
  }
  return {
    intent: "Desktop display is ready",
    preconditions: [],
    postconditions: [{ target: "desktop", type: "status_equals", query: "ready", expected: true }],
  }
}
