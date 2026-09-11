/**
 * @meshly/solari — live Solari execution fabric.
 *
 * Honest adapter: if a key is present, failures surface as Solari errors.
 * Simulator fallback is opt-in, never silent.
 */
import {
  ExecutionFabric,
  FabricResource,
  BrowserLaunchOptions,
  SandboxCreateOptions,
  DesktopCreateOptions,
  SimulatorExecutionFabric,
} from "@meshly/core"

export interface SolariFabricConfig {
  apiKey?: string
  baseUrl?: string
  fallbackToSimulator?: boolean
  defaultTimeoutMs?: number
}

export class SolariFabricError extends Error {
  readonly code?: string
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, opts: { code?: string; status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(message)
    this.name = "SolariFabricError"
    this.code = opts.code
    this.status = opts.status
    this.retryable = opts.retryable ?? false
    if (opts.cause) (this as Error & { cause?: unknown }).cause = opts.cause
  }
}

export class SolariExecutionFabric implements ExecutionFabric {
  readonly name = "solari-cloud-fabric"
  private apiKey?: string
  private baseUrl: string
  private fallbackToSimulator: boolean
  private simulator: SimulatorExecutionFabric
  private browserClient: any
  private vmClient: any

  constructor(config: SolariFabricConfig = {}) {
    this.apiKey = config.apiKey || process.env.SOLARI_API_KEY
    this.baseUrl = config.baseUrl || process.env.SOLARI_BASE_URL || "https://api.getsolari.com"
    this.fallbackToSimulator = config.fallbackToSimulator ?? false
    this.simulator = new SimulatorExecutionFabric()
  }

  get isLive(): boolean {
    return Boolean(this.apiKey) && !this.fallbackToSimulator
  }

  async launchBrowser(options: BrowserLaunchOptions = {}): Promise<FabricResource> {
    if (!this.apiKey) return this.missingKey("browser", () => this.simulator.launchBrowser(options))

    try {
      const client = await this.browser()
      const browser = await client.launch({
        stealth: options.stealth ?? false,
        profileId: options.profileId,
        recording: options.recording ?? true,
      })
      const id = browser.id
      return {
        id,
        type: "browser",
        handle: browser,
        replayUrl: `https://console.getsolari.com/sessions/${id}`,
      }
    } catch (err) {
      return this.failed("browser", err, () => this.simulator.launchBrowser(options))
    }
  }

  async createSandbox(options: SandboxCreateOptions = {}): Promise<FabricResource> {
    if (!this.apiKey) return this.missingKey("sandbox", () => this.simulator.createSandbox(options))

    try {
      const client = await this.vm()
      const sandbox = await client.sandboxes.create({
        template: options.template ?? "base",
        timeoutMs: options.timeoutMs ?? 5 * 60_000,
      })
      await sandbox.connect()
      const id = sandbox.sandboxId || sandbox.id
      return {
        id,
        type: "sandbox",
        handle: sandbox,
      }
    } catch (err) {
      return this.failed("sandbox", err, () => this.simulator.createSandbox(options))
    }
  }

  async createDesktop(options: DesktopCreateOptions = {}): Promise<FabricResource> {
    if (!this.apiKey) return this.missingKey("desktop", () => this.simulator.createDesktop(options))

    try {
      const client = await this.vm()
      const desktop = await client.desktops.create({
        template: "default",
        resolution: options.resolution ?? "1280x720",
        timeoutMs: options.timeoutMs ?? 10 * 60_000,
        lifecycle: { onTimeout: "pause" },
      })
      await desktop.connect()
      const id = desktop.sessionId || desktop.id
      return {
        id,
        type: "desktop",
        handle: desktop,
        streamUrl: desktop.streamUrl,
        recordingUrl: desktop.recordingUrl,
      }
    } catch (err) {
      return this.failed("desktop", err, () => this.simulator.createDesktop(options))
    }
  }

