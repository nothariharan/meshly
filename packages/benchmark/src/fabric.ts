/**
 * Benchmark execution fabric.
 *
 * Wraps the shipped SimulatorExecutionFabric so both arms of the experiment
 * run against byte-for-byte the same world semantics. Adds, on top:
 *
 *  - a write journal (objective ground truth, independent of either model)
 *  - deterministic fault injection (environment loss, pool capacity)
 *  - environment accounting (created / destroyed / peak / orphans / failed)
 *
 * This fabric is never used by the product runtime. It exists so the
 * comparison can be controlled and repeated.
 */
import {
  SimulatorExecutionFabric,
  type BrowserLaunchOptions,
  type DesktopCreateOptions,
  type EnvironmentType,
  type ExecutionEnvironment,
  type ExecutionFabric,
  type FabricResource,
  type SandboxCreateOptions,
} from "@meshly/core"

export interface WriteRecord {
  seq: number
  type: EnvironmentType
  resourceId: string
  path: string
  value: string
}

export interface FabricFault {
  /** The first environment of this type created in a trial is dead on arrival. */
  killFirst?: EnvironmentType
  /** Per-type ceiling on concurrently live benchmark environments. */
  capacity?: Partial<Record<EnvironmentType, number>>
}

export interface FabricStats {
  created: number
  destroyed: number
  active: number
  peak: number
  reuses: number
  failedAllocations: number
  byType: Record<EnvironmentType, { created: number; peak: number; active: number }>
}

const KILLED_MESSAGE = "environment lost: benchmark injected kill before dispatch"

export class BenchmarkFabric implements ExecutionFabric {
  readonly name = "benchmark-fabric"
  readonly source: "simulator" | "solari"

  private inner: ExecutionFabric
  private writes: WriteRecord[] = []
  private live = new Map<string, FabricResource>()
  private killed = new Set<string>()
  private fault: FabricFault = {}
  private killedTypes = new Set<EnvironmentType>()
  private seq = 0
  private created = 0
  private destroyed = 0
  private peak = 0
  private reuses = 0
  private failedAllocations = 0
  private byType: Record<EnvironmentType, { created: number; peak: number; active: number }> = {
    browser: { created: 0, peak: 0, active: 0 },
    sandbox: { created: 0, peak: 0, active: 0 },
    desktop: { created: 0, peak: 0, active: 0 },
  }
  private inflight: Record<EnvironmentType, number> = { browser: 0, sandbox: 0, desktop: 0 }

  constructor(inner?: ExecutionFabric, source: "simulator" | "solari" = "simulator") {
    this.inner = inner ?? new SimulatorExecutionFabric()
    this.source = source
  }

  /** Start a fresh trial: clear the journal and faults, keep nothing behind. */
  beginTrial(fault: FabricFault = {}): void {
    this.writes = []
    this.fault = fault
    this.killedTypes.clear()
    this.killed.clear()
    this.seq = 0
  }

  journal(): WriteRecord[] {
    return [...this.writes]
  }

  stats(): FabricStats {
    return {
      created: this.created,
      destroyed: this.destroyed,
      active: this.live.size,
      peak: this.peak,
      reuses: this.reuses,
      failedAllocations: this.failedAllocations,
      byType: JSON.parse(JSON.stringify(this.byType)),
    }
  }

