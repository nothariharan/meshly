/**
 * @meshly/core - MeshlyRuntime Engine
 * The central operating layer managing autonomous workers, runs, environment fabrics,
 * verification contracts, memory budgets, and policy enforcement.
 */
import {
  Capability,
  Authority,
  VerificationContract,
  VerificationState,
  EvidenceBundle,
  EnvironmentLease,
  ExecutionFabric,
  AgentAdapter,
  AgentActionRequest,
} from "./types.js"
import { EventStore } from "./events/events.js"
import { SimulatorExecutionFabric } from "./fabric/simulator.js"
import { EnvironmentBroker } from "./fabric/broker.js"
import { Scheduler, ScheduleCandidate } from "./scheduler/scheduler.js"
import { ContextManager } from "./context/context.js"
import { MemoryManager } from "./memory/memory.js"
import { CheckpointManager } from "./checkpoint/checkpoint.js"
import { AuthorityManager } from "./authority/authority.js"
import { Verifier } from "./verification/verifier.js"
import { SagaTransaction } from "./transactions/saga.js"
import { WorkerInstance } from "./worker/worker.js"
import { WorkerManager } from "./worker/manager.js"
import { OperatorManager } from "./operator/operator.js"
import { FailureInjector } from "./failure/injector.js"
import { RunManager, RunInstance } from "./run/run.js"

export interface MeshlyConfig {
  executionFabric?: ExecutionFabric
  maxConcurrency?: number
  defaultLifespanMs?: number
  maxHotTokens?: number
}

export interface WorkflowStep {
  name: string
  requires?: Capability[]
  contract: VerificationContract
  action: (context: any) => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
  observe: () => Promise<Record<string, any>>
  compensate?: (context: any) => Promise<void>
}

export interface WorkflowDef {
  name: string
  steps: WorkflowStep[]
}

export class MeshlyRuntime {
  public readonly events: EventStore
  public readonly broker: EnvironmentBroker
  public readonly scheduler: Scheduler
  public readonly contexts: ContextManager
  public readonly memory: MemoryManager
  public readonly checkpoints: CheckpointManager
  public readonly authority: AuthorityManager
  public readonly workers: WorkerManager
  public readonly runs: RunManager
  public readonly operator: OperatorManager
  public readonly failures: FailureInjector

  constructor(config: MeshlyConfig = {}) {
    this.events = new EventStore()
    const fabric = config.executionFabric || new SimulatorExecutionFabric()

    const onLeaseExpired = async (lease: EnvironmentLease) => {
      const worker = this.workers.get(lease.workerId)
      if (worker && worker.status === "RUNNING") {
        console.log(`[MeshlyRuntime] Lease ${lease.leaseId} expired for worker ${worker.id}. Freezing compute...`)
        worker.checkpointState(worker.context.currentStep)
        await worker.pause()
        await this.broker.release(lease.leaseId)
      }
    }

    this.broker = new EnvironmentBroker(this.events, fabric, onLeaseExpired)
    this.scheduler = new Scheduler(this.broker, this.events, config.maxConcurrency ?? 10)
    this.contexts = new ContextManager(this.events)
    this.memory = new MemoryManager(this.events, config.maxHotTokens ?? 4000)
    this.checkpoints = new CheckpointManager(this.events)
    this.authority = new AuthorityManager(this.events)
    this.workers = new WorkerManager(this)
    this.runs = new RunManager(this.events)
    this.operator = new OperatorManager(this.events, this.contexts, this.broker)
    this.failures = new FailureInjector(this.events, this.broker)
  }

  setFabric(fabric: ExecutionFabric): void {
    this.broker.setFabric(fabric)
  }

