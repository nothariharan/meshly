import fs from "node:fs"
import path from "node:path"
import { Meshly, AuthorityManager, ProjectStore, Verifier } from "@meshly/sdk"
import type { StoredRun, StoredWorker, StoredEnvironment, StoredOperatorAction } from "@meshly/sdk"

export interface ConsoleOptions {
  cwd?: string
  port?: number
}

export function loadEnv(cwd: string): void {
  for (const rel of [".env", path.join(".meshly", ".env")]) {
    const file = path.join(cwd, rel)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, "utf8")
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

export function createStore(cwd: string): ProjectStore {
  return new ProjectStore(cwd)
}

export function providerLabel(store: ProjectStore): { mode: "live" | "simulator"; label: string } {
  const execution = store.exists() ? store.loadConfig().execution : process.env.SOLARI_API_KEY ? "solari" : "simulator"
  const live = execution === "solari" && Boolean(process.env.SOLARI_API_KEY)
  return live
    ? { mode: "live", label: "LIVE · SOLARI" }
    : { mode: "simulator", label: "SIMULATOR" }
}

function createMesh(store: ProjectStore): Meshly {
  const { mode } = providerLabel(store)
  if (mode === "simulator") return new Meshly({ preferSimulator: true })
  return new Meshly({
    solariApiKey: process.env.SOLARI_API_KEY,
    fallbackToSimulator: false,
  })
}

function persistFromRuntime(store: ProjectStore, mesh: Meshly, run: any, worker: any, destroyAfter: boolean) {
  store.snapshotRun({
    run,
    worker: { id: worker.id, name: worker.name, task: worker.task },
    mode: mesh.mode,
    events: mesh.events.query({ runId: run.runId }),
    destroyAfter,
  })
  const existing = store.getWorker(worker.id) || store.getWorker(worker.name || "")
  store.saveWorker({
    id: worker.id,
    name: worker.name || existing?.name || worker.id,
    task: worker.task,
    capabilities: worker.capabilities,
    priority: worker.priority,
    budget: worker.budget.maxSpend,
    spent: worker.budget.spent,
    status: worker.status,
    currentRunId: run.runId,
    authority: {
      tools: worker.authority.tools,
      capabilities: worker.authority.capabilities,
      domains: worker.authority.domains,
      maxSpend: worker.authority.maxSpend,
      writeAccess: worker.authority.writeAccess,
    },
    memory: (worker.memory || []).map((m: any) => ({ key: m.key, tier: m.tier, value: m.value })),
    createdAt: existing?.createdAt || worker.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

const inflight = new Map<string, { runId?: string; error?: string }>()
const listeners = new Set<(payload: string) => void>()

export function subscribe(listener: (payload: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function broadcast(store: ProjectStore): void {
  const payload = JSON.stringify({ type: "state", state: snapshot(store) })
  for (const listener of listeners) listener(payload)
}

export function snapshot(store: ProjectStore) {
  const initialized = store.exists()
  const config = initialized ? store.loadConfig() : null
  const workers = initialized ? uniqueWorkers(store.listWorkers()) : []
  const runs = initialized ? store.listRuns().map(withDerivedEvents) : []
  const environments = initialized ? store.listEnvironments() : []
  const { mode, label } = providerLabel(store)
  const attention = runs.filter(
    (r) => r.status === "BLOCKED" || r.status === "VERIFICATION_FAILED" || r.steps?.some((s: any) => s.worldStateMatched === false),
  )
  const occupied = environments.filter((e) => e.status === "BUSY" || e.status === "ACTIVE" || e.status === "READY")
  const failedVerify = attention.length

  return {
    initialized,
    config,
    provider: { mode, label, hasSolariKey: Boolean(process.env.SOLARI_API_KEY) },
    workers: workers.map((w) => decorateWorker(w, runs, environments)),
    runs,
    environments,
    policies: workers.map((w) => ({
      workerId: w.id,
      workerName: w.name,
      authority: w.authority || {
        tools: ["browser_navigate", "sandbox_exec", "desktop_screenshot"],
        capabilities: w.capabilities,
        domains: ["example.com"],
        maxSpend: w.budget,
      },
    })),
    attention: attention.map((r) => r.runId),
    occupied: occupied.map((e) => e.id),
    failedVerify,
    inflight: Array.from(inflight.entries()).map(([id, job]) => ({ workerId: id, ...job })),
  }
}

function uniqueWorkers(workers: StoredWorker[]): StoredWorker[] {
  const byName = new Map<string, StoredWorker>()
  for (const worker of workers) {
    const key = worker.name || worker.id
    const prev = byName.get(key)
    if (!prev || worker.updatedAt > prev.updatedAt) byName.set(key, worker)
  }
  return Array.from(byName.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function withDerivedEvents(run: StoredRun): StoredRun {
  if (run.events && run.events.length > 0) return run
  const events: StoredRun["events"] = []
  let seq = 0
  let parent: string | undefined
  const push = (type: string, timestamp: number, data: Record<string, unknown> = {}) => {
    seq += 1
    const id = `evt_derived_${run.runId}_${seq}`
    events.push({
      id,
      runId: run.runId,
      sequence: seq,
      parentEventId: parent,
      type: type as any,
      timestamp,
      workerId: run.workerId,
      data,
    })
    parent = id
  }
  push("run.started", run.startedAt, { derived: true })
  for (const step of run.steps || []) {
    const ts = step.timestamp || run.startedAt
    push("intent.created", ts, { intent: step.intent })
    if (step.status !== "rejected" || step.agentClaim) push("authority.approved", ts, { tool: step.action?.tool })
    if (step.observation?.type) push(`solari.${step.observation.type}.created`, ts, { environmentId: step.observation.environmentId })
    if (step.action) push("action.executed", ts, { tool: step.action.tool })
    if (step.observation) push("observation.recorded", ts, { type: step.observation.type })
    push("verification.started", ts, { intent: step.contract?.intent })
    if (step.worldStateMatched === false) {
      push("verification.failed", ts, { reason: step.error })
      push("commit.blocked", ts, { reason: step.error })
    } else if (step.status === "committed") {
      push("verification.passed", ts, {})
      push("commit.committed", ts, {})
    }
  }
  if (run.status === "COMPLETED") push("run.completed", run.completedAt || run.startedAt, {})
  if (run.status === "BLOCKED" || run.status === "VERIFICATION_FAILED") push("run.blocked", run.completedAt || run.startedAt, { error: run.error })
  if (run.status === "FAILED") push("run.failed", run.completedAt || run.startedAt, { error: run.error })
  return { ...run, events }
}

function decorateWorker(worker: StoredWorker, runs: StoredRun[], environments: StoredEnvironment[]) {
  const workerRuns = runs.filter((r) => r.workerId === worker.id || r.workerName === worker.name)
  const latest = workerRuns[0]
  const lastEvent = latest?.events?.[latest.events.length - 1]
  const lastStep = latest?.steps?.[latest.steps.length - 1]
  const env = environments.find((e) => e.workerId === worker.id) || latest?.environments?.[0]
  let displayStatus = worker.status || "CREATED"
  if (latest?.status === "COMPLETED") displayStatus = "VERIFIED"
  else if (latest?.status === "BLOCKED" || latest?.status === "VERIFICATION_FAILED") displayStatus = "BLOCKED"
  else if (latest?.status === "RUNNING" || inflight.has(worker.id)) displayStatus = "RUNNING"
  else if (latest?.status === "PAUSED") displayStatus = "PAUSED"
  return {
    ...worker,
    displayStatus,
    currentRunId: latest?.runId || worker.currentRunId,
    currentRunStatus: latest?.status,
    environment: env
      ? { id: env.id, type: env.type, status: env.status, provider: env.provider, sessionId: env.sessionId }
      : null,
    spent: worker.spent ?? 0,
    lastEvent: lastEvent ? { type: lastEvent.type, timestamp: lastEvent.timestamp } : null,
    lastVerification: lastStep
      ? {
          agentClaim: lastStep.agentClaim,
          toolExecution: lastStep.toolExecution,
          worldStateMatched: lastStep.worldStateMatched,
          error: lastStep.error,
        }
      : null,
    runCount: workerRuns.length,
  }
}

export async function handleApi(
  store: ProjectStore,
  method: string,
  pathname: string,
  body: any,
): Promise<{ status: number; json?: any; error?: string }> {
  if (method === "GET" && pathname === "/api/snapshot") {
    return { status: 200, json: snapshot(store) }
  }

  if (method === "POST" && pathname === "/api/init") {
    const execution = body?.provider === "solari" && process.env.SOLARI_API_KEY ? "solari" : "simulator"
    const config = store.ensure(body?.name || path.basename(store.root), execution)
    broadcast(store)
    return { status: 200, json: { config } }
  }

  if (method === "POST" && pathname === "/api/workers") {
    store.ensure(path.basename(store.root), providerLabel(store).mode === "live" ? "solari" : "simulator")
    const name = String(body?.name || "").trim()
    const task = String(body?.task || "").trim()
    if (!name || !task) return { status: 400, error: "name and task are required" }
    if (store.getWorker(name)) return { status: 409, error: `Worker '${name}' already exists.` }
    const capabilities = Array.isArray(body?.capabilities) && body.capabilities.length
      ? body.capabilities
      : ["browser"]
    const worker: StoredWorker = {
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name,
      task,
      capabilities,
      priority: Number(body?.priority || 8),
      budget: Number(body?.budget || 2),
      spent: 0,
      status: "CREATED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.saveWorker(worker)
    broadcast(store)
    return { status: 201, json: { worker } }
  }

  const workerRun = pathname.match(/^\/api\/workers\/([^/]+)\/run$/)
  if (method === "POST" && workerRun) {
    const id = decodeURIComponent(workerRun[1])
    const scenario = body?.scenario === "reality-divergence" ? "reality-divergence" : "default"
    return startWorkerRun(store, id, scenario)
  }

  if (method === "POST" && pathname === "/api/fail") {
    store.ensure(path.basename(store.root), providerLabel(store).mode === "live" ? "solari" : "simulator")
    let worker = store.getWorker("reality-check")
    if (!worker) {
      worker = {
        id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
        name: "reality-check",
        task: "Confirm invoice 4421 is paid",
        capabilities: ["browser"],
        priority: 8,
        budget: 2,
        spent: 0,
        status: "CREATED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      store.saveWorker(worker)
    }
    return startWorkerRun(store, worker.id, "reality-divergence")
  }

  const reverify = pathname.match(/^\/api\/runs\/([^/]+)\/reverify$/)
  if (method === "POST" && reverify) {
    return reverifyRun(store, decodeURIComponent(reverify[1]))
  }

  const takeover = pathname.match(/^\/api\/runs\/([^/]+)\/takeover$/)
  if (method === "POST" && takeover) {
    return takeoverRun(store, decodeURIComponent(takeover[1]))
  }

  const compensate = pathname.match(/^\/api\/runs\/([^/]+)\/compensate$/)
  if (method === "POST" && compensate) {
    return compensateRun(store, decodeURIComponent(compensate[1]))
  }

  const artifact = pathname.match(/^\/api\/artifacts\/([^/]+)\/([^/]+)$/)
  if (method === "GET" && artifact) {
    return { status: 404, error: "use static artifact handler" }
  }

  return { status: 404, error: "Not found" }
}

async function startWorkerRun(
  store: ProjectStore,
  id: string,
  scenario: "default" | "reality-divergence",
): Promise<{ status: number; json?: any; error?: string }> {
  const definition = store.getWorker(id)
  if (!definition) return { status: 404, error: `Worker '${id}' not found.` }
  if (inflight.has(definition.id)) return { status: 409, error: "Worker already running." }

  inflight.set(definition.id, {})
  broadcast(store)

  const mesh = createMesh(store)
  const caps = scenario === "reality-divergence" ? ["browser"] : definition.capabilities
  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    task: definition.task,
    capabilities: caps,
    priority: definition.priority,
    budget: definition.budget,
    authority: AuthorityManager.issue({
      tools: ["browser_navigate", "sandbox_exec", "desktop_screenshot"],
      capabilities: caps,
      domains: ["example.com"],
      maxSpend: definition.budget,
    }),
  })

  const runPromise = worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    scenario,
    onProgress: (instance) => {
      inflight.set(definition.id, { runId: instance.runId })
      persistFromRuntime(store, mesh, instance, worker, instance.status !== "RUNNING")
      broadcast(store)
    },
  })

  runPromise
    .then((run) => {
      persistFromRuntime(store, mesh, run, worker, true)
    })
    .catch((err) => {
      inflight.set(definition.id, { error: err instanceof Error ? err.message : String(err) })
    })
    .finally(() => {
      inflight.delete(definition.id)
      broadcast(store)
    })

  return { status: 202, json: { accepted: true, workerId: definition.id, scenario } }
}

function appendEvent(run: StoredRun, type: string, data: Record<string, unknown>) {
  const last = run.events[run.events.length - 1]
  const event = {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    runId: run.runId,
    sequence: (last?.sequence || 0) + 1,
    parentEventId: last?.id,
    type: type as any,
    timestamp: Date.now(),
    workerId: run.workerId,
    data,
  }
  run.events = [...(run.events || []), event]
}

function recordAction(run: StoredRun, action: StoredOperatorAction) {
  run.operatorActions = [...(run.operatorActions || []), action]
}

function reverifyRun(store: ProjectStore, runId: string): { status: number; json?: any; error?: string } {
  const run = store.getRun(runId)
  if (!run) return { status: 404, error: "Run not found" }
  const step = [...run.steps].reverse().find((s: any) => s.worldStateMatched === false) || run.steps[run.steps.length - 1]
  if (!step) return { status: 400, error: "No step to re-verify" }
  const contract = step.contract || {
    intent: "Re-verify recorded world state",
    preconditions: [],
    postconditions: [
      { target: step.observation?.type || "browser", type: "text_contains", query: "title", expected: "Example" },
    ],
  }
  const observation = step.observation || {}
  let matched = true
  let error: string | undefined
  for (const cond of contract.postconditions || []) {
    const actual = observation[cond.query]
    if (!Verifier.matchesCondition(cond, actual)) {
      matched = false
      error = `Postcondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`
      break
    }
  }
  appendEvent(run, "verification.started", { reason: "operator re-verify", stepId: step.id })
  if (matched) {
    step.worldStateMatched = true
    step.status = "verified"
    appendEvent(run, "verification.passed", { stepId: step.id })
    run.status = "COMPLETED"
    run.error = undefined
  } else {
    step.worldStateMatched = false
    appendEvent(run, "verification.failed", { reason: error, stepId: step.id })
    appendEvent(run, "commit.blocked", { reason: error })
    run.status = "BLOCKED"
    run.error = error
  }
  recordAction(run, {
    type: "reverify",
    at: new Date().toISOString(),
    result: matched ? "matched" : "mismatch",
    detail: { error },
  })
  store.saveRun(run)
  broadcast(store)
  return { status: 200, json: { run, matched, error } }
}

function takeoverRun(store: ProjectStore, runId: string): { status: number; json?: any; error?: string } {
  const run = store.getRun(runId)
  if (!run) return { status: 404, error: "Run not found" }
  const env = run.environments[0]
  const sessionId = `op_${Date.now().toString(36)}`
  const streamUrl = env?.streamUrl || env?.replayUrl
  run.takeover = { sessionId, startedAt: Date.now(), streamUrl, active: true }
  appendEvent(run, "human.intervention", {
    action: "takeover_started",
    sessionId,
    streamUrl,
    environmentId: env?.id,
  })
  recordAction(run, {
    type: "takeover",
    at: new Date().toISOString(),
    result: "started",
    detail: { sessionId, streamUrl, environmentId: env?.id },
  })
  store.saveRun(run)
  broadcast(store)
  return { status: 200, json: { run, takeover: run.takeover } }
}

function compensateRun(store: ProjectStore, runId: string): { status: number; json?: any; error?: string } {
  const run = store.getRun(runId)
  if (!run) return { status: 404, error: "Run not found" }
  appendEvent(run, "compensation.started", { reason: run.error || "operator compensate" })
  run.compensated = true
  appendEvent(run, "compensation.completed", { compensated: true, commit: "abandoned" })
  recordAction(run, {
    type: "compensate",
    at: new Date().toISOString(),
    result: "compensated",
    detail: { commit: "abandoned" },
  })
  store.saveRun(run)
  broadcast(store)
  return { status: 200, json: { run } }
}

export function artifactPath(store: ProjectStore, runId: string, file: string): string | undefined {
  const safeRun = runId.replace(/[^\w.-]/g, "_")
  const safeFile = path.basename(file)
  const filePath = path.join(store.artifactDir(), safeRun, safeFile)
  if (fs.existsSync(filePath)) return filePath
  return undefined
}
