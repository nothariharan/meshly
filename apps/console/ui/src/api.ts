export type Snapshot = {
  initialized: boolean
  config: { name: string; execution: string; createdAt: string } | null
  provider: { mode: "live" | "simulator"; label: string; hasSolariKey: boolean }
  workers: WorkerRow[]
  projects: ProjectRecord[]
  metrics: {
    totalRuns: number
    succeeded: number
    blocked: number
    unknown: number
    scheduled: number
    spend: number
  }
  runs: RunRecord[]
  environments: EnvRecord[]
  policies: PolicyRecord[]
  attention: string[]
  occupied: string[]
  failedVerify: number
  inflight: Array<{ workerId: string; runId?: string; error?: string }>
}

export type ProjectRecord = {
  name: string
  workers: Array<{
    id: string
    name: string
    kind?: string
    task?: string
    capabilities?: string[]
    status?: string
    displayStatus: string
    budget: number
    spent: number
    currentRunId?: string
    currentRunStatus?: string
    runCount?: number
    lastRunAt?: number
    lastRunStatus?: string
  }>
}

export type WorkerRow = {
  id: string
  name: string
  task: string
  capabilities: string[]
  priority: number
  budget: number
  spent?: number
  status?: string
  displayStatus: string
  currentRunId?: string
  currentRunStatus?: string
  environment: { id: string; type: string; status: string; provider: string; sessionId?: string } | null
  lastEvent: { type: string; timestamp: number } | null
  lastVerification: {
    agentClaim?: string
    toolExecution?: string
    worldStateMatched?: boolean
    error?: string
  } | null
  authority?: {
    tools: string[]
    capabilities: string[]
    domains?: string[]
    maxSpend?: number
  }
  memory?: Array<{ key: string; tier: string; value?: unknown }>
  limits?: {
    maxSpend: number
    maxDurationMs: number
    maxEnvironments: number
    maxRetries: number
    maxToolCalls: number
  }
  updatedAt: string
  createdAt: string
  runCount: number
}

export type RunRecord = {
  runId: string
  workerId: string
  workerName?: string
  objective: string
  status: string
  mode: "live" | "simulator"
  startedAt: number
  completedAt?: number
  environments: EnvRecord[]
  steps: any[]
  events: any[]
  evidence?: any
  error?: string
  sha256Digest?: string
  takeover?: { sessionId: string; streamUrl?: string; active: boolean; startedAt: number }
  compensated?: boolean
  operatorActions?: Array<{ type: string; at: string; result: string }>
  toolCalls?: number
  retries?: number
  kind?: string
  decision?: {
    decision: string
    headline: string
    why: string[]
    policy?: string
    authority?: string
    next?: string
  }
  schedule?: {
    headline: string
    why: string[]
  }
}

export type EnvRecord = {
  id: string
  type: string
  provider: string
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

export type PolicyRecord = {
  workerId: string
  workerName: string
  authority: {
    tools: string[]
    capabilities: string[]
    domains?: string[]
    maxSpend?: number
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function fetchSnapshot(): Promise<Snapshot> {
  return parse(await fetch("/api/snapshot"))
}

export async function initProject() {
  return parse(await fetch("/api/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
}

export async function createWorker(body: {
  name: string
  task: string
  capabilities: string[]
  budget?: number
  kind?: string
}) {
  return parse(
    await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

export async function runWorker(id: string, scenario?: "default" | "reality-divergence" | "ambiguous-timeout" | "ambiguous-timeout-absent") {
  return parse(
    await fetch(`/api/workers/${encodeURIComponent(id)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    }),
  )
}

export async function runFailure() {
  return parse(await fetch("/api/fail", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
}

export async function reverify(runId: string) {
  return parse(await fetch(`/api/runs/${encodeURIComponent(runId)}/reverify`, { method: "POST" }))
}

export async function takeover(runId: string) {
  return parse(await fetch(`/api/runs/${encodeURIComponent(runId)}/takeover`, { method: "POST" }))
}

export async function cancelRun(runId: string) {
  return parse(await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }))
}

export async function resumeRun(runId: string) {
  return parse(await fetch(`/api/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" }))
}

export async function compensate(runId: string) {
  return parse(await fetch(`/api/runs/${encodeURIComponent(runId)}/compensate`, { method: "POST" }))
}
