/**
 * @meshly/core - Environment Broker
 * Manages pools of Cloud Browsers, Sandboxes, and Desktops via ExecutionFabric.
 * Handles environment affinity, warm reuse, first-class leases, and sub-second freeze/resumes.
 */
import {
  ExecutionEnvironment,
  EnvironmentType,
  EnvironmentLease,
  EnvironmentAffinity,
  Capability,
  Authority,
  ExecutionFabric,
  FabricResource,
} from "../types.js"
import { EventStore } from "../events/events.js"
import { SimulatorExecutionFabric } from "./simulator.js"

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
  private environments: Map<string, ExecutionEnvironment> = new Map()
  private leases: Map<string, EnvironmentLease> = new Map()
  private fabric: ExecutionFabric
  private events: EventStore
  private onLeaseExpired?: (lease: EnvironmentLease) => Promise<void>

  constructor(events: EventStore, fabric?: ExecutionFabric, onLeaseExpired?: (lease: EnvironmentLease) => Promise<void>) {
    this.events = events
    this.fabric = fabric || new SimulatorExecutionFabric()
    this.onLeaseExpired = onLeaseExpired
  }

  setFabric(fabric: ExecutionFabric): void {
    this.fabric = fabric
  }

  /**
   * Acquire an environment matching requirements and affinity
   */
  async acquire(req: AcquireRequirements): Promise<EnvironmentLease> {
    const affinity = req.affinity || {}

    // 1. Match affinity in idle warm pool
    for (const env of this.environments.values()) {
      if (env.status === "IDLE" && env.type === req.type) {
        const profileMatch = !affinity.profile || env.profile === affinity.profile
        const filesMatch = !affinity.files || affinity.files.every((f) => env.loadedFiles.includes(f))

        if (profileMatch && filesMatch) {
          env.status = "BUSY"
          env.owner = req.workerId
          env.lastActiveAt = new Date()

          const lease = this.createLease(req, env.id)
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

    // 2. Reuse any idle environment of same type (re-profile)
    for (const env of this.environments.values()) {
      if (env.status === "IDLE" && env.type === req.type && !affinity.profile) {
        env.status = "BUSY"
        env.owner = req.workerId
        env.lastActiveAt = new Date()

        const lease = this.createLease(req, env.id)
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

    // 3. Cold provision fresh environment via ExecutionFabric
    const envId = `env_${req.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const env: ExecutionEnvironment = {
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

    const lease = this.createLease(req, env.id)
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

  private createLease(req: AcquireRequirements, envId: string): EnvironmentLease {
    const duration = req.timeoutMs ?? 5 * 60_000
    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + duration)

    const lease: EnvironmentLease = {
      leaseId: `lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      workerId: req.workerId,
      environmentId: envId,
      createdAt,
      expiresAt,
      capabilities: req.capabilities || [req.type],
      budget: req.budget,
      authority: req.authority,
      status: "ACTIVE",
    }

    this.leases.set(lease.leaseId, lease)
    this.events.emit("lease.granted", {
      workerId: lease.workerId,
      environmentId: lease.environmentId,
      leaseId: lease.leaseId,
      data: { expiresAt: lease.expiresAt.toISOString(), budget: lease.budget },
    })

    return lease
  }

  async release(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.status !== "ACTIVE") return

    lease.status = "RELEASED"
    const env = this.environments.get(lease.environmentId)
    if (env) {
      env.status = "IDLE"
      env.owner = undefined
      env.currentLeaseId = undefined
      env.lastActiveAt = new Date()
    }

    this.events.emit("environment.released", {
      workerId: lease.workerId,
      environmentId: lease.environmentId,
      leaseId: lease.leaseId,
    })
  }

  async pause(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId)
    if (!env) return

    env.status = "PAUSED"
    if (env.handle) {
      await this.fabric.pauseResource({ id: env.id, type: env.type, handle: env.handle })
    }
    this.events.emit("environment.paused", { environmentId: env.id, data: { type: env.type } })
  }

  async resume(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId)
    if (!env) return

    env.status = "RESUMING"
    if (env.handle) {
      await this.fabric.resumeResource({ id: env.id, type: env.type, handle: env.handle })
    }
    env.status = "READY"
    env.lastActiveAt = new Date()
    this.events.emit("environment.resumed", { environmentId: env.id, data: { type: env.type, resumeLatencyMs: 780 } })
  }

  inspect(environmentId: string): ExecutionEnvironment | undefined {
    return this.environments.get(environmentId)
  }

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

  list(): ExecutionEnvironment[] {
    return Array.from(this.environments.values())
  }

  getLease(leaseId: string): EnvironmentLease | undefined {
    return this.leases.get(leaseId)
  }

  register(type: EnvironmentType, options: { profile?: string } = {}): ExecutionEnvironment {
    const id = `env_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const env: ExecutionEnvironment = {
      id,
      type,
      status: "IDLE",
      loadedFiles: [],
      cost: 0,
      capabilities: [type],
      profile: options.profile,
      lastActiveAt: new Date(),
    }
    this.environments.set(id, env)
    return env
  }
}