  async pauseResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.pause) {
      await resource.handle.pause()
      return
    }
    await this.simulator.pauseResource(resource)
  }

  async resumeResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.resume) {
      await resource.handle.resume()
      return
    }
    await this.simulator.resumeResource(resource)
  }

  async destroyResource(resource: FabricResource): Promise<void> {
    const handle = resource.handle
    try {
      if (resource.type === "browser") {
        if (handle?.close) await handle.close()
        return
      }
      if (handle?.kill) {
        await handle.kill()
        return
      }
      if (resource.type === "desktop" && this.vmClient?.desktops?.destroy) {
        await this.vmClient.desktops.destroy(resource.id)
        return
      }
      if (handle?.close) await handle.close()
    } catch (err) {
      throw wrapSolariError(err, `Failed to destroy ${resource.type} ${resource.id}`)
    }
  }

  async reconnect(id: string, type: "browser" | "sandbox" | "desktop"): Promise<FabricResource> {
    if (!this.apiKey) {
      if (this.fallbackToSimulator) return this.simulator.reconnect!(id, type)
      throw new SolariFabricError(`Cannot reconnect ${type} ${id} without SOLARI_API_KEY`, { code: "MissingApiKey" })
    }
    try {
      if (type === "sandbox") {
        const client = await this.vm()
        const sandbox = await client.sandboxes.connect(id)
        await sandbox.connect?.()
        return { id: sandbox.sandboxId || sandbox.id || id, type: "sandbox", handle: sandbox }
      }
      if (type === "desktop") {
        const client = await this.vm()
        const desktop = await client.desktops.connect(id)
        return {
          id: desktop.sessionId || desktop.id || id,
          type: "desktop",
          handle: desktop,
          streamUrl: desktop.streamUrl,
          recordingUrl: desktop.recordingUrl,
        }
      }
      throw new SolariFabricError(`Browser sessions cannot be reconnected after close (${id})`, { code: "BrowserGone" })
    } catch (err) {
      if (this.fallbackToSimulator) return this.simulator.reconnect!(id, type)
      throw wrapSolariError(err, `Failed to reconnect ${type} ${id}`)
    }
  }

  /**
   * Replay URLs are issued after the browser session is released.
   */
  async getBrowserReplayUrl(sessionId: string): Promise<string | undefined> {
    if (!this.browserClient?.sessions?.getReplayUrl) return undefined
    try {
      const replay = await this.browserClient.sessions.getReplayUrl(sessionId)
      return replay?.url
    } catch {
      return undefined
    }
  }

  async close(): Promise<void> {
    if (this.browserClient?.close) await this.browserClient.close()
  }

  private async browser(): Promise<any> {
    if (this.browserClient) return this.browserClient
    const { Solari } = await import("@solarisdk/browser")
    this.browserClient = new Solari({ apiKey: this.apiKey!, baseUrl: this.baseUrl })
    return this.browserClient
  }

  private async vm(): Promise<any> {
    if (this.vmClient) return this.vmClient
    const { SolariClient } = await import("@solarisdk/sdk")
    this.vmClient = new SolariClient({ apiKey: this.apiKey!, baseUrl: this.baseUrl })
    return this.vmClient
  }

  private async missingKey<T>(kind: string, fallback: () => Promise<T>): Promise<T> {
    if (this.fallbackToSimulator) {
      console.warn(`[SolariExecutionFabric] No SOLARI_API_KEY. Simulating ${kind}.`)
      return fallback()
    }
    throw new SolariFabricError(
      `No SOLARI_API_KEY. Meshly will not pretend a live ${kind} ran. Set the key or pass fallbackToSimulator: true.`,
      { code: "MissingApiKey" },
    )
  }

  private async failed<T>(kind: string, err: unknown, fallback: () => Promise<T>): Promise<T> {
    const wrapped = wrapSolariError(err, `Live Solari ${kind} failed`)
    if (this.fallbackToSimulator) {
      console.warn(`[SolariExecutionFabric] ${wrapped.message}. Falling back to simulator.`)
      return fallback()
    }
    throw wrapped
  }
}

export const SolariAdapter = SolariExecutionFabric
/** Pitch alias: `new Meshly({ execution: new Solari({ apiKey }) })` */
export const Solari = SolariExecutionFabric

function wrapSolariError(err: unknown, prefix: string): SolariFabricError {
  const anyErr = err as { message?: string; code?: string; status?: number; name?: string }
  const code = anyErr?.code || anyErr?.name
  const retryable = code === "ConcurrencyCheckUnavailable" || anyErr?.status === 502 || anyErr?.status === 503
  const message = anyErr?.message || String(err)
  if (code === "ConcurrencyLimitExceeded") {
    return new SolariFabricError(
      `${prefix}: concurrent session cap reached. Do not retry until a session is released.`,
      { code, status: anyErr.status ?? 429, retryable: false, cause: err },
    )
  }
  if (/No stealth pool available|kind":"stealth"/i.test(message)) {
    return new SolariFabricError(
      `${prefix}: stealth browser pool is empty. Meshly will use the standard browser pool unless you request stealth.`,
      { code: "StealthPoolEmpty", status: 503, retryable: false, cause: err },
    )
  }
  if (code === "InsufficientCredit" || anyErr?.status === 402) {
    return new SolariFabricError(`${prefix}: insufficient Solari credit.`, {
      code: code || "InsufficientCredit",
      status: 402,
      retryable: false,
      cause: err,
    })
  }
  return new SolariFabricError(`${prefix}: ${message}`, {
    code,
    status: anyErr?.status,
    retryable,
    cause: err,
  })
}
