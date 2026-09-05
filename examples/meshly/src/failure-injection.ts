/**
 * Meshly Failure Injection Engine (Developer Testing Mode)
 * Exercises Meshly's control plane semantics by simulating distributed failures:
 *   - Environment loss / network drop
 *   - Tool timeout / partial write
 *   - Verification mismatch (agent claim vs reality divergence)
 *   - Expired authority / lease revocation
 *   - Budget exhaustion
 *   - Worker crash / child cascade cancellation
 */
import { EventStore } from "./events.js"
import { EnvironmentBroker } from "./environment.js"
import { WorkerInstance } from "./worker.js"

export type FailureType =
  | "ENVIRONMENT_LOSS"
  | "TOOL_TIMEOUT"
  | "REALITY_MISMATCH"
  | "AUTHORITY_EXPIRED"
  | "BUDGET_EXHAUSTED"
  | "WORKER_CRASH"
  | "CHILD_CANCELLATION"

export interface InjectedFailureResult {
  type: FailureType
  targetId: string
  simulatedAt: number
  meshlyReaction: string
}

export class FailureInjector {
  private events: EventStore
  private broker: EnvironmentBroker

  constructor(events: EventStore, broker: EnvironmentBroker) {
    this.events = events
    this.broker = broker
  }

  /**
   * Simulate sudden environment loss / connection drop
   */
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
      type: "ENVIRONMENT_LOSS",
      targetId: environmentId,
      simulatedAt: Date.now(),
      meshlyReaction: "Environment marked LOST; broker triggers lease revocation & worker pause",
    }
  }

  /**
   * Simulate worker authority lease expiration
   */
  async injectAuthorityExpiry(worker: WorkerInstance): Promise<InjectedFailureResult> {
    worker.authority.expiresAt = new Date(Date.now() - 1000)

    this.events.emit("authority.revoked", {
      workerId: worker.id,
      data: { simulated: true, reason: "Injected authority lease timeout" },
    })

    return {
      type: "AUTHORITY_EXPIRED",
      targetId: worker.id,
      simulatedAt: Date.now(),
      meshlyReaction: "Policy interceptor blocks all subsequent tool actions with LEASE_EXPIRED",
    }
  }

  /**
   * Simulate worker budget exhaustion
   */
  injectBudgetExhaustion(worker: WorkerInstance): InjectedFailureResult {
    worker.budget.spent = worker.budget.maxSpend

    return {
      type: "BUDGET_EXHAUSTED",
      targetId: worker.id,
      simulatedAt: Date.now(),
      meshlyReaction: "Scheduler disqualifies worker and marks FAILED on next dispatch cycle",
    }
  }

  /**
   * Simulate parent worker crash with descendant cancellation cascade
   */
  async injectWorkerCrash(worker: WorkerInstance): Promise<InjectedFailureResult> {
    await worker.cancel("Simulated worker crash")

    return {
      type: "WORKER_CRASH",
      targetId: worker.id,
      simulatedAt: Date.now(),
      meshlyReaction: "Worker status set to CANCELLED; cancellation propagated to all child workers",
    }
  }
}
