/**
 * @meshly/core - Immutable Append-Only Event Store
 * Guarantees monotonic sequence numbering and causal event ordering.
 */
import { MeshlyEvent, EventType } from "../types.js"

export class EventStore {
  private events: MeshlyEvent[] = []
  private listeners: Array<(event: MeshlyEvent) => void> = []
  private sequenceCounter: number = 0
  private lastEventIdByWorker: Map<string, string> = new Map()

  emit(type: EventType, params: {
    workerId?: string
    runId?: string
    environmentId?: string
    leaseId?: string
    parentEventId?: string
    data?: Record<string, any>
  }): MeshlyEvent {
    this.sequenceCounter += 1
    const eventId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const parentEventId = params.parentEventId || (params.workerId ? this.lastEventIdByWorker.get(params.workerId) : undefined)

    const event: MeshlyEvent = {
      id: eventId,
      runId: params.runId,
      sequence: this.sequenceCounter,
      parentEventId,
      type,
      timestamp: Date.now(),
      workerId: params.workerId,
      environmentId: params.environmentId,
      leaseId: params.leaseId,
      data: params.data ? JSON.parse(JSON.stringify(params.data)) : {},
    }

    Object.freeze(event)
    Object.freeze(event.data)
    this.events.push(event)

    if (params.workerId) {
      this.lastEventIdByWorker.set(params.workerId, eventId)
    }

    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error("[Meshly EventStore] Listener exception:", err)
      }
    }

    return event
  }

  subscribe(listener: (event: MeshlyEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  query(filter: {
    type?: EventType | EventType[]
    workerId?: string
    runId?: string
    environmentId?: string
    since?: number
    limit?: number
  } = {}): MeshlyEvent[] {
    const types = filter.type ? (Array.isArray(filter.type) ? filter.type : [filter.type]) : undefined

    let matches = this.events.filter((e) => {
      if (types && !types.includes(e.type)) return false
      if (filter.workerId && e.workerId !== filter.workerId) return false
      if (filter.runId && e.runId !== filter.runId) return false
      if (filter.environmentId && e.environmentId !== filter.environmentId) return false
      if (filter.since && e.timestamp < filter.since) return false
      return true
    })

    if (filter.limit && matches.length > filter.limit) {
      matches = matches.slice(-filter.limit)
    }

    return matches
  }

  getTimeline(workerId: string): MeshlyEvent[] {
    return this.events.filter((e) => e.workerId === workerId)
  }

  getRunTimeline(runId: string): MeshlyEvent[] {
    return this.events.filter((e) => e.runId === runId)
  }

  get count(): number {
    return this.events.length
  }

  exportJson(): string {
    return JSON.stringify(this.events, null, 2)
  }
}