  /** A fabric-created execution environment for the direct executor. */
  static asEnvironment(resource: FabricResource, type: EnvironmentType): ExecutionEnvironment {
    return {
      id: `env_${type}_direct_${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: "BUSY",
      fabricId: resource.id,
      loadedFiles: [],
      cost: 0,
      capabilities: [type],
      handle: resource.handle,
      streamUrl: resource.streamUrl,
      replayUrl: resource.replayUrl,
      lastActiveAt: new Date(),
    }
  }

  async launchBrowser(options: BrowserLaunchOptions = {}): Promise<FabricResource> {
    return this.provision("browser", () => this.inner.launchBrowser(options))
  }

  async createSandbox(options: SandboxCreateOptions = {}): Promise<FabricResource> {
    return this.provision("sandbox", () => this.inner.createSandbox(options))
  }

  async createDesktop(options: DesktopCreateOptions = {}): Promise<FabricResource> {
    return this.provision("desktop", () => this.inner.createDesktop(options))
  }

  async pauseResource(resource: FabricResource): Promise<void> {
    return this.inner.pauseResource(resource)
  }

  async resumeResource(resource: FabricResource): Promise<void> {
    return this.inner.resumeResource(resource)
  }

  async destroyResource(resource: FabricResource): Promise<void> {
    // The runtime's broker destroys by its own environment id, not the fabric
    // resource id, so match on handle identity as well or live/peak accounting
    // never releases.
    for (const [id, tracked] of this.live) {
      if (id === resource.id || tracked.handle === resource.handle) {
        this.live.delete(id)
        this.byType[tracked.type].active = Math.max(0, this.byType[tracked.type].active - 1)
        break
      }
    }
    this.destroyed += 1
    return this.inner.destroyResource(resource)
  }

  /** Release any SDK clients the inner fabric is holding. */
  async dispose(): Promise<void> {
    const closeable = this.inner as ExecutionFabric & { close?: () => Promise<void> }
    if (typeof closeable.close === "function") {
      try {
        await closeable.close()
      } catch {
        /* best effort */
      }
    }
  }

  async reconnect(id: string, type: EnvironmentType): Promise<FabricResource> {
    if (this.killed.has(id)) throw new Error(KILLED_MESSAGE)
    if (!this.inner.reconnect) throw new Error(`Fabric '${this.inner.name}' cannot reconnect ${type} ${id}`)
    return this.inner.reconnect(id, type)
  }

  private async provision(type: EnvironmentType, make: () => Promise<FabricResource>): Promise<FabricResource> {
    const ceiling = this.fault.capacity?.[type]
    // Reserve synchronously: concurrent callers must contend for the ceiling,
    // not race past it while earlier allocations are still in flight.
    if (ceiling !== undefined && this.byType[type].active + this.inflight[type] >= ceiling) {
      this.failedAllocations += 1
      throw new Error(capacityMessage(type))
    }
    this.inflight[type] += 1

    try {
      const resource = await make()
      const instrumented = this.instrument(resource)
      this.live.set(resource.id, instrumented)
      this.created += 1
      this.byType[type].created += 1
      this.byType[type].active += 1
      if (this.byType[type].active > this.byType[type].peak) this.byType[type].peak = this.byType[type].active
      if (this.live.size > this.peak) this.peak = this.live.size

      if (this.fault.killFirst === type && !this.killedTypes.has(type)) {
        this.killedTypes.add(type)
        this.killed.add(resource.id)
      }

      return instrumented
    } finally {
      this.inflight[type] -= 1
    }
  }

  /**
   * Wrap a resource handle so calls can be faulted and writes can be journaled.
   *
   * A Proxy, not a spread: live SDK handles are class instances, and lifecycle
   * methods (kill / close / pause / resume / destroy) must be invoked with the
   * original `this` or teardown silently fails and sessions leak.
   */
  private instrument(resource: FabricResource): FabricResource {
    const fabric = this
    const handle = resource.handle

    const assertAlive = (): void => {
      if (fabric.killed.has(resource.id)) throw new Error(KILLED_MESSAGE)
    }

    const origin = (_name: string, fn: (...args: any[]) => any) =>
      (...args: any[]) => {
        assertAlive()
        return fn.apply(handle, args)
      }

    const overrides = new Map<string | symbol, any>()

    for (const name of ["connect", "health", "open", "newPage", "screenshot"]) {
      const fn = handle?.[name]
      if (typeof fn === "function") overrides.set(name, origin(name, fn))
    }

    if (handle?.files) {
      const files = handle.files
      overrides.set(
        "files",
        new Proxy(files, {
          get(target, prop) {
            const value = Reflect.get(target, prop, target)
            if (typeof value !== "function") return value
            if (prop === "write") {
              return (filePath: string, content: unknown) => {
                assertAlive()
                fabric.recordWrite(resource.type, resource.id, filePath, content)
                return value.apply(target, [filePath, content])
              }
            }
            return (...args: any[]) => {
              assertAlive()
              return value.apply(target, args)
            }
          },
        }),
      )
    }

    if (handle?.commands) {
      const commands = handle.commands
      overrides.set(
        "commands",
        new Proxy(commands, {
          get(target, prop) {
            const value = Reflect.get(target, prop, target)
            if (typeof value !== "function") return value
            if (prop === "run") {
              return (cmd: string, opts: any) => {
                assertAlive()
                fabric.recordShellWrite(resource.type, resource.id, cmd, opts)
                return value.apply(target, [cmd, opts])
              }
            }
            return (...args: any[]) => {
              assertAlive()
              return value.apply(target, args)
            }
          },
        }),
      )
    }

    const proxy = new Proxy(handle, {
      get(target, prop) {
        if (overrides.has(prop)) return overrides.get(prop)
        // Forward lookups to the real handle so `this` stays correct.
        return Reflect.get(target, prop, target)
      },
    })

    return { ...resource, handle: proxy }
  }

  private recordWrite(type: EnvironmentType, resourceId: string, filePath: string, content: unknown): void {
    this.seq += 1
    this.writes.push({
      seq: this.seq,
      type,
      resourceId,
      path: String(filePath),
      value: String(content ?? ""),
    })
  }

  /**
   * Some SDKs have no `files.write`, so the runtime writes through a base64
   * shell command instead. Journal that too, or live ground truth would be
   * blind to sandbox/desktop writes.
   */
  private recordShellWrite(type: EnvironmentType, resourceId: string, cmd: string, opts: any): void {
    if (cmd !== "bash") return
    const script = ((opts?.args as string[]) || []).join(" ")
    const match = script.match(/echo '([A-Za-z0-9+/=]+)'\s*\|\s*base64 -d\s*>\s*'([^']+)'/)
    if (!match) return
    try {
      const value = Buffer.from(match[1], "base64").toString("utf8")
      this.recordWrite(type, resourceId, match[2], value)
    } catch {
      /* not a journalable write */
    }
  }

  /** Total environments provisioned across the life of this fabric. */
  sessionsCreated(): number {
    return this.created
  }

  /** Count writes to a target that was already written during this trial. */
  static duplicates(writes: WriteRecord[]): number {
    const seen = new Map<string, number>()
    let duplicates = 0
    for (const write of writes) {
      const key = `${write.type}:${write.path}`
      const count = seen.get(key) ?? 0
      if (count > 0) duplicates += 1
      seen.set(key, count + 1)
    }
    return duplicates
  }

  static finalValue(writes: WriteRecord[], type: EnvironmentType, filePath: string): string | undefined {
    let value: string | undefined
    for (const write of writes) {
      if (write.type === type && write.path === filePath) value = write.value
    }
    return value
  }
}

function capacityMessage(type: EnvironmentType): string {
  if (type === "browser") return "no browser capacity in the benchmark pool"
  if (type === "sandbox") return "no sandbox capacity in the benchmark pool"
  return "desktop unavailable in the benchmark pool"
}
