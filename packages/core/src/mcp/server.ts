/**
 * Meshly MCP server — other agents talk to Worker / Run / Environment / Verify.
 * They do not talk to Solari directly.
 */
import { MeshlyRuntime } from "../runtime.js"
import { ProjectStore } from "../persist/store.js"
import { persistRuntime, restoreRuntime } from "../persist/hydrate.js"
import { AuthorityManager } from "../authority/authority.js"

export const MESHLY_MCP_TOOLS = [
  {
    name: "meshly_create_worker",
    description: "Spawn a Meshly worker. Solari is allocated underneath Meshly, not by the caller.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["probe", "reconciliation", "research", "coding", "operations"] },
        capabilities: { type: "array", items: { type: "string" } },
        budget: { type: "number" },
      },
      required: ["task"],
    },
  },
  {
    name: "meshly_run",
    description: "Run a worker through Intent → Action → Observe → Verify → Commit.",
    inputSchema: {
      type: "object",
      properties: {
        workerId: { type: "string" },
        scenario: { type: "string", enum: ["default", "reality-divergence", "ambiguous-timeout", "ambiguous-timeout-absent"] },
        kind: { type: "string" },
      },
      required: ["workerId"],
    },
  },
  {
    name: "meshly_get_run",
    description: "Inspect a run: status, steps, verification, evidence, operational meters.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_verify",
    description: "Re-check recorded observations against the verification contract. Does not retry the side effect.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_pause",
    description: "Pause a running worker/run. Environments are kept so the run can resume.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_resume",
    description: "Resume a paused or recovered run from its last committed checkpoint.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_takeover",
    description: "Operator takeover of the worker's environment. The agent does not keep executing.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_worker_spawn",
    description: "Alias of meshly_create_worker.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        name: { type: "string" },
        kind: { type: "string" },
        capabilities: { type: "array", items: { type: "string" } },
        budget: { type: "number" },
      },
      required: ["task"],
    },
  },
  {
    name: "meshly_worker_list",
    description: "List workers known to this Meshly runtime / .meshly store.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meshly_run_status",
    description: "Alias of meshly_get_run.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_run_events",
    description: "Causal event timeline for a run.",
    inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
  },
  {
    name: "meshly_environments",
    description: "List leased environments (browser / sandbox / desktop) and which worker/run owns them.",
    inputSchema: { type: "object", properties: {} },
  },
] as const

export interface MeshlyMcpOptions {
  runtime?: MeshlyRuntime
  store?: ProjectStore
  stdin?: NodeJS.ReadableStream
  stdout?: NodeJS.WritableStream
}

export async function startMeshlyMcpServer(options: MeshlyMcpOptions = {}): Promise<{ close: () => void }> {
  const store = options.store || new ProjectStore()
  const runtime = options.runtime || new MeshlyRuntime()
  if (store.exists()) {
    try {
      await restoreRuntime(runtime, store)
    } catch {
      /* empty project is fine */
    }
  }

  const input = options.stdin || process.stdin
  const output = options.stdout || process.stdout
  let buffer = ""
  const onData = (chunk: Buffer | string) => {
    buffer += String(chunk)
    let idx
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      void handleLine(line)
    }
  }
  input.on("data", onData)

  async function handleLine(line: string) {
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "meshly", version: "0.1.2" },
        },
      })
      return
    }
    if (msg.method === "tools/list") {
      write({ jsonrpc: "2.0", id: msg.id, result: { tools: MESHLY_MCP_TOOLS } })
      return
    }
    if (msg.method === "tools/call") {
      try {
        const result = await callTool(String(msg.params?.name), msg.params?.arguments || {})
        write({
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        })
      } catch (err) {
        write({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        })
      }
      return
    }
    if (msg.id !== undefined) {
      write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } })
    }
  }

  async function callTool(name: string, args: any) {
    if (name === "meshly_create_worker" || name === "meshly_worker_spawn") {
      const worker = await runtime.workers.spawn({
        task: args.task,
        name: args.name,
        kind: args.kind,
        capabilities: args.capabilities || ["browser", "sandbox", "desktop"],
        budget: args.budget ?? 2,
        authority: AuthorityManager.issue({
          tools: ["*"],
          capabilities: args.capabilities || ["*"],
          maxSpend: args.budget ?? 2,
        }),
      })
      persistRuntime(runtime, store)
      return { id: worker.id, name: worker.name, task: worker.task, kind: worker.kind }
    }
    if (name === "meshly_worker_list") {
      return runtime.workers.list().map((w) => ({ id: w.id, name: w.name, task: w.task, status: w.status, kind: w.kind }))
    }
    if (name === "meshly_run") {
      const run = await runtime.executeWorker(args.workerId, {
        scenario: args.scenario,
        kind: args.kind,
        destroyAfter: true,
        artifactDir: store.artifactDir(),
      })
      persistRuntime(runtime, store)
      return summarizeRun(run)
    }
    if (name === "meshly_get_run" || name === "meshly_run_status") {
      const run = runtime.runs.get(args.runId)
      if (run) return { ...summarizeRun(run), meters: run.meters() }
      const stored = store.getRun(args.runId)
      if (!stored) throw new Error(`Run '${args.runId}' not found`)
      return stored
    }
    if (name === "meshly_run_events") {
      const live = runtime.events.getRunTimeline(args.runId)
      if (live.length) return live
      return store.loadEvents(args.runId)
    }
    if (name === "meshly_verify") {
      const run = runtime.runs.get(args.runId)
      if (run) {
        const result = await run.verify()
        persistRuntime(runtime, store)
        return result
      }
      const stored = store.getRun(args.runId)
      if (!stored) throw new Error(`Run '${args.runId}' not found`)
      return { matched: stored.status === "COMPLETED" || stored.status === "VERIFIED" || stored.status === "COMMITTED", stored: true }
    }
    if (name === "meshly_pause") {
      const run = runtime.runs.get(args.runId)
      if (!run) throw new Error(`Run '${args.runId}' not found`)
      await run.pause()
      persistRuntime(runtime, store)
      return summarizeRun(run)
    }
    if (name === "meshly_resume") {
      const run = await runtime.resumeRun(args.runId, {
        destroyAfter: true,
        artifactDir: store.artifactDir(),
      })
      persistRuntime(runtime, store)
      return summarizeRun(run)
    }
    if (name === "meshly_takeover") {
      const run = runtime.runs.get(args.runId)
      if (!run) throw new Error(`Run '${args.runId}' not found`)
      const session = await run.takeover()
      persistRuntime(runtime, store)
      return { run: summarizeRun(run), takeover: session }
    }
    if (name === "meshly_environments") {
      return runtime.broker.list().map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        fabricId: e.fabricId,
        owner: e.owner,
      }))
    }
    throw new Error(`Unknown tool ${name}`)
  }

  function summarizeRun(run: { runId: string; status: string; error?: string; steps: any[]; meters?: () => any }) {
    return {
      runId: run.runId,
      status: run.status,
      error: run.error,
      meters: typeof run.meters === "function" ? run.meters() : undefined,
      steps: run.steps.map((s: any) => ({
        intent: s.intent,
        status: s.status,
        agentClaim: s.agentClaim,
        worldStateMatched: s.worldStateMatched,
      })),
    }
  }

  function write(payload: unknown) {
    output.write(JSON.stringify(payload) + "\n")
  }

  return {
    close: () => {
      input.off("data", onData)
    },
  }
}
