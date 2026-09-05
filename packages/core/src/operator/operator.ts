/**
 * @meshly/core - Operator Takeover Subsystem
 */
import { EventStore } from "../events/events.js"
import { ContextManager } from "../context/context.js"
import { EnvironmentBroker } from "../fabric/broker.js"

export interface TakeoverSession {
  sessionId: string
  workerId: string
  environmentId?: string
  streamUrl?: string
  startedAt: number
  active: boolean
}

export class OperatorManager {
  private activeSessions: Map<string, TakeoverSession> = new Map()
  private events: EventStore
  private contexts: ContextManager
  private broker: EnvironmentBroker

  constructor(events: EventStore, contexts: ContextManager, broker: EnvironmentBroker) {
    this.events = events
    this.contexts = contexts
    this.broker = broker
  }

  async takeover(workerId: string, environmentId?: string): Promise<TakeoverSession> {
    const sessionId = `op_${Date.now().toString(36)}`
    let streamUrl: string | undefined

    if (environmentId) {
      const env = this.broker.inspect(environmentId)
      streamUrl = env?.streamUrl || env?.replayUrl
    }

    const session: TakeoverSession = {
      sessionId,
      workerId,
      environmentId,
      streamUrl,
      startedAt: Date.now(),
      active: true,
    }

    this.activeSessions.set(sessionId, session)
    this.events.emit("human.intervention", {
      workerId,
      environmentId,
      data: { action: "takeover_started", sessionId, streamUrl },
    })

    return session
  }

  async releaseControl(sessionId: string, result: {
    manualActionDescription: string
    updatedState?: Record<string, any>
    verifiedManually: boolean
  }): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session || !session.active) return

    session.active = false
    this.activeSessions.delete(sessionId)

    this.contexts.recordAction(session.workerId, {
      tool: "human.intervention",
      args: { description: result.manualActionDescription },
      result: result.updatedState,
      authorized: true,
      verified: result.verifiedManually,
    })

    if (result.updatedState) {
      this.contexts.recordObservation(session.workerId, result.updatedState)
    }

    this.events.emit("human.intervention", {
      workerId: session.workerId,
      environmentId: session.environmentId,
      data: {
        action: "takeover_completed",
        sessionId,
        description: result.manualActionDescription,
        verifiedManually: result.verifiedManually,
      },
    })
  }

  getActiveSession(workerId: string): TakeoverSession | undefined {
    for (const s of this.activeSessions.values()) {
      if (s.workerId === workerId && s.active) return s
    }
    return undefined
  }
}