  /**
   * First-Class Run Execution: The high-level entry point
   */
  async run(params: {
    task: string
    capabilities: Capability[]
    priority?: number
    budget?: number
    authority?: Authority
    workflow?: WorkflowDef
    metadata?: Record<string, any>
  }): Promise<RunInstance> {
    const worker = await this.workers.spawn({
      task: params.task,
      capabilities: params.capabilities,
      priority: params.priority ?? 8,
      budget: params.budget ?? 5.0,
      authority: params.authority,
      metadata: params.metadata,
    })

    const run = this.runs.create(worker)
    worker.context.runId = run.runId

    if (params.workflow) {
      // Execute declarative workflow under this run
      Promise.resolve().then(async () => {
        try {
          const saga = this.transaction(worker.id)
          let lastEvidence: EvidenceBundle | undefined

          for (const stepDef of params.workflow!.steps) {
            const execStep = run.createStep({
              intent: stepDef.contract.intent,
              action: { tool: stepDef.name, args: {} },
            })

            run.updateStepStatus(execStep.id, "authorized")

            saga.addStep({
              name: stepDef.name,
              contract: stepDef.contract,
              action: async () => {
                run.updateStepStatus(execStep.id, "executing")
                return stepDef.action(worker.context)
              },
              observeState: async () => {
                const obs = await stepDef.observe()
                run.updateStepStatus(execStep.id, "observed", { observation: obs })
                return obs
              },
              compensate: stepDef.compensate,
            })
          }

          const res = await saga.execute()
          if (res.completed) {
            this.complete(worker.id)
            run.complete(lastEvidence)
          } else {
            this.fail(worker.id, res.error)
            run.fail(res.error)
          }
        } catch (err: any) {
          this.fail(worker.id, err.message)
          run.fail(err.message)
        }
      })
    }

    return run
  }

  /**
   * Agent-Agnostic Execution Loop
   * Runs an arbitrary AgentAdapter (OpenAI, Claude, Custom, MCP) through Meshly governance.
   */
  async runWithAgent(params: {
    adapter: AgentAdapter
    task: string
    capabilities: Capability[]
    priority?: number
    budget?: number
    authority?: Authority
    maxSteps?: number
    verifyContract?: VerificationContract
  }): Promise<RunInstance> {
    const worker = await this.workers.spawn({
      task: params.task,
      capabilities: params.capabilities,
      priority: params.priority ?? 8,
      budget: params.budget ?? 5.0,
      authority: params.authority,
    })

    const run = this.runs.create(worker)
    const maxSteps = params.maxSteps ?? 5

    // Background execution loop
    Promise.resolve().then(async () => {
      try {
        let actionReq = await params.adapter.start(worker.context)

        for (let step = 1; step <= maxSteps; step++) {
          if (actionReq.done) break

          const execStep = run.createStep({
            intent: actionReq.intent,
            action: { tool: actionReq.tool, args: actionReq.args },
          })

          // Policy interception
          const authResult = this.authority.authorize(worker.id, worker.authority, {
            tool: actionReq.tool,
            capability: params.capabilities[0],
          })

          if (!authResult.allowed) {
            run.updateStepStatus(execStep.id, "rejected", { error: authResult.violation })
            run.fail(authResult.violation)
            return
          }

          run.updateStepStatus(execStep.id, "authorized")

          // Verification Contract
          const contract = params.verifyContract || {
            intent: actionReq.intent,
            preconditions: [],
            postconditions: [],
          }

          const verifyRes = await this.verifyStep({
            workerId: worker.id,
            contract,
            executeAction: async () => {
              run.updateStepStatus(execStep.id, "executing")
              worker.deductSpend(0.02)
              return { claimedSuccess: actionReq.claimedSuccess !== false }
            },
            observeState: async () => {
              const obs = { step, tool: actionReq.tool, verified: true }
              run.updateStepStatus(execStep.id, "observed", { observation: obs })
              return obs
            },
          })

          if (verifyRes.state.worldStateMatched) {
            run.updateStepStatus(execStep.id, "committed", {
              agentClaim: verifyRes.state.agentClaim,
              toolExecution: verifyRes.state.toolExecution,
              worldStateMatched: true,
              evidence: verifyRes.evidence,
            })
            actionReq = await params.adapter.handleObservation(worker.context, verifyRes.state.observations)
          } else {
            run.updateStepStatus(execStep.id, "rejected", {
              agentClaim: verifyRes.state.agentClaim,
              toolExecution: verifyRes.state.toolExecution,
              worldStateMatched: false,
              error: verifyRes.state.error,
            })
            run.fail(`Verification divergence at step ${step}`)
            return
          }
        }

        this.complete(worker.id)
        run.complete()
      } catch (err: any) {
        this.fail(worker.id, err.message)
        run.fail(err.message)
      }
    })

    return run
  }

  /**
   * SCHEDULE: Spawn a worker (convenience shortcut)
   */
  async spawn(params: {
    task: string
    capabilities: Capability[]
    priority?: number
    deadline?: Date
    budget?: number
    authority?: Authority
    parentId?: string
    metadata?: Record<string, any>
    initialMemory?: Array<{ key: string; value: any; tier?: "hot" | "warm" | "cold" }>
  }): Promise<WorkerInstance> {
    return this.workers.spawn(params)
  }

