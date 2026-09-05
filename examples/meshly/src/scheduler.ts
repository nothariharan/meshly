/**
 * Meshly Multi-Factor Intelligent Scheduler
 * Computes dynamic dispatch score based on Priority, Deadline Urgency,
 * Environment Reuse / Affinity, Capability Match, Budget Feasibility, and Tenant Fairness.
 */
import { Worker, EnvironmentLease } from "./types.js"
import { EnvironmentBroker, AcquireRequirements } from "./environment.js"
import { EventStore } from "./events.js"

export interface ScheduleCandidate {
  worker: Worker
  score: number
  affinityMatch: boolean
  targetType: "browser" | "sandbox" | "desktop"
}

export class Scheduler {
  private queue: Worker[] = []
  private activeWorkers: Map<string, Worker> = new Map()
  private maxConcurrency: number
  private broker: EnvironmentBroker
  private events: EventStore

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

  /**
   * Calculate multi-factor schedule score for a worker
   */
  calculateScore(worker: Worker): { score: number; targetType: "browser" | "sandbox" | "desktop"; affinityMatch: boolean } {
    let score = worker.priority * 20 // Base priority weight (0-10 -> 0-200)

    // Deadline urgency (0 to 150 points)
    if (worker.deadline) {
      const msLeft = worker.deadline.getTime() - Date.now()
      if (msLeft <= 0) {
        score += 150 // Overdue or immediate
      } else if (msLeft < 60_000) {
        score += 100 // Within 1 minute
      } else if (msLeft < 5 * 60_000) {
        score += 50
      }
    }

    // Determine target primary capability
    const targetType: "browser" | "sandbox" | "desktop" = worker.capabilities.includes("desktop")
      ? "desktop"
      : worker.capabilities.includes("browser")
      ? "browser"
      : "sandbox"

    // Environment reuse & affinity bonus (80 points if warm environment waiting)
    let affinityMatch = false
    const idleEnvs = this.broker.list().filter((e) => e.status === "IDLE" && e.type === targetType)
    if (idleEnvs.length > 0) {
      score += 40 // Warm reuse bonus
      // Check if profile matches
      const requestedProfile = worker.context.metadata?.profile
      if (requestedProfile && idleEnvs.some((e) => e.profile === requestedProfile)) {
        score += 40 // Exact profile affinity bonus
        affinityMatch = true
      }
    }

    // Budget feasibility penalty if spend close to cap
    const budgetMargin = worker.budget.maxSpend - worker.budget.spent
    if (budgetMargin <= 0) {
      score -= 200 // Disqualify / heavily penalize
    } else if (budgetMargin < 0.2) {
      score -= 30
    }

    return { score, targetType, affinityMatch }
  }

  /**
   * Schedule the next highest-scoring worker if concurrency and environments allow
   */
  async scheduleNext(): Promise<{ worker?: Worker; lease?: EnvironmentLease; score?: number }> {
    if (this.activeWorkers.size >= this.maxConcurrency || this.queue.length === 0) {
      return {}
    }

    // Score all candidates
    const scoredCandidates: ScheduleCandidate[] = this.queue.map((worker) => {
      const { score, targetType, affinityMatch } = this.calculateScore(worker)
      return { worker, score, targetType, affinityMatch }
    })

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score)

    const selected = scoredCandidates[0]
    if (!selected) return {}

    const worker = selected.worker

    // Check budget feasibility
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

      return { worker, lease, score: selected.score }
    } catch (err: any) {
      console.error(`[Meshly Scheduler] Failed to acquire environment for worker ${worker.id}: ${err.message}`)
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
      this.events.emit("worker.completed", {
        workerId,
        data: { finalSpend: worker.budget.spent },
      })
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
      this.events.emit("worker.failed", {
        workerId,
        data: { error: error || "Unknown failure" },
      })
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
}
