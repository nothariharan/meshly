/**
 * Meshly Model-Independent Context Subsystem
 * Decouples cognitive task context, state machines, and recent actions from LLM chat strings.
 * Enables zero-loss agent handoffs (e.g. GPT -> Claude -> local model) without conversation replay bloat.
 */
import { ContextRef, ActionRecord, ArtifactRecord, MemoryRef } from "./types.js"
import { EventStore } from "./events.js"

export class ContextManager {
  private contexts: Map<string, ContextRef> = new Map()
  private events?: EventStore

  constructor(events?: EventStore) {
    this.events = events
  }

  init(workerId: string, task: string, objective?: string): ContextRef {
    const ctx: ContextRef = {
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

  get(workerId: string): ContextRef | undefined {
    return this.contexts.get(workerId)
  }

  update(workerId: string, patch: Partial<ContextRef>): ContextRef {
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

    // Bounded ring-buffer of last 20 actions to prevent memory bloat
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
        data: { step: ctx.currentStep, observationSummary: typeof observation === "object" ? Object.keys(observation) : "scalar" },
      })
    }
  }

  addArtifact(workerId: string, artifact: Omit<ArtifactRecord, "createdAt">): void {
    const ctx = this.contexts.get(workerId)
    if (!ctx) return
    ctx.artifacts.push({ ...artifact, createdAt: Date.now() })
  }

  /**
   * Snapshot full context for recovery or checkpointing
   */
  snapshot(workerId: string): ContextRef {
    const ctx = this.contexts.get(workerId)
    if (!ctx) throw new Error(`Cannot snapshot context: worker ${workerId} not found`)
    return JSON.parse(JSON.stringify(ctx))
  }

  /**
   * Restore context from snapshot
   */
  restore(workerId: string, snapshot: ContextRef): ContextRef {
    const restored = JSON.parse(JSON.stringify(snapshot))
    restored.workerId = workerId
    this.contexts.set(workerId, restored)
    return restored
  }

  /**
   * Seamless Model-Agnostic Agent Handoff:
   * Transfers full cognitive state, plans, actions, and observations to a new worker.
   */
  transfer(fromWorkerId: string, toWorkerId: string): ContextRef {
    const source = this.contexts.get(fromWorkerId)
    if (!source) throw new Error(`Cannot transfer context: source worker ${fromWorkerId} not found`)

    const transferred: ContextRef = {
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
        data: { fromWorkerId, activeStep: transferred.currentStep },
      })
    }

    return transferred
  }
}
