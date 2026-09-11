/**
 * @meshly/core - Worker Manager
 */
import { WorkerInstance } from "./worker.js"
import { Capability, Authority } from "../types.js"
import { AuthorityManager } from "../authority/authority.js"

export class WorkerManager {
  private workers: Map<string, WorkerInstance> = new Map()
  private mesh: any

  constructor(mesh: any) {
    this.mesh = mesh
  }

  async spawn(params: {
    task: string
    capabilities: Capability[]
    name?: string
    id?: string
    kind?: import("../types.js").WorkerKind
    priority?: number
    deadline?: Date
    budget?: number
    authority?: Authority
    parentId?: string
    metadata?: Record<string, any>
    initialMemory?: Array<{ key: string; value: any; tier?: "hot" | "warm" | "cold" }>
    limits?: Partial<import("../types.js").WorkerLimits>
  }): Promise<WorkerInstance> {
    const workerId = params.id || `wrk_${Math.random().toString(36).slice(2, 9)}`

    const auth =
      params.authority ??
      AuthorityManager.issue({
        tools: ["*"],
        capabilities: ["*"],
        maxSpend: params.budget ?? 5.0,
      })

    const ctx = this.mesh.contexts.init(workerId, params.task)
    if (params.metadata) {
      ctx.metadata = { ...params.metadata }
    }
    if (params.name) {
      ctx.metadata = { ...ctx.metadata, name: params.name }
    }

    const worker = new WorkerInstance({
      id: workerId,
      name: params.name,
      kind: params.kind,
      task: params.task,
      priority: params.priority ?? 5,
      deadline: params.deadline,
      budget: params.budget ?? auth.maxSpend,
      limits: params.limits || this.mesh.defaultLimits,
      capabilities: params.capabilities,
      authority: auth,
      context: ctx,
      parentId: params.parentId,
      mesh: this.mesh,
    })

    this.workers.set(workerId, worker)

    if (params.initialMemory) {
      for (const m of params.initialMemory) {
        this.mesh.memory.put({
          workerId,
          key: m.key,
          value: m.value,
          tier: m.tier ?? "hot",
        })
      }
    }

    this.mesh.events.emit("worker.created", {
      workerId,
      data: { task: worker.task, priority: worker.priority, capabilities: worker.capabilities },
    })

    this.mesh.scheduler.enqueue(worker)
    return worker
  }

  get(workerId: string): WorkerInstance | undefined {
    return this.workers.get(workerId)
  }

  find(nameOrId: string): WorkerInstance | undefined {
    return this.workers.get(nameOrId) || this.list().find((w) => w.name === nameOrId)
  }

  list(): WorkerInstance[] {
    return Array.from(this.workers.values())
  }

  async cancel(workerId: string, reason?: string): Promise<void> {
    const worker = this.workers.get(workerId)
    if (worker) await worker.cancel(reason)
  }

  get size(): number {
    return this.workers.size
  }

  restore(worker: WorkerInstance): void {
    this.workers.set(worker.id, worker)
  }
}
