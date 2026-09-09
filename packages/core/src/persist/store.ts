/**
 * On-disk Meshly project state under `.meshly/`.
 * CLI and console share this. It is the source of truth.
 */
import fs from "node:fs"
import path from "node:path"
import type { MeshlyEvent, RunStatus } from "../types.js"
import type { RunInstance } from "../run/run.js"

export interface MeshlyProjectConfig {
  name: string
  createdAt: string
  execution: "solari" | "simulator"
}

export interface StoredAuthority {
  tools: string[]
  capabilities: string[]
  domains?: string[]
  maxSpend?: number
  writeAccess?: string[]
}

export interface StoredMemoryRef {
  key: string
  tier: "hot" | "warm" | "cold"
  value?: unknown
}

export interface StoredWorker {
  id: string
  name: string
  task: string
  capabilities: string[]
  priority: number
  budget: number
  spent?: number
  status?: string
  currentRunId?: string
  authority?: StoredAuthority
  memory?: StoredMemoryRef[]
  createdAt: string
  updatedAt: string
}

export interface StoredEnvironment {
  id: string
  type: string
  provider: "solari" | "simulator"
  status: string
  workerId?: string
  workerName?: string
  runId?: string
  leaseId?: string
  fabricId?: string
  sessionId?: string
  streamUrl?: string
  replayUrl?: string
  createdAt: string
  lastActivityAt: string
}

export interface StoredOperatorAction {
  type: "reverify" | "takeover" | "compensate"
  at: string
  result: string
  detail?: Record<string, unknown>
}

export interface StoredRun {
  runId: string
  workerId: string
  workerName?: string
  objective: string
  status: string
  mode: "live" | "simulator"
  startedAt: number
  completedAt?: number
  environments: StoredEnvironment[]
  steps: any[]
  events: MeshlyEvent[]
  evidence?: any
  error?: string
  sha256Digest?: string
  takeover?: {
    sessionId: string
    startedAt: number
    streamUrl?: string
    active: boolean
  }
  compensated?: boolean
  operatorActions?: StoredOperatorAction[]
}

export class ProjectStore {
  readonly root: string
  readonly dir: string

  constructor(cwd: string = process.cwd()) {
    this.root = cwd
    this.dir = path.join(cwd, ".meshly")
  }

  get configPath(): string {
    return path.join(this.dir, "config.json")
  }

  exists(): boolean {
    return fs.existsSync(this.configPath)
  }

  init(name: string, execution: "solari" | "simulator" = "solari"): MeshlyProjectConfig {
    fs.mkdirSync(path.join(this.dir, "workers"), { recursive: true })
    fs.mkdirSync(path.join(this.dir, "runs"), { recursive: true })
    fs.mkdirSync(path.join(this.dir, "environments"), { recursive: true })
    fs.mkdirSync(path.join(this.dir, "artifacts"), { recursive: true })
    const config: MeshlyProjectConfig = {
      name,
      createdAt: new Date().toISOString(),
      execution,
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
    return config
  }

  ensure(name = path.basename(this.root), execution: "solari" | "simulator" = "simulator"): MeshlyProjectConfig {
    if (this.exists()) return this.loadConfig()
    return this.init(name, execution)
  }

  loadConfig(): MeshlyProjectConfig {
    if (!this.exists()) {
      throw new Error("No Meshly project here. Run `meshly init` first.")
    }
    return JSON.parse(fs.readFileSync(this.configPath, "utf8"))
  }

  saveConfig(config: MeshlyProjectConfig): void {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }

  artifactDir(): string {
    const dir = path.join(this.dir, "artifacts")
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  saveWorker(worker: StoredWorker): void {
    fs.mkdirSync(path.join(this.dir, "workers"), { recursive: true })
    fs.writeFileSync(this.workerPath(worker.id), JSON.stringify(worker, null, 2))
    if (worker.name && worker.name !== worker.id) {
      fs.writeFileSync(this.workerPath(worker.name), JSON.stringify(worker, null, 2))
    }
  }

  listWorkers(): StoredWorker[] {
    const dir = path.join(this.dir, "workers")
    if (!fs.existsSync(dir)) return []
    const seen = new Set<string>()
    const workers: StoredWorker[] = []
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const worker = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as StoredWorker
      if (seen.has(worker.id)) continue
      seen.add(worker.id)
      workers.push(worker)
    }
    return workers.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getWorker(nameOrId: string): StoredWorker | undefined {
    const direct = path.join(this.dir, "workers", `${safeName(nameOrId)}.json`)
    if (fs.existsSync(direct)) {
      return JSON.parse(fs.readFileSync(direct, "utf8"))
    }
    return this.listWorkers().find((w) => w.id === nameOrId || w.name === nameOrId)
  }

  saveRun(run: StoredRun): void {
    fs.mkdirSync(path.join(this.dir, "runs"), { recursive: true })
    const normalized = normalizeRun(run)
    fs.writeFileSync(path.join(this.dir, "runs", `${run.runId}.json`), JSON.stringify(normalized, null, 2))
    for (const env of normalized.environments) {
      this.saveEnvironment(env)
    }
  }

  listRuns(): StoredRun[] {
    const dir = path.join(this.dir, "runs")
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => normalizeRun(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))))
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  getRun(runId: string): StoredRun | undefined {
    const file = path.join(this.dir, "runs", `${runId}.json`)
    if (fs.existsSync(file)) return normalizeRun(JSON.parse(fs.readFileSync(file, "utf8")))
    return this.listRuns().find((r) => r.runId === runId || r.runId.startsWith(runId))
  }

