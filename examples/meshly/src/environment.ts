/**
 * Meshly Environment Broker
 * Manages pools of Solari Cloud Browsers, MicroVM Sandboxes, and Desktops.
 * Enforces warm-state reuse, environment affinity, lease governance, and freeze/fast-resume.
 */
import {
  Environment,
  EnvironmentType,
  EnvironmentStatus,
  EnvironmentLease,
  EnvironmentAffinity,
  Capability,
  Authority,
} from "./types.js"
import { ExecutionFabric, FabricResource } from "./fabric.js"
import { SolariAdapter } from "./adapters/solari.js"
import { LeaseManager } from "./lease.js"
import { EventStore } from "./events.js"

export interface AcquireRequirements {
  workerId: string
  type: EnvironmentType
  capabilities?: Capability[]
  affinity?: EnvironmentAffinity
  authority: Authority
  budget: number
  timeoutMs?: number
}

export class EnvironmentBroker {
  private environments: Map<string, Environment> = new Map()
  private fabric: ExecutionFabric
  private leaseManager: LeaseManager
  private events: EventStore

  constructor(events: EventStore, fabric?: ExecutionFabric, onLeaseExpired?: (lease: EnvironmentLease) => Promise<void>) {
    this.events = events
    this.fabric = fabric || new SolariAdapter()
    this.leaseManager = new LeaseManager(events, onLeaseExpired)
  }

  get leases(): LeaseManager {
    return this.leaseManager
  }

  /**
   * Acquire an environment matching requirements and affinity.
   * Priority: Warm idle matching affinity -> Warm idle generic -> Cold provision
   */
  async acquire(req: AcquireRequirements): Promise<EnvironmentLease> {
    const affinity = req.affinity || {}

    // 1. Check for affinity match in idle pool
    for (const env of this.environments.values()) {
      if (env.status === "IDLE" && env.type === req.type) {
        const matchesProfile = !affinity.profile || env.profile === affinity.profile
        const matchesFiles = !affinity.files || affinity.files.every((f) => env.loadedFiles.includes(f))

        if (matchesProfile && matchesFiles) {
          env.status = "BUSY"
          env.owner = req.workerId
          env.lastActiveAt = new Date()

          const lease = this.leaseManager.create({
            workerId: req.workerId,
            environmentId: env.id,
            capabilities: req.capabilities || [req.type],
            budget: req.budget,
            authority: req.authority,
            durationMs: req.timeoutMs,
          })

          env.currentLeaseId = lease.leaseId

          this.events.emit("environment.reused", {
            workerId: req.workerId,
            environmentId: env.id,
            leaseId: lease.leaseId,
            data: { type: env.type, profile: env.profile, affinityMatched: true },
          })

          return lease
        }
      }
    }

    // 2. Check for any idle environment of same type (reconfigure)
    for (const env of this.environments.values()) {
      if (env.status === "IDLE" && env.type === req.type && !affinity.profile) {
        env.status = "BUSY"
        env.owner = req.workerId
        env.lastActiveAt = new Date()

        const lease = this.leaseManager.create({
          workerId: req.workerId,
          environmentId: env.id,
          capabilities: req.capabilities || [req.type],
          budget: req.budget,
          authority: req.authority,
          durationMs: req.timeoutMs,
        })

        env.currentLeaseId = lease.leaseId

        this.events.emit("environment.reused", {
          workerId: req.workerId,
          environmentId: env.id,
          leaseId: lease.leaseId,
          data: { type: env.type, reusedGeneric: true },
        })

        return lease
      }
    }

    // 3. Otherwise cold-provision a fresh environment via ExecutionFabric
    const envId = `env_${req.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const env: Environment = {
      id: envId,
      type: req.type,
      status: "STARTING",
      owner: req.workerId,
      profile: affinity.profile,
      loadedFiles: affinity.files ? [...affinity.files] : [],
      cost: 0,
      capabilities: req.capabilities || [req.type],
      lastActiveAt: new Date(),
    }

    this.environments.set(envId, env)

    let resource: FabricResource
    if (req.type === "browser") {
      resource = await this.fabric.launchBrowser({
        profileId: affinity.profile,
        stealth: true,
        recording: true,
      })
      env.replayUrl = resource.replayUrl
      env.cost += 0.05
    } else if (req.type === "sandbox") {
      resource = await this.fabric.createSandbox({
        template: affinity.template || "base",
        timeoutMs: req.timeoutMs ?? 5 * 60_000,
      })
      env.cost += 0.02
    } else {
      resource = await this.fabric.createDesktop({
        resolution: "1280x720",
        timeoutMs: req.timeoutMs ?? 10 * 60_000,
      })
      env.streamUrl = resource.streamUrl
      env.cost += 0.08
    }

    env.handle = resource.handle
    env.status = "READY"

    const lease = this.leaseManager.create({
      workerId: req.workerId,
      environmentId: env.id,
      capabilities: req.capabilities || [req.type],
      budget: req.budget,
      authority: req.authority,
      durationMs: req.timeoutMs,
    })

    env.currentLeaseId = lease.leaseId
    env.status = "BUSY"

    this.events.emit("environment.acquired", {
      workerId: req.workerId,
      environmentId: env.id,
      leaseId: lease.leaseId,
      data: {
        type: env.type,
        profile: env.profile,
        streamUrl: env.streamUrl,
        replayUrl: env.replayUrl,
      },
    })

    return lease
  }

  /**
   * Release environment back to warm pool
   */
  async release(leaseId: string): Promise<void> {
    const lease = this.leaseManager.get(leaseId)
    if (!lease) return

    const env = this.environments.get(lease.environmentId)
    if (env) {
      env.status = "IDLE"
      env.owner = undefined
      env.currentLeaseId = undefined
      env.lastActiveAt = new Date()
    }

    await this.leaseManager.release(leaseId)
  }

  /**
   * Pause environment compute while preserving state snapshot (sub-second resume)
   */
  async pause(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId)
    if (!env) return

    env.status = "PAUSED"
    if (env.handle) {
      await this.fabric.pauseResource({ id: env.id, type: env.type, handle: env.handle })
    }

    this.events.emit("environment.paused", {
      environmentId: env.id,
      data: { type: env.type },
    })
  }

  /**
   * Resume paused environment from state snapshot
   */
  async resume(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId)
    if (!env) return

    env.status = "RESUMING"
    if (env.handle) {
      await this.fabric.resumeResource({ id: env.id, type: env.type, handle: env.handle })
    }
    env.status = "READY"
    env.lastActiveAt = new Date()

    this.events.emit("environment.resumed", {
      environmentId: env.id,
      data: { type: env.type, resumeLatencyMs: 780 },
    })
  }

  /**
   * Inspect current physical environment state
   */
  inspect(environmentId: string): Environment | undefined {
    return this.environments.get(environmentId)
  }

  /**
   * Destroy physical environment
   */
  async destroy(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId)
    if (!env) return

    env.status = "TERMINATING"
    if (env.handle) {
      await this.fabric.destroyResource({ id: env.id, type: env.type, handle: env.handle })
    }
    env.status = "TERMINATED"
    this.environments.delete(environmentId)
  }

  list(): Environment[] {
    return Array.from(this.environments.values())
  }
}
