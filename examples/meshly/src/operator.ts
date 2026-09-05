/**
 * Meshly Operator Takeover Subsystem
 * Allows human supervisors to pause a worker, inspect live Solari streams,
 * perform manual interventions, and return control with verified state transitions.
 */
import { EventStore } from "./events.js"
import { ContextManager } from "./context.js"
import { EnvironmentBroker } from "./environment.js"

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

  /**
   * Pause worker compute and initiate human takeover session
   */
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
      data: {
        action: "takeover_started",
        sessionId,
        streamUrl,
      },
    })

    return session
  }

  /**
   * Return control back to worker with updated state and manual action notes
   */
  async releaseControl(sessionId: string, interventionResult: {
    manualActionDescription: string
    updatedState?: Record<string, any>
    verifiedManually: boolean
  }): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session || !session.active) return

    session.active = false
    this.activeSessions.delete(sessionId)

    // Update worker context with human notes
    this.contexts.recordAction(session.workerId, {
      tool: "human.intervention",
      args: { description: interventionResult.manualActionDescription },
      result: interventionResult.updatedState,
      authorized: true,
      verified: interventionResult.verifiedManually,
    })

    if (interventionResult.updatedState) {
      this.contexts.recordObservation(session.workerId, interventionResult.updatedState)
    }

    this.events.emit("human.intervention", {
      workerId: session.workerId,
      environmentId: session.environmentId,
      data: {
        action: "takeover_completed",
        sessionId,
        description: interventionResult.manualActionDescription,
        verifiedManually: interventionResult.verifiedManually,
      },
    })
  }
}
