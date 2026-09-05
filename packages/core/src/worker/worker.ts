/**
 * @meshly/core - Universal Worker Primitive
 */
import {
  Worker as IWorker,
  WorkerStatus,
  Capability,
  Authority,
  Budget,
  WorkerContext,
  MemoryRef,
  EnvironmentLease,
  CheckpointRef,
  VerificationState,
  VerificationContract,
  EvidenceBundle,
} from "../types.js"
import { AuthorityManager, ActionIntent } from "../authority/authority.js"

export class WorkerInstance implements IWorker {
  id: string
  task: string
  status: WorkerStatus = "CREATED"
  priority: number
  deadline?: Date
  budget: Budget
  capabilities: Capability[]
  authority: Authority
  context: WorkerContext
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
    context: WorkerContext
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

  async spawnChild(params: {
    task: string
    requestedAuthority: Partial<Authority>
    capabilities: Capability[]
    priority?: number
    budget?: number
  }): Promise<WorkerInstance> {
    const childAuth = AuthorityManager.delegate(this.authority, params.requestedAuthority)

    const child = await this.mesh.workers.spawn({
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

  authorize(action: ActionIntent): boolean {
    return this.mesh.authority.authorize(this.id, this.authority, action).allowed
  }

  deductSpend(amount: number): boolean {
    if (this.budget.spent + amount > this.budget.maxSpend) {
      console.warn(`[Worker ${this.id}] Budget exceeded: cap $${this.budget.maxSpend.toFixed(2)}, attempted $${(this.budget.spent + amount).toFixed(2)}`)
      return false
    }
    this.budget.spent += amount
    this.updatedAt = new Date()
    return true
  }

  async pause(): Promise<void> {
    this.status = "PAUSED"
    this.updatedAt = new Date()
    if (this.environmentLease) {
      await this.mesh.broker.pause(this.environmentLease.environmentId)
    }
    this.mesh.events.emit("worker.paused", { workerId: this.id })
  }

  async resume(): Promise<void> {
    this.status = "RUNNING"
    this.updatedAt = new Date()
    if (this.environmentLease) {
      await this.mesh.broker.resume(this.environmentLease.environmentId)
    }
    this.mesh.events.emit("worker.resumed", { workerId: this.id })
  }

  async cancel(reason: string = "Cancelled"): Promise<void> {
    this.status = "CANCELLED"
    this.updatedAt = new Date()

    if (this.environmentLease) {
      await this.mesh.broker.release(this.environmentLease.leaseId)
      this.environmentLease = undefined
    }

    this.mesh.events.emit("worker.cancelled", {
      workerId: this.id,
      data: { reason, childrenCount: this.children.length },
    })

    for (const childId of this.children) {
      const child = this.mesh.workers.get(childId)
      if (child && child.status !== "COMPLETED" && child.status !== "CANCELLED") {
        await child.cancel(`Parent ${this.id} cancelled`)
      }
    }
  }

  checkpointState(step: number, verifiedWorldState?: Record<string, any>): CheckpointRef {
    this.context.currentStep = step
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

  async execute(params: {
    action: () => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
    observe: () => Promise<Record<string, any>>
    verification: VerificationContract
  }): Promise<{ state: VerificationState; evidence?: EvidenceBundle }> {
    const res = await this.mesh.verifyStep({
      workerId: this.id,
      contract: params.verification,
      executeAction: params.action,
      observeState: params.observe,
    })

    this.verificationState = res.state
    return res
  }

  async handoff(newTask: string): Promise<WorkerInstance> {
    return this.mesh.handoff(this.id, newTask)
  }
}