  saveEnvironment(env: StoredEnvironment): void {
    fs.mkdirSync(path.join(this.dir, "environments"), { recursive: true })
    fs.writeFileSync(path.join(this.dir, "environments", `${safeName(env.id)}.json`), JSON.stringify(env, null, 2))
  }

  listEnvironments(): StoredEnvironment[] {
    const dir = path.join(this.dir, "environments")
    const fromFiles: StoredEnvironment[] = []
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        fromFiles.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")))
      }
    }
    const seen = new Set(fromFiles.map((e) => e.id))
    for (const run of this.listRuns()) {
      for (const env of run.environments || []) {
        if (!env?.id && !(env as any).environmentId) continue
        const id = env.id || (env as any).environmentId
        if (seen.has(id)) continue
        seen.add(id)
        fromFiles.push(env.id ? env : hydrateLegacyEnv(env as any, run))
      }
    }
    return fromFiles.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  }

  snapshotRun(params: {
    run: RunInstance
    worker: { id: string; name?: string; task: string }
    mode: "live" | "simulator"
    events?: MeshlyEvent[]
    destroyAfter?: boolean
  }): StoredRun {
    const bundle = params.run.exportBundle()
    const events = params.events || bundle.events || []
    const environments = environmentsFromRun(params.run, params.worker, params.mode, params.destroyAfter !== false)
    const stored: StoredRun = {
      runId: params.run.runId,
      workerId: params.worker.id,
      workerName: params.worker.name,
      objective: params.worker.task,
      status: params.run.status,
      mode: params.mode,
      startedAt: params.run.startedAt,
      completedAt: params.run.completedAt,
      environments,
      steps: params.run.steps,
      events,
      evidence: params.run.evidence || bundle.evidence,
      error: params.run.error,
      sha256Digest: bundle.sha256Digest,
    }
    const existing = this.getRun(params.run.runId)
    if (existing?.takeover) stored.takeover = existing.takeover
    if (existing?.compensated) stored.compensated = existing.compensated
    if (existing?.operatorActions) stored.operatorActions = existing.operatorActions
    this.saveRun(stored)
    return stored
  }

  private workerPath(idOrName: string): string {
    return path.join(this.dir, "workers", `${safeName(idOrName)}.json`)
  }
}

export function environmentsFromRun(
  run: RunInstance,
  worker: { id: string; name?: string },
  mode: "live" | "simulator",
  destroyed: boolean,
): StoredEnvironment[] {
  const byId = new Map<string, StoredEnvironment>()
  const started = new Date(run.startedAt).toISOString()
  const activity = new Date(run.completedAt || Date.now()).toISOString()

  for (const step of run.steps) {
    const obs = step.observation || {}
    const id = String(obs.environmentId || "")
    if (!id) continue
    byId.set(id, {
      id,
      type: String(obs.type || "browser"),
      provider: mode === "live" ? "solari" : "simulator",
      status: destroyed ? "TERMINATED" : envStatusForRun(run.status),
      workerId: worker.id,
      workerName: worker.name,
      runId: run.runId,
      leaseId: obs.leaseId,
      fabricId: obs.fabricId,
      sessionId: obs.sessionId || obs.sandboxId || obs.fabricId,
      streamUrl: obs.streamUrl || obs.desktop_stream_url,
      replayUrl: obs.replayUrl || obs.browser_replay_url,
      createdAt: started,
      lastActivityAt: activity,
    })
  }

  return Array.from(byId.values())
}

function envStatusForRun(status: RunStatus | string): string {
  if (status === "RUNNING") return "BUSY"
  if (status === "PAUSED") return "PAUSED"
  if (status === "BLOCKED" || status === "VERIFICATION_FAILED") return "IDLE"
  return "IDLE"
}

function hydrateLegacyEnv(raw: any, run: StoredRun): StoredEnvironment {
  return {
    id: raw.environmentId || raw.id,
    type: raw.type || "browser",
    provider: run.mode === "live" ? "solari" : "simulator",
    status: "TERMINATED",
    workerId: run.workerId,
    workerName: run.workerName,
    runId: run.runId,
    fabricId: raw.fabricId,
    sessionId: raw.fabricId,
    streamUrl: raw.streamUrl,
    replayUrl: raw.replayUrl,
    createdAt: new Date(run.startedAt).toISOString(),
    lastActivityAt: new Date(run.completedAt || run.startedAt).toISOString(),
  }
}

function normalizeRun(run: StoredRun): StoredRun {
  const environments = (run.environments || []).map((env: any) => {
    if (env.id) return env as StoredEnvironment
    return hydrateLegacyEnv(env, run)
  })
  return {
    ...run,
    events: run.events || [],
    environments,
  }
}

function safeName(idOrName: string): string {
  return idOrName.replace(/[^\w.-]/g, "_")
}
