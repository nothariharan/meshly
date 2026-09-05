/**
 * @meshly/core - Multi-Factor Intelligent Scheduler
 * Computes scores across Priority, Urgency, Warm-Pool Reuse, Profile Affinity, and Budget Margin.
 * Emits observable, auditable scheduler decisions.
 */
import { Worker, EnvironmentLease, SchedulerDecision } from "../types.js"
import { EnvironmentBroker, AcquireRequirements } from "../fabric/broker.js"
import { EventStore } from "../events/events.js"

export interface ScheduleCandidate {
  worker: Worker
  score: number
  affinityMatch: boolean
  targetType: "browser" | "sandbox" | "desktop"
  reasons: string[]
}

export class Scheduler {
  private queue: Worker[] = []
  private activeWorkers: Map<string, Worker> = new Map()
  private maxConcurrency: number
  private broker: EnvironmentBroker
  private events: EventStore
  private recentDecisions: SchedulerDecision[] = []

  constructor(broker: EnvironmentBroker, events: EventStore, maxConcurrency: number = 10) {
    this.broker = broker
    this.events = events
    this.maxConcurrency = maxConcurrency
  }

  enqueue(worker: Worker): void {
    worker.status = "QUEUED"
    this.queue.push(worker)
    this.events.emit("worker.scheduled", {
      workerId: worker.id,
      data: { priority: worker.priority, task: worker.task, queuePosition: this.queue.length },
    })
  }

  calculateScore(worker: Worker): ScheduleCandidate {
    let score = worker.priority * 20
    const reasons: string[] = [`✓ Base priority: ${worker.priority} (weight +${worker.priority * 20})`]

    if (worker.deadline) {
      const msLeft = worker.deadline.getTime() - Date.now()
      if (msLeft <= 0) {
        score += 150
        reasons.push("⚡ Deadline overdue (+150 urgency boost)")
      } else if (msLeft < 60_000) {
        score += 100
        reasons.push("⚡ Deadline < 1m (+100 urgency boost)")
      } else if (msLeft < 5 * 60_000) {
        score += 50
        reasons.push("⚡ Deadline < 5m (+50 urgency boost)")
      }
    }

    const targetType: "browser" | "sandbox" | "desktop" = worker.capabilities.includes("desktop")
      ? "desktop"
      : worker.capabilities.includes("browser")
      ? "browser"
      : "sandbox"

    reasons.push(`✓ Target compute primitive: ${targetType}`)

    let affinityMatch = false
    const idleEnvs = this.broker.list().filter((e) => e.status === "IDLE" && e.type === targetType)
    if (idleEnvs.length > 0) {
      score += 40
      reasons.push(`✓ Warm idle environment available in pool (+40 warm bonus)`)

      const requestedProfile = worker.context.metadata?.profile
      if (requestedProfile && idleEnvs.some((e) => e.profile === requestedProfile)) {
        score += 40
        affinityMatch = true
        reasons.push(`✓ Exact profile affinity match for '${requestedProfile}' (+40 affinity bonus)`)
      }
    } else {
      reasons.push(`○ Cold provisioning required (0 warm idle available)`)
    }

    const budgetMargin = worker.budget.maxSpend - worker.budget.spent
    if (budgetMargin <= 0) {
      score -= 200
      reasons.push("✗ Budget exhausted (-200 disqualification)")
    } else if (budgetMargin < 0.2) {
      score -= 30
      reasons.push("! Low budget margin (-30 penalty)")
    } else {
      reasons.push(`✓ Budget healthy: $${budgetMargin.toFixed(2)} remaining`)
    }

    return { worker, score, targetType, affinityMatch, reasons }
  }

  async scheduleNext(): Promise<{ worker?: Worker; lease?: EnvironmentLease; score?: number; decision?: SchedulerDecision }> {
    if (this.activeWorkers.size >= this.maxConcurrency || this.queue.length === 0) {
      return {}
    }

    const candidates = this.queue.map((w) => this.calculateScore(w))
    candidates.sort((a, b) => b.score - a.score)

    const selected = candidates[0]
    if (!selected) return {}

    const worker = selected.worker

    if (worker.budget.spent >= worker.budget.maxSpend) {
      this.removeFromQueue(worker.id)
      worker.status = "FAILED"
      this.events.emit("worker.failed", {
        workerId: worker.id,
        data: { reason: "Budget exhausted before scheduling" },
      })
      return {}
    }

    const acquireReq: AcquireRequirements = {
      workerId: worker.id,
      type: selected.targetType,
      capabilities: worker.capabilities,
      affinity: {
        profile: worker.context.metadata?.profile,
        files: worker.context.metadata?.files,
      },
      authority: worker.authority,
      budget: worker.budget.maxSpend - worker.budget.spent,
    }

    try {
      const lease = await this.broker.acquire(acquireReq)
      this.removeFromQueue(worker.id)

      worker.environmentLease = lease
      worker.status = "RUNNING"
      this.activeWorkers.set(worker.id, worker)

      const decision: SchedulerDecision = {
        workerId: worker.id,
        environmentId: lease.environmentId,
        timestamp: Date.now(),
        reasons: selected.reasons,
        score: selected.score,
        targetType: selected.targetType,
        profileMatched: selected.affinityMatch ? worker.context.metadata?.profile : undefined,
      }

      this.recentDecisions.unshift(decision)
      if (this.recentDecisions.length > 50) this.recentDecisions.pop()

      this.events.emit("worker.scheduled", {
        workerId: worker.id,
        environmentId: lease.environmentId,
        leaseId: lease.leaseId,
        data: {
          decision: "SCHEDULED",
          score: selected.score,
          reasons: selected.reasons,
        },
      })

      return { worker, lease, score: selected.score, decision }
    } catch (err: any) {
      console.error(`[Meshly Scheduler] Allocation failed for worker ${worker.id}: ${err.message}`)
      return {}
    }
  }

  markCompleted(workerId: string): void {
    const worker = this.activeWorkers.get(workerId)
    if (worker) {
      worker.status = "COMPLETED"
      this.activeWorkers.delete(workerId)
      if (worker.environmentLease) {
        this.broker.release(worker.environmentLease.leaseId)
      }
      this.events.emit("worker.completed", { workerId, data: { finalSpend: worker.budget.spent } })
    }
  }

  markFailed(workerId: string, error?: string): void {
    const worker = this.activeWorkers.get(workerId)
    if (worker) {
      worker.status = "FAILED"
      this.activeWorkers.delete(workerId)
      if (worker.environmentLease) {
        this.broker.release(worker.environmentLease.leaseId)
      }
      this.events.emit("worker.failed", { workerId, data: { error: error || "Unknown failure" } })
    }
  }

  private removeFromQueue(workerId: string): void {
    const idx = this.queue.findIndex((w) => w.id === workerId)
    if (idx !== -1) this.queue.splice(idx, 1)
  }

  getQueueLength(): number {
    return this.queue.length
  }

  getActiveCount(): number {
    return this.activeWorkers.size
  }

  getQueue(): Worker[] {
    return [...this.queue]
  }

  getActiveWorkers(): Worker[] {
    return Array.from(this.activeWorkers.values())
  }

  getRecentDecisions(): SchedulerDecision[] {
    return [...this.recentDecisions]
  }
}
