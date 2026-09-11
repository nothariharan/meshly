/**
 * Persist / restore a MeshlyRuntime so `meshly restart` does not destroy the world.
 */
import type { CheckpointRef, ExecutionEnvironment, MeshlyEvent } from "../types.js"
import type { MeshlyRuntime } from "../runtime.js"
import { AuthorityManager } from "../authority/authority.js"
import { WorkerInstance } from "../worker/worker.js"
import { RunInstance } from "../run/run.js"
import type { ProjectStore } from "./store.js"

export function persistRuntime(runtime: MeshlyRuntime, store: ProjectStore): void {
  store.ensure()
  const events = runtime.events.exportAll()
  for (const worker of runtime.workers.list()) {
    store.saveWorker({
      id: worker.id,
      name: worker.name || worker.id,
      kind: worker.kind,
      task: worker.task,
      capabilities: worker.capabilities,
      priority: worker.priority,
      budget: worker.budget.maxSpend,
      spent: worker.budget.spent,
      limits: worker.limits,
      status: worker.status,
      currentRunId: worker.context.runId,
      authority: {
        tools: worker.authority.tools,
        capabilities: worker.authority.capabilities,
        domains: worker.authority.domains,
        maxSpend: worker.authority.maxSpend,
        writeAccess: worker.authority.writeAccess,
      },
      memory: Object.entries(runtime.memory.snapshot(worker.id)).map(([key, v]: [string, any]) => ({
        key,
        tier: v.tier,
        value: v.value,
      })),
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString(),
    })
    store.saveMemory(worker.id, runtime.memory.snapshot(worker.id))
    store.savePolicy(worker.id, worker.authority)
  }

  for (const run of runtime.runs.list()) {
    const runEvents = events.filter((e) => e.runId === run.runId)
    store.snapshotRun({
      run,
      worker: runtime.workers.get(run.workerId) || { id: run.workerId, task: run.objective },
      mode: runtime.broker.getFabric().name.includes("simulator") ? "simulator" : "live",
      events: runEvents,
      destroyAfter: false,
    })
  }

  for (const env of runtime.broker.list()) {
    store.saveEnvironment({
      id: env.id,
      type: env.type,
      provider: runtime.broker.getFabric().name.includes("simulator") ? "simulator" : "solari",
      status: env.status,
      workerId: env.owner,
      fabricId: env.fabricId,
      sessionId: env.fabricId,
      streamUrl: env.streamUrl,
      replayUrl: env.replayUrl,
      leaseId: env.currentLeaseId,
      createdAt: env.lastActiveAt.toISOString(),
      lastActivityAt: env.lastActiveAt.toISOString(),
    })
  }

  for (const cp of runtime.checkpoints.exportAll()) store.saveCheckpoint(cp)

  store.saveKernel({
    savedAt: new Date().toISOString(),
    workers: runtime.workers.list().map((w) => w.id),
    runs: runtime.runs.list().map((r) => r.runId),
    environments: runtime.broker.list().map((e) => ({
      id: e.id,
      type: e.type,
      fabricId: e.fabricId,
      status: e.status,
      owner: e.owner,
      streamUrl: e.streamUrl,
      replayUrl: e.replayUrl,
      leaseId: e.currentLeaseId,
    })),
  })
}

export async function restoreRuntime(runtime: MeshlyRuntime, store: ProjectStore): Promise<{
  workers: number
  runs: number
  reconnected: number
  lost: number
}> {
  if (!store.exists()) throw new Error("No Meshly project here. Run `meshly init` first.")

  const events = store.loadEvents()
  if (events.length) runtime.events.load(events as MeshlyEvent[])

  for (const mem of store.listMemory()) {
    for (const [key, value] of Object.entries(mem.snapshot || {})) {
      const entry = value as { value?: any; tier?: "hot" | "warm" | "cold" }
      runtime.memory.put({
        workerId: mem.workerId,
        key,
        value: entry.value,
        tier: entry.tier,
      })
    }
  }

  for (const stored of store.listWorkers()) {
    if (runtime.workers.get(stored.id)) continue
    const worker = new WorkerInstance({
      id: stored.id,
      name: stored.name,
      kind: stored.kind as any,
      task: stored.task,
      priority: stored.priority,
      budget: stored.budget,
      limits: stored.limits,
      capabilities: stored.capabilities,
      authority: stored.authority
        ? {
            tools: stored.authority.tools,
            capabilities: stored.authority.capabilities,
            domains: stored.authority.domains,
            maxSpend: stored.authority.maxSpend,
            writeAccess: stored.authority.writeAccess,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }
        : AuthorityManager.issue({ tools: ["*"], capabilities: stored.capabilities, maxSpend: stored.budget }),
      context: runtime.contexts.init(stored.id, stored.task),
      mesh: runtime,
    })
    worker.status = (stored.status as any) || "CREATED"
    worker.budget.spent = stored.spent ?? 0
    worker.context.runId = stored.currentRunId
    runtime.workers.restore(worker)
  }

  for (const stored of store.listRuns()) {
    const worker = runtime.workers.get(stored.workerId)
    if (!worker) continue
    const run = new RunInstance(worker, runtime.events, stored.runId, {
      silent: true,
      startedAt: stored.startedAt,
    })
    run.status = stored.status as any
    run.kind = stored.kind as any
    run.toolCalls = stored.toolCalls || 0
    run.retries = stored.retries || 0
    run.steps.splice(0, run.steps.length, ...(stored.steps || []))
    run.environments.splice(0, run.environments.length, ...(stored.environments || []).map((e) => e.id))
    run.evidence = stored.evidence
    run.error = stored.error
    if (stored.completedAt) run.completedAt = stored.completedAt
    runtime.runs.restore(run)
  }

  for (const cp of store.listCheckpoints() as CheckpointRef[]) {
    runtime.checkpoints.restore(cp)
    const run = runtime.runs.getByWorker(cp.workerId).find((r) => r.status === "PAUSED" || r.status === "RUNNING" || r.status === "UNKNOWN")
      || runtime.runs.getByWorker(cp.workerId).at(-1)
    if (run && !run.checkpoints.some((existing) => existing.id === cp.id)) {
      run.recordCheckpoint(cp)
    }
  }

  let reconnected = 0
  let lost = 0
  for (const stored of store.listEnvironments()) {
    if (!stored.fabricId) continue
    const env: ExecutionEnvironment = {
      id: stored.id,
      type: stored.type as any,
      status: stored.status as any,
      fabricId: stored.fabricId,
      owner: stored.workerId,
      loadedFiles: [],
      cost: 0,
      capabilities: [stored.type as any],
      streamUrl: stored.streamUrl,
      replayUrl: stored.replayUrl,
      currentLeaseId: stored.leaseId,
      lastActiveAt: new Date(stored.lastActivityAt),
    }
    runtime.broker.adopt(env)
    try {
      await runtime.broker.reconnect(env.id)
      reconnected += 1
    } catch {
      env.status = "LOST"
      lost += 1
    }
  }

  runtime.events.emit("runtime.restored", {
    data: {
      workers: runtime.workers.size,
      runs: runtime.runs.list().length,
      reconnected,
      lost,
    },
  })

  return { workers: runtime.workers.size, runs: runtime.runs.list().length, reconnected, lost }
}
