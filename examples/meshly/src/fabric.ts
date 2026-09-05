/**
 * Meshly Execution Fabric Interface
 * Clean abstraction decoupling Meshly control plane from underlying execution substrates.
 */

export interface BrowserLaunchOptions {
  profileId?: string
  stealth?: boolean
  recording?: boolean
}

export interface SandboxCreateOptions {
  template?: string
  timeoutMs?: number
}

export interface DesktopCreateOptions {
  resolution?: string
  timeoutMs?: number
}

export interface FabricResource<T = any> {
  id: string
  type: "browser" | "sandbox" | "desktop"
  handle: T
  streamUrl?: string
  replayUrl?: string
}

export interface ExecutionFabric {
  readonly name: string

  launchBrowser(options?: BrowserLaunchOptions): Promise<FabricResource>
  createSandbox(options?: SandboxCreateOptions): Promise<FabricResource>
  createDesktop(options?: DesktopCreateOptions): Promise<FabricResource>

  pauseResource(resource: FabricResource): Promise<void>
  resumeResource(resource: FabricResource): Promise<void>
  destroyResource(resource: FabricResource): Promise<void>
}
