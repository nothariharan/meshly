/**
 * Meshly Universal Worker Instance
 * First-class worker primitive decoupling reasoning from execution, authority, and memory lifecycles.
 */
import {
  Worker as IWorker,
  WorkerStatus,
  Capability,
  Authority,
  Budget,
  ContextRef,
  MemoryRef,
  EnvironmentLease,
  CheckpointRef,
  VerificationState,
} from "./types.js"
import { AuthorityManager, ActionIntent } from "./authority.js"

export class WorkerInstance implements IWorker {
  id: string
  task: string
  status: WorkerStatus = "CREATED"
  priority: number
  deadline?: Date
  budget: Budget
  capabilities: Capability[]
  authority: Authority
  context: ContextRef
  memory: MemoryRef[] = []
  environmentLease?: EnvironmentLease
  checkpoint?: CheckpointRef
  verificationState?: VerificationState
  parentId?: string
  children: string[] = []
  createdAt: Date = new Date()
  updatedAt: Date = new Date()

  private mesh: any

  constructor(params: {
    id: string
    task: string
    priority?: number
    deadline?: Date
    budget?: number
    capabilities: Capability[]
    authority: Authority
    context: ContextRef
    parentId?: string
    mesh: any
  }) {
    this.id = params.id
    this.task = params.task
    this.priority = params.priority ?? 5
    this.deadline = params.deadline
    this.budget = {
      maxSpend: params.budget ?? params.authority.maxSpend ?? 5.0,
      spent: 0,
      currency: "USD",
    }
    this.capabilities = [...params.capabilities]
    this.authority = params.authority
    this.context = params.context
    this.parentId = params.parentId
    this.mesh = params.mesh
  }

  /**
   * Spawn child worker with strict monotonic privilege narrowing
   */
  async spawnChild(params: {
    task: string
    requestedAuthority: Partial<Authority>
    capabilities: Capability[]
    priority?: number
    budget?: number
  }): Promise<WorkerInstance> {
    const childAuth = AuthorityManager.deriveChild(this.authority, params.requestedAuthority)

    const child = await this.mesh.spawn({
      task: params.task,
      priority: params.priority ?? Math.max(1, this.priority - 1),
      capabilities: params.capabilities,
      authority: childAuth,
      parentId: this.id,
      budget: params.budget ?? childAuth.maxSpend,
    })

    this.children.push(child.id)
    return child
  }

  /**
   * Evaluate and authorize an action intent before hitting external systems
   */
  authorize(action: ActionIntent): boolean {
    return this.mesh.authority.authorize(this.id, this.authority, action).allowed
  }

  /**
   * Deduct spend from worker budget
   */
  deductSpend(amount: number): boolean {
    if (this.budget.spent + amount > this.budget.maxSpend) {
      console.warn(`[Meshly Worker ${this.id}] Budget exceeded: cap is $${this.budget.maxSpend.toFixed(2)}, attempted $${(this.budget.spent + amount).toFixed(2)}`)
      return false
    }
    this.budget.spent += amount
    this.updatedAt = new Date()
    return true
  }

  /**
   * Pause execution and freeze leased physical environment
   */
  async pause(): Promise<void> {
    this.status = "PAUSED"
    this.updatedAt = new Date()
    if (this.environmentLease) {
      await this.mesh.broker.pause(this.environmentLease.environmentId)
    }
    this.mesh.events.emit("worker.paused", { workerId: this.id })
  }

  /**
   * Resume execution from snapshot
   */
  async resume(): Promise<void> {
    this.status = "RUNNING"
    this.updatedAt = new Date()
    if (this.environmentLease) {
      await this.mesh.broker.resume(this.environmentLease.environmentId)
    }
    this.mesh.events.emit("worker.resumed", { workerId: this.id })
  }

  /**
   * Cancel worker and propagate cancellation down the descendant tree
   */
  async cancel(reason: string = "User cancelled"): Promise<void> {
    this.status = "CANCELLED"
    this.updatedAt = new Date()

    if (this.environmentLease) {
      await this.mesh.broker.release(this.environmentLease.leaseId)
      this.environmentLease = undefined
    }

    this.mesh.events.emit("worker.cancelled", {
      workerId: this.id,
      data: { reason, childrenCancelledCount: this.children.length },
    })

    // Propagate cancellation to all children
    for (const childId of this.children) {
      const child = this.mesh.getWorker(childId)
      if (child && child.status !== "COMPLETED" && child.status !== "CANCELLED") {
        await child.cancel(`Parent worker ${this.id} cancelled`)
      }
    }
  }

  /**
   * Save a semantic checkpoint snapshot
   */
  checkpointState(step: number, verifiedWorldState?: Record<string, any>): CheckpointRef {
    const cp = this.mesh.checkpoints.create({
      workerId: this.id,
      step,
      stateSnapshot: {
        workerId: this.id,
        step,
        taskState: this.status,
        authorityScope: this.authority.capabilities,
        memorySnapshot: this.mesh.memory.snapshot(this.id),
        recentActionCount: this.context.recentActions.length,
        artifactsCount: this.context.artifacts.length,
        environmentId: this.environmentLease?.environmentId,
        leaseId: this.environmentLease?.leaseId,
        metadata: this.context.metadata,
      },
      environmentIds: this.environmentLease ? [this.environmentLease.environmentId] : [],
      verifiedWorldState,
      replayTimestampMs: Date.now(),
    })

    this.checkpoint = cp
    return cp
  }
}
