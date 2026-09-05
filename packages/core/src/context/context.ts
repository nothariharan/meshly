/**
 * @meshly/core - Model-Independent Context Subsystem
 * Decouples task state, observations, plans, and actions from LLM conversation strings.
 */
import { WorkerContext, ActionRecord, ArtifactRecord } from "../types.js"
import { EventStore } from "../events/events.js"

export class ContextManager {
  private contexts: Map<string, WorkerContext> = new Map()
  private events?: EventStore

  constructor(events?: EventStore) {
    this.events = events
  }

  init(workerId: string, task: string, objective?: string): WorkerContext {
    const ctx: WorkerContext = {
      workerId,
      task,
      objective: objective || task,
      currentStep: 0,
      plan: [],
      environmentState: "COLD",
      recentActions: [],
      artifacts: [],
      relevantMemory: [],
      metadata: {},
    }
    this.contexts.set(workerId, ctx)
    return ctx
  }

  get(workerId: string): WorkerContext | undefined {
    return this.contexts.get(workerId)
  }

  update(workerId: string, patch: Partial<WorkerContext>): WorkerContext {
    const ctx = this.contexts.get(workerId)
    if (!ctx) throw new Error(`Context not found for worker ${workerId}`)
    Object.assign(ctx, patch)
    return ctx
  }

  recordAction(workerId: string, action: Omit<ActionRecord, "step" | "timestamp">): ActionRecord {
    const ctx = this.contexts.get(workerId)
    if (!ctx) throw new Error(`Context not found for worker ${workerId}`)

    ctx.currentStep += 1
    const record: ActionRecord = {
      ...action,
      step: ctx.currentStep,
      timestamp: Date.now(),
    }

    ctx.recentActions.push(record)
    if (ctx.recentActions.length > 20) {
      ctx.recentActions.shift()
    }

    if (this.events) {
      this.events.emit("action.executed", {
        workerId,
        data: { step: record.step, tool: record.tool, verified: record.verified },
      })
    }
    return record
  }

  recordObservation(workerId: string, observation: any): void {
    const ctx = this.contexts.get(workerId)
    if (!ctx) return
    ctx.lastObservation = observation

    if (this.events) {
      this.events.emit("observation.captured", {
        workerId,
        data: { step: ctx.currentStep },
      })
    }
  }

  addArtifact(workerId: string, artifact: Omit<ArtifactRecord, "createdAt">): void {
    const ctx = this.contexts.get(workerId)
    if (!ctx) return
    ctx.artifacts.push({ ...artifact, createdAt: Date.now() })
  }

  snapshot(workerId: string): WorkerContext {
    const ctx = this.contexts.get(workerId)
    if (!ctx) throw new Error(`Worker context not found for ${workerId}`)
    return JSON.parse(JSON.stringify(ctx))
  }

  restore(workerId: string, snapshot: WorkerContext): WorkerContext {
    const restored = JSON.parse(JSON.stringify(snapshot))
    restored.workerId = workerId
    this.contexts.set(workerId, restored)
    return restored
  }

  transfer(fromWorkerId: string, toWorkerId: string): WorkerContext {
    const source = this.contexts.get(fromWorkerId)
    if (!source) throw new Error(`Cannot transfer context: source worker ${fromWorkerId} not found`)

    const transferred: WorkerContext = {
      ...JSON.parse(JSON.stringify(source)),
      workerId: toWorkerId,
      metadata: {
        ...source.metadata,
        handedOffFrom: fromWorkerId,
        handedOffAt: Date.now(),
      },
    }

    this.contexts.set(toWorkerId, transferred)
    if (this.events) {
      this.events.emit("worker.handoff", {
        workerId: toWorkerId,
        data: { fromWorkerId, currentStep: transferred.currentStep },
      })
    }
    return transferred
  }
}
