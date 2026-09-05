/**
 * @meshly/solari - Solari Execution Fabric Adapter
 * Connects Meshly runtime to Solari's Cloud Browsers, Sandboxes, and Desktops.
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
  fallbackToSimulator?: boolean
  defaultTimeoutMs?: number
}

export class SolariExecutionFabric implements ExecutionFabric {
  readonly name = "solari-cloud-fabric"
  private apiKey?: string
  private fallbackToSimulator: boolean
  private simulator: SimulatorExecutionFabric

  constructor(config: SolariFabricConfig = {}) {
    this.apiKey = config.apiKey || process.env.SOLARI_API_KEY
    this.fallbackToSimulator = config.fallbackToSimulator ?? true
    this.simulator = new SimulatorExecutionFabric()
  }

  get isLive(): boolean {
    return Boolean(this.apiKey)
  }

  async launchBrowser(options: BrowserLaunchOptions = {}): Promise<FabricResource> {
    if (this.apiKey) {
      try {
        const { Solari } = await import("@solarisdk/browser")
        const client = new Solari({ apiKey: this.apiKey })
        const browser = await client.launch({
          stealth: options.stealth ?? true,
          profileId: options.profileId,
          recording: options.recording ?? true,
        })

        return {
          id: browser.id || `solari_browser_${Date.now().toString(36)}`,
          type: "browser",
          handle: browser,
          replayUrl: `https://console.getsolari.com/replays/${browser.id}`,
        }
      } catch (err: any) {
        if (!this.fallbackToSimulator) throw err
        console.warn(`[SolariExecutionFabric] Live browser launch failed (${err.message}). Falling back to simulator.`)
      }
    }

    return this.simulator.launchBrowser(options)
  }

  async createSandbox(options: SandboxCreateOptions = {}): Promise<FabricResource> {
    if (this.apiKey) {
      try {
        const { SolariClient } = await import("@solarisdk/sdk")
        const client = new SolariClient({ apiKey: this.apiKey })
        const sandbox = await client.sandboxes.create({
          template: options.template ?? "base",
          timeoutMs: options.timeoutMs ?? 5 * 60_000,
        })
        await sandbox.connect()

        return {
          id: sandbox.id || `solari_sandbox_${Date.now().toString(36)}`,
          type: "sandbox",
          handle: sandbox,
        }
      } catch (err: any) {
        if (!this.fallbackToSimulator) throw err
        console.warn(`[SolariExecutionFabric] Live sandbox creation failed (${err.message}). Falling back to simulator.`)
      }
    }

    return this.simulator.createSandbox(options)
  }

  async createDesktop(options: DesktopCreateOptions = {}): Promise<FabricResource> {
    if (this.apiKey) {
      try {
        const { SolariClient } = await import("@solarisdk/sdk")
        const client = new SolariClient({ apiKey: this.apiKey })
        const desktop = await client.desktops.create({
          template: "default",
          resolution: options.resolution ?? "1280x720",
          timeoutMs: options.timeoutMs ?? 10 * 60_000,
        })
        await desktop.connect()

        return {
          id: desktop.id || `solari_desktop_${Date.now().toString(36)}`,
          type: "desktop",
          handle: desktop,
          streamUrl: desktop.streamUrl,
        }
      } catch (err: any) {
        if (!this.fallbackToSimulator) throw err
        console.warn(`[SolariExecutionFabric] Live desktop creation failed (${err.message}). Falling back to simulator.`)
      }
    }

    return this.simulator.createDesktop(options)
  }

  async pauseResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.pause) {
      await resource.handle.pause()
    } else {
      await this.simulator.pauseResource(resource)
    }
  }

  async resumeResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.resume) {
      await resource.handle.resume()
    } else {
      await this.simulator.resumeResource(resource)
    }
  }

  async destroyResource(resource: FabricResource): Promise<void> {
    if (resource.type === "sandbox" && resource.handle?.kill) {
      await resource.handle.kill()
    } else if (resource.handle?.close) {
      await resource.handle.close()
    } else {
      await this.simulator.destroyResource(resource)
    }
  }
}

// Export alias SolariAdapter for backward compatibility
export const SolariAdapter = SolariExecutionFabric
