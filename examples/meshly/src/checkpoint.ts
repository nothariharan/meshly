/**
 * Meshly Semantic Checkpointing & Time-Travel Subsystem
 * Persists machine-verifiable operational snapshots containing verified world states,
 * active environment references, authority scopes, memory tiers, and action receipts.
 */
import { CheckpointRef } from "./types.js"
import { EventStore } from "./events.js"

export interface SemanticSnapshot {
  workerId: string
  step: number
  taskState: string
  lastVerifiedWorldState?: Record<string, any>
  nextExpectedStep?: string
  environmentId?: string
  leaseId?: string
  authorityScope: string[]
  memorySnapshot: Record<string, any>
  recentActionCount: number
  artifactsCount: number
  metadata: Record<string, any>
}

export class CheckpointManager {
  private checkpoints: Map<string, CheckpointRef> = new Map()
  private workerCheckpoints: Map<string, string[]> = new Map()
  private events?: EventStore

  constructor(events?: EventStore) {
    this.events = events
  }

  create(params: {
    workerId: string
    step: number
    stateSnapshot: SemanticSnapshot | Record<string, any>
    environmentIds: string[]
    verifiedWorldState?: Record<string, any>
    replayTimestampMs?: number
  }): CheckpointRef {
    const cpId = `cp_${params.workerId}_s${params.step}_${Date.now().toString(36)}`

    const cp: CheckpointRef = {
      id: cpId,
      workerId: params.workerId,
      step: params.step,
      stateSnapshot: JSON.parse(JSON.stringify(params.stateSnapshot)),
      environmentIds: [...params.environmentIds],
      timestamp: Date.now(),
      replayTimestampMs: params.replayTimestampMs,
      verifiedWorldState: params.verifiedWorldState ? JSON.parse(JSON.stringify(params.verifiedWorldState)) : undefined,
    }

    this.checkpoints.set(cpId, cp)

    const list = this.workerCheckpoints.get(params.workerId) ?? []
    list.push(cpId)
    this.workerCheckpoints.set(params.workerId, list)

    if (this.events) {
      this.events.emit("checkpoint.created", {
        workerId: params.workerId,
        data: { checkpointId: cpId, step: params.step, environmentCount: params.environmentIds.length },
      })
    }

    return cp
  }

  get(checkpointId: string): CheckpointRef | undefined {
    return this.checkpoints.get(checkpointId)
  }

  getLatestForWorker(workerId: string): CheckpointRef | undefined {
    const list = this.workerCheckpoints.get(workerId)
    if (!list || list.length === 0) return undefined
    return this.checkpoints.get(list[list.length - 1])
  }

  listForWorker(workerId: string): CheckpointRef[] {
    const list = this.workerCheckpoints.get(workerId) ?? []
    return list.map((id) => this.checkpoints.get(id)!).filter(Boolean)
  }
}
