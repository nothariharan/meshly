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
      AuthorityManager.issue({
        tools: ["*"],
        capabilities: ["*"],
        maxSpend: params.budget ?? 5.0,
      })

    const ctx = this.mesh.contexts.init(workerId, params.task)
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
}
