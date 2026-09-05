/**
 * Meshly Unified Runtime Orchestrator
 * The operating layer for autonomous workers built on Solari.
 *
 * Core Verbs: SCHEDULE • PERSIST • AUTHORIZE • VERIFY • RESUME
 */
import { Capability, Authority, VerificationContract, VerificationState, EvidenceBundle, EnvironmentLease } from "./types.js"
import { EventStore } from "./events.js"
import { ExecutionFabric } from "./fabric.js"
import { SolariAdapter } from "./adapters/solari.js"
import { EnvironmentBroker, AcquireRequirements } from "./environment.js"
import { Scheduler } from "./scheduler.js"
import { ContextManager } from "./context.js"
import { MemoryManager } from "./memory.js"
import { CheckpointManager } from "./checkpoint.js"
import { AuthorityManager } from "./authority.js"
import { Verifier } from "./verifier.js"
import { SagaTransaction, SagaStepDef } from "./transaction.js"
import { WorkerInstance } from "./worker.js"
import { OperatorManager } from "./operator.js"
import { FailureInjector } from "./failure-injection.js"

export interface MeshlyConfig {
  apiKey?: string
  fabric?: ExecutionFabric
  maxConcurrency?: number
  defaultLifespanMs?: number
  maxHotTokens?: number
}

export class Meshly {
  public readonly events: EventStore
  public readonly broker: EnvironmentBroker
  public readonly scheduler: Scheduler
  public readonly contexts: ContextManager
  public readonly memory: MemoryManager
  public readonly checkpoints: CheckpointManager
  public readonly authority: AuthorityManager
  public readonly operator: OperatorManager
  public readonly failures: FailureInjector
  public readonly workers: Map<string, WorkerInstance> = new Map()

  constructor(config: MeshlyConfig = {}) {
    this.events = new EventStore()
    const fabric = config.fabric || new SolariAdapter(config.apiKey)

    // Lease expiration handler: pause worker, persist checkpoint, release resource
    const onLeaseExpired = async (lease: EnvironmentLease) => {
      const worker = this.workers.get(lease.workerId)
      if (worker && worker.status === "RUNNING") {
        console.log(`[Meshly Runtime] Lease ${lease.leaseId} expired for worker ${worker.id}. Freezing compute...`)
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
    this.operator = new OperatorManager(this.events, this.contexts, this.broker)
    this.failures = new FailureInjector(this.events, this.broker)
  }

  /**
   * SCHEDULE: Spawn an autonomous worker with explicit capabilities and authority bounds.
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
    const workerId = `wrk_${Math.random().toString(36).slice(2, 9)}`

    const auth =
      params.authority ??
      AuthorityManager.create({
        tools: ["*"],
        capabilities: ["*"],
        maxSpend: params.budget ?? 5.0,
      })

    const ctx = this.contexts.init(workerId, params.task)
    if (params.metadata) {
      ctx.metadata = { ...params.metadata }
    }

    const worker = new WorkerInstance({
      id: workerId,
      task: params.task,
      priority: params.priority ?? 5,
      deadline: params.deadline,
      budget: params.budget ?? auth.maxSpend,
      capabilities: params.capabilities,
      authority: auth,
      context: ctx,
      parentId: params.parentId,
      mesh: this,
    })

    this.workers.set(workerId, worker)

    if (params.initialMemory) {
      for (const m of params.initialMemory) {
        this.memory.put({
          workerId,
          key: m.key,
          value: m.value,
          tier: m.tier ?? "hot",
        })
      }
    }

    this.events.emit("worker.created", {
      workerId,
      data: { task: worker.task, priority: worker.priority, capabilities: worker.capabilities },
    })

    this.scheduler.enqueue(worker)
    return worker
  }

  /**
   * SCHEDULE: Dispatch next available worker from score-ranked queue
   */
  async scheduleNext(): Promise<{ worker?: WorkerInstance; lease?: EnvironmentLease; score?: number }> {
    const result = await this.scheduler.scheduleNext()
    if (result.worker) {
      return {
        worker: this.workers.get(result.worker.id),
        lease: result.lease,
        score: result.score,
      }
    }
    return {}
  }

  /**
   * VERIFY: Execute step wrapped in pre/post-condition reality verification contracts
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

  /**
   * Start a multi-step SAGA transaction with forward actions and compensating steps
   */
  transaction(workerId: string): SagaTransaction {
    return new SagaTransaction(workerId, this.events)
  }

  /**
   * PERSIST: Hand off cognitive context and memories from one worker to another
   */
  async handoff(fromWorkerId: string, newTask: string): Promise<WorkerInstance> {
    const source = this.workers.get(fromWorkerId)
    if (!source) throw new Error(`Source worker ${fromWorkerId} not found`)

    const replacement = await this.spawn({
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

  /**
   * RESUME: Resume worker compute and environment
   */
  async resume(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.resume()
  }

  /**
   * Freeze worker compute and pause physical environment
   */
  async pause(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.pause()
  }

  /**
   * Cancel worker and propagate cancellation down the descendant tree
   */
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

  getWorker(workerId: string): WorkerInstance | undefined {
    return this.workers.get(workerId)
  }

  listWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values())
  }

  /**
   * Runtime health and operational dashboard statistics
   */
  stats(): {
    totalWorkers: number
    queueLength: number
    activeWorkers: number
    totalEvents: number
    environments: { total: number; busy: number; idle: number; paused: number; lost: number }
  } {
    const envs = this.broker.list()
    return {
      totalWorkers: this.workers.size,
      queueLength: this.scheduler.getQueueLength(),
      activeWorkers: this.scheduler.getActiveCount(),
      totalEvents: this.events.count,
      environments: {
        total: envs.length,
        busy: envs.filter((e) => e.status === "BUSY").length,
        idle: envs.filter((e) => e.status === "IDLE").length,
        paused: envs.filter((e) => e.status === "PAUSED").length,
        lost: envs.filter((e) => e.status === "LOST").length,
      },
    }
  }
}
