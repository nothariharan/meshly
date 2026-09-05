/**
 * Meshly Lease Subsystem
 * Couples compute lifecycle directly to permission and authority lifecycles.
 */
import { EnvironmentLease, Authority, Capability } from "./types.js"
import { EventStore } from "./events.js"

export interface CreateLeaseParams {
  workerId: string
  environmentId: string
  capabilities: Capability[]
  budget: number
  authority: Authority
  durationMs?: number
}

export class LeaseManager {
  private leases: Map<string, EnvironmentLease> = new Map()
  private events: EventStore
  private onLeaseExpired?: (lease: EnvironmentLease) => Promise<void>

  constructor(events: EventStore, onLeaseExpired?: (lease: EnvironmentLease) => Promise<void>) {
    this.events = events
    this.onLeaseExpired = onLeaseExpired
  }

  create(params: CreateLeaseParams): EnvironmentLease {
    const duration = params.durationMs ?? 5 * 60_000 // 5 minutes default
    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + duration)

    const lease: EnvironmentLease = {
      leaseId: `lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      workerId: params.workerId,
      environmentId: params.environmentId,
      createdAt,
      expiresAt,
      capabilities: [...params.capabilities],
      budget: params.budget,
      authority: params.authority,
      status: "ACTIVE",
    }

    this.leases.set(lease.leaseId, lease)

    this.events.emit("lease.granted", {
      workerId: lease.workerId,
      environmentId: lease.environmentId,
      leaseId: lease.leaseId,
      data: {
        expiresAt: lease.expiresAt.toISOString(),
        budget: lease.budget,
        capabilities: lease.capabilities,
      },
    })

    return lease
  }

  get(leaseId: string): EnvironmentLease | undefined {
    return this.leases.get(leaseId)
  }

  getActiveForWorker(workerId: string): EnvironmentLease | undefined {
    for (const lease of this.leases.values()) {
      if (lease.workerId === workerId && lease.status === "ACTIVE" && lease.expiresAt.getTime() > Date.now()) {
        return lease
      }
    }
    return undefined
  }

  async release(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.status !== "ACTIVE") return

    lease.status = "RELEASED"
    this.events.emit("environment.released", {
      workerId: lease.workerId,
      environmentId: lease.environmentId,
      leaseId: lease.leaseId,
      data: { reason: "Worker released lease normally" },
    })
  }

  async revoke(leaseId: string, reason: string): Promise<void> {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.status !== "ACTIVE") return

    lease.status = "REVOKED"
    this.events.emit("lease.revoked", {
      workerId: lease.workerId,
      environmentId: lease.environmentId,
      leaseId: lease.leaseId,
      data: { reason },
    })

    if (this.onLeaseExpired) {
      await this.onLeaseExpired(lease)
    }
  }

  /**
   * Periodic sweep for expired leases
   */
  async sweepExpired(): Promise<void> {
    const now = Date.now()
    for (const lease of this.leases.values()) {
      if (lease.status === "ACTIVE" && lease.expiresAt.getTime() <= now) {
        lease.status = "EXPIRED"
        this.events.emit("lease.expired", {
          workerId: lease.workerId,
          environmentId: lease.environmentId,
          leaseId: lease.leaseId,
          data: { expiredAt: lease.expiresAt.toISOString() },
        })

        if (this.onLeaseExpired) {
          try {
            await this.onLeaseExpired(lease)
          } catch (err) {
            console.error(`[LeaseManager] Error executing lease expiration handler:`, err)
          }
        }
      }
    }
  }
}
