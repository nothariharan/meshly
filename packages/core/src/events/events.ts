/**
 * @meshly/core - Immutable Append-Only Event Store
 */
import { MeshlyEvent, EventType } from "../types.js"

export class EventStore {
  private events: MeshlyEvent[] = []
  private listeners: Array<(event: MeshlyEvent) => void> = []

  emit(type: EventType, params: { workerId?: string; environmentId?: string; leaseId?: string; data?: Record<string, any> }): MeshlyEvent {
    const event: MeshlyEvent = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
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
    environmentId?: string
    since?: number
    limit?: number
  } = {}): MeshlyEvent[] {
    const types = filter.type ? (Array.isArray(filter.type) ? filter.type : [filter.type]) : undefined

    let matches = this.events.filter((e) => {
      if (types && !types.includes(e.type)) return false
      if (filter.workerId && e.workerId !== filter.workerId) return false
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

  get count(): number {
    return this.events.length
  }

  exportJson(): string {
    return JSON.stringify(this.events, null, 2)
  }
}
