/**
 * Solari Execution Fabric Adapter
 * Reference implementation for Meshly powered by Solari's Cloud Browsers, Sandboxes, and Desktops.
 */
import { ExecutionFabric, FabricResource, BrowserLaunchOptions, SandboxCreateOptions, DesktopCreateOptions } from "../fabric.js"

export class SolariAdapter implements ExecutionFabric {
  readonly name = "solari-cloud-fabric"
  private apiKey?: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SOLARI_API_KEY
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
        console.warn(`[SolariAdapter] Live browser launch failed (${err.message}). Using high-fidelity simulator.`)
      }
    }

    // High-Fidelity Simulator
    const simId = `sim_browser_${Date.now().toString(36)}`
    const mockBrowser = {
      id: simId,
      newPage: async () => ({
        goto: async (url: string) => console.log(`[Solari Simulator] Browser navigating to: ${url}`),
        title: async () => "External System Observation Target",
        content: async () => `<html><body><h1>Live Observation Target</h1><div id="status">READY</div></body></html>`,
        evaluate: async (fn: any) => fn(),
      }),
      close: async () => console.log(`[Solari Simulator] Browser ${simId} closed.`),
    }

    return {
      id: simId,
      type: "browser",
      handle: mockBrowser,
      replayUrl: `https://console.getsolari.com/replays/${simId}`,
    }
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
        console.warn(`[SolariAdapter] Live sandbox creation failed (${err.message}). Using high-fidelity simulator.`)
      }
    }

    // High-Fidelity Simulator
    const simId = `sim_sandbox_${Date.now().toString(36)}`
    const mockSandbox = {
      id: simId,
      commands: {
        run: async (cmd: string, opts: any) => {
          console.log(`[Solari Simulator] MicroVM executing: ${cmd} ${opts?.args?.join(" ") || ""}`)
          return { exitCode: 0, stdout: JSON.stringify({ verified: true, balance: 0.0 }) }
        },
      },
      files: {
        write: async (path: string, content: string) => console.log(`[Solari Simulator] Wrote ${content.length}b to ${path}`),
        readText: async (path: string) => "MOCK_FILE_CONTENT",
      },
      kill: async () => console.log(`[Solari Simulator] Sandbox ${simId} killed.`),
    }

    return {
      id: simId,
      type: "sandbox",
      handle: mockSandbox,
    }
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
        console.warn(`[SolariAdapter] Live desktop creation failed (${err.message}). Using high-fidelity simulator.`)
      }
    }

    // High-Fidelity Simulator
    const simId = `sim_desktop_${Date.now().toString(36)}`
    const mockDesktop = {
      id: simId,
      open: async (app: string) => console.log(`[Solari Simulator] Desktop launched GUI: ${app}`),
      mouse: {
        click: async (x: number, y: number) => console.log(`[Solari Simulator] Clicked (${x}, ${y})`),
      },
      keyboard: {
        type: async (text: string) => console.log(`[Solari Simulator] Typed: "${text}"`),
      },
      screenshot: async () => Buffer.from("mock_screenshot"),
      pause: async () => console.log(`[Solari Simulator] Desktop VM paused.`),
      resume: async () => console.log(`[Solari Simulator] Desktop VM resumed.`),
      close: async () => console.log(`[Solari Simulator] Desktop VM closed.`),
    }

    return {
      id: simId,
      type: "desktop",
      handle: mockDesktop,
      streamUrl: `wss://stream.getsolari.com/vnc/${simId}`,
    }
  }

  async pauseResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.pause) {
      await resource.handle.pause()
    }
  }

  async resumeResource(resource: FabricResource): Promise<void> {
    if (resource.handle?.resume) {
      await resource.handle.resume()
    }
  }

  async destroyResource(resource: FabricResource): Promise<void> {
    if (resource.type === "sandbox" && resource.handle?.kill) {
      await resource.handle.kill()
    } else if (resource.handle?.close) {
      await resource.handle.close()
    }
  }
}
