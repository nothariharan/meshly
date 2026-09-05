/**
 * @meshly/core - Failure Injection Engine
 */
import { EventStore } from "../events/events.js"
import { EnvironmentBroker } from "../fabric/broker.js"
import { WorkerInstance } from "../worker/worker.js"

export type FailureScenario =
  | "environment-loss"
  | "verification-mismatch"
  | "authority-expired"
  | "budget-exhausted"
  | "agent-crash"
  | "duplicate-action"

export interface InjectedFailureResult {
  scenario: FailureScenario | string
  targetId: string
  timestamp: number
  meshlyReaction: string
}

export class FailureInjector {
  private events: EventStore
  private broker: EnvironmentBroker

  constructor(events: EventStore, broker: EnvironmentBroker) {
    this.events = events
    this.broker = broker
  }

  async inject(params: {
    type: "CRASH_ENVIRONMENT" | "EXPIRE_AUTHORITY" | "EXHAUST_BUDGET" | "CRASH_AGENT" | string
    targetEnvironmentId?: string
    targetWorker?: WorkerInstance
  }): Promise<InjectedFailureResult> {
    switch (params.type) {
      case "CRASH_ENVIRONMENT":
        if (!params.targetEnvironmentId) throw new Error("targetEnvironmentId required")
        return this.injectEnvironmentLoss(params.targetEnvironmentId)
      case "EXPIRE_AUTHORITY":
        if (!params.targetWorker) throw new Error("targetWorker required")
        return this.injectAuthorityExpiry(params.targetWorker)
      case "EXHAUST_BUDGET":
        if (!params.targetWorker) throw new Error("targetWorker required")
        return this.injectBudgetExhaustion(params.targetWorker)
      case "CRASH_AGENT":
        if (!params.targetWorker) throw new Error("targetWorker required")
        return this.injectAgentCrash(params.targetWorker)
      default:
        throw new Error(`Unknown failure type: ${params.type}`)
    }
  }

  async injectEnvironmentLoss(environmentId: string): Promise<InjectedFailureResult> {
    const env = this.broker.inspect(environmentId)
    if (env) {
      env.status = "LOST"
    }

    this.events.emit("environment.lost", {
      environmentId,
      data: { simulated: true, reason: "Injected network timeout / hypervisor drop" },
    })

    return {
      scenario: "environment-loss",
      targetId: environmentId,
      timestamp: Date.now(),
      meshlyReaction: "Environment marked LOST; broker halts I/O and pauses active lease",
    }
  }

  async injectAuthorityExpiry(worker: WorkerInstance): Promise<InjectedFailureResult> {
    worker.authority.expiresAt = new Date(Date.now() - 1000)

    this.events.emit("authority.revoked", {
      workerId: worker.id,
      data: { simulated: true, reason: "Injected authority lease timeout" },
    })

    return {
      scenario: "authority-expired",
      targetId: worker.id,
      timestamp: Date.now(),
      meshlyReaction: "Policy interceptor blocks all subsequent tool actions with LEASE_EXPIRED",
    }
  }

  injectBudgetExhaustion(worker: WorkerInstance): InjectedFailureResult {
    worker.budget.spent = worker.budget.maxSpend

    return {
      scenario: "budget-exhausted",
      targetId: worker.id,
      timestamp: Date.now(),
      meshlyReaction: "Scheduler disqualifies worker and marks FAILED on next dispatch cycle",
    }
  }

  async injectAgentCrash(worker: WorkerInstance): Promise<InjectedFailureResult> {
    await worker.cancel("Simulated agent crash")

    return {
      scenario: "agent-crash",
      targetId: worker.id,
      timestamp: Date.now(),
      meshlyReaction: "Worker status set to CANCELLED; cancellation propagated down descendant tree",
    }
  }
}