  async scheduleNext(): Promise<{ worker?: WorkerInstance; lease?: EnvironmentLease; score?: number }> {
    const res = await this.scheduler.scheduleNext()
    if (res.worker) {
      return {
        worker: this.workers.get(res.worker.id),
        lease: res.lease,
        score: res.score,
      }
    }
    return {}
  }

  /**
   * VERIFY: Execute step wrapped in verification contract
   */
  async verifyStep(params: {
    workerId: string
    contract: VerificationContract
    executeAction: () => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
    observeState: () => Promise<Record<string, any>>
  }): Promise<{ state: VerificationState; evidence?: EvidenceBundle }> {
    return Verifier.verifyStep({
      workerId: params.workerId,
      contract: params.contract,
      executeAction: params.executeAction,
      observeState: params.observeState,
      events: this.events,
    })
  }

  transaction(workerId: string): SagaTransaction {
    return new SagaTransaction(workerId, this.events)
  }

  /**
   * PERSIST: Model-agnostic agent handoff
   */
  async handoff(fromWorkerId: string, newTask: string): Promise<WorkerInstance> {
    const source = this.workers.get(fromWorkerId)
    if (!source) throw new Error(`Source worker ${fromWorkerId} not found`)

    const replacement = await this.workers.spawn({
      task: newTask,
      capabilities: source.capabilities,
      priority: source.priority,
      authority: source.authority,
      parentId: fromWorkerId,
    })

    replacement.context = this.contexts.transfer(fromWorkerId, replacement.id)

    const snap = this.memory.snapshot(fromWorkerId)
    for (const [k, v] of Object.entries(snap)) {
      this.memory.put({
        workerId: replacement.id,
        key: k,
        value: v.value,
        tier: v.tier,
      })
    }

    return replacement
  }

  async pause(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.pause()
  }

  async resume(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.resume()
  }

  async cancel(workerId: string, reason?: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.cancel(reason)
  }

  complete(workerId: string): void {
    this.scheduler.markCompleted(workerId)
  }

  fail(workerId: string, error?: string): void {
    this.scheduler.markFailed(workerId, error)
  }

  /**
   * Declarative Workflow API
   */
  workflow = {
    define: (def: WorkflowDef) => def,
    execute: async (def: WorkflowDef, options: { priority?: number; budget?: number } = {}) => {
      const allCaps = Array.from(new Set(def.steps.flatMap((s) => s.requires || ["sandbox"])))
      const worker = await this.workers.spawn({
        task: `Workflow: ${def.name}`,
        capabilities: allCaps,
        priority: options.priority ?? 8,
        budget: options.budget ?? 5.0,
      })

      const saga = this.transaction(worker.id)
      for (const step of def.steps) {
        saga.addStep({
          name: step.name,
          contract: step.contract,
          action: () => step.action(worker.context),
          observeState: step.observe,
          compensate: step.compensate,
        })
      }

      const result = await saga.execute()
      if (result.completed) {
        this.complete(worker.id)
      } else {
        this.fail(worker.id, result.error)
      }

      return { worker, result }
    },
  }

  stats(): {
    totalWorkers: number
    queueLength: number
    activeWorkers: number
    totalRuns: number
    totalEvents: number
    environments: {
      total: number
      busy: number
      idle: number
      paused: number
      lost: number
      byType: Record<string, { idle: number; busy: number; paused: number }>
    }
  } {
    const envs = this.broker.list()
    const byType: Record<string, { idle: number; busy: number; paused: number }> = {
      browser: { idle: 0, busy: 0, paused: 0 },
      sandbox: { idle: 0, busy: 0, paused: 0 },
      desktop: { idle: 0, busy: 0, paused: 0 },
    }

    for (const e of envs) {
      if (!byType[e.type]) byType[e.type] = { idle: 0, busy: 0, paused: 0 }
      if (e.status === "IDLE") byType[e.type].idle += 1
      else if (e.status === "BUSY") byType[e.type].busy += 1
      else if (e.status === "PAUSED") byType[e.type].paused += 1
    }

    return {
      totalWorkers: this.workers.size,
      queueLength: this.scheduler.getQueueLength(),
      activeWorkers: this.scheduler.getActiveCount(),
      totalRuns: this.runs.list().length,
      totalEvents: this.events.count,
      environments: {
        total: envs.length,
        busy: envs.filter((e) => e.status === "BUSY").length,
        idle: envs.filter((e) => e.status === "IDLE").length,
        paused: envs.filter((e) => e.status === "PAUSED").length,
        lost: envs.filter((e) => e.status === "LOST").length,
        byType,
      },
    }
  }
}
