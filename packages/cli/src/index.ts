#!/usr/bin/env node
/**
 * Meshly CLI — run autonomous workers without knowing the kernel.
 *
 *   meshly init
 *   meshly worker create
 *   meshly run
 *   meshly inspect <run>
 */
import fs from "node:fs"
import path from "node:path"
import { Meshly, AuthorityManager, inferWorkerKind } from "@meshly/sdk"
import type { RunInstance, WorkerInstance } from "@meshly/core"
import { runBenchmark } from "./benchmark.js"
import { loadEnv, requireSolariKey } from "./env.js"
import { ProjectStore, type StoredRun, type StoredWorker } from "./store.js"
import { runInit } from "./init.js"
import { fileURLToPath } from "node:url"

loadEnv()

function parseArgs(argv: string[]): { command: string; rest: string[]; flags: Record<string, string | boolean> } {
  const rest: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--") {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2)
      const eq = body.indexOf("=")
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
      } else {
        const next = argv[i + 1]
        if (next && !next.startsWith("-")) {
          flags[body] = next
          i += 1
        } else {
          flags[body] = true
        }
      }
    } else {
      rest.push(arg)
    }
  }
  return { command: rest[0] || "help", rest: rest.slice(1), flags }
}

function createClient(flags: Record<string, string | boolean>): Meshly {
  const simulator = Boolean(flags.simulator)
  if (simulator) {
    return new Meshly({ preferSimulator: true })
  }
  requireSolariKey()
  return new Meshly({
    solariApiKey: process.env.SOLARI_API_KEY,
    fallbackToSimulator: false,
  })
}

function flagList(value: string | boolean | undefined, fallback: string[]): string[] {
  if (typeof value !== "string" || !value.trim()) return fallback
  return value.split(",").map((s) => s.trim()).filter(Boolean)
}

function persistRun(
  store: ProjectStore,
  mesh: Meshly,
  run: RunInstance,
  worker: WorkerInstance,
  destroyAfter = true,
): StoredRun {
  const stored = store.snapshotRun({
    run,
    worker: { id: worker.id, name: worker.name, task: worker.task },
    mode: mesh.mode,
    events: mesh.events.query({ runId: run.runId }),
    destroyAfter,
  })
  persistWorkerSnapshot(store, worker, run.runId)
  return stored
}

function persistWorkerSnapshot(store: ProjectStore, worker: WorkerInstance, runId?: string): StoredWorker {
  const existing = store.getWorker(worker.id) || store.getWorker(worker.name || "")
  const snapshot: StoredWorker = {
    id: worker.id,
    name: worker.name || existing?.name || worker.id,
    kind: worker.kind || existing?.kind,
    task: worker.task,
    capabilities: worker.capabilities,
    priority: worker.priority,
    budget: worker.budget.maxSpend,
    spent: worker.budget.spent,
    limits: worker.limits,
    status: worker.status,
    currentRunId: runId || worker.context.runId || existing?.currentRunId,
    authority: {
      tools: worker.authority.tools,
      capabilities: worker.authority.capabilities,
      domains: worker.authority.domains,
      maxSpend: worker.authority.maxSpend,
      writeAccess: worker.authority.writeAccess,
    },
    memory: (worker.memory || []).map((m) => ({ key: m.key, tier: m.tier, value: m.value })),
    createdAt: existing?.createdAt || worker.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.saveWorker(snapshot)
  return snapshot
}

function printRun(run: StoredRun): void {
  console.log(`\nRUN ${run.runId}`)
  console.log(`  Worker      ${run.workerName || run.workerId}`)
  console.log(`  Status      ${run.status}`)
  console.log(`  Mode        ${run.mode}`)
  if (run.error) console.log(`  Error       ${run.error}`)
  console.log("")
  for (const step of run.steps) {
    console.log(`  ${step.stepIndex}. ${String(step.status).toUpperCase().padEnd(11)} ${step.intent}`)
    console.log(`     Intent → Action → Observe → Verify → ${step.status === "committed" ? "Commit" : "Blocked"}`)
    if (step.observation?.fabricId) console.log(`     Solari ID  ${step.observation.fabricId}`)
    if (step.observation?.payment_status) console.log(`     Payment    ${step.observation.payment_status}`)
    if (step.observation?.ledger) console.log(`     Ledger     ${step.observation.ledger}`)
    if (step.observation?.erp_status) console.log(`     ERP        ${step.observation.erp_status}`)
    if (step.observation?.title) console.log(`     Title      ${step.observation.title}`)
    if (step.observation?.stdout) console.log(`     stdout     ${step.observation.stdout}`)
    if (step.observation?.streamUrl) console.log(`     Stream     ${step.observation.streamUrl}`)
    if (step.observation?.replayUrl) console.log(`     Replay     ${step.observation.replayUrl}`)
    if (step.error) console.log(`     Error      ${step.error}`)
    console.log("")
  }
  if (run.sha256Digest) console.log(`  Digest     ${run.sha256Digest}`)
  console.log("")
}

const ALL_TOOLS = [
  "browser_navigate",
  "browser_extract",
  "browser_click",
  "sandbox_exec",
  "sandbox_write",
  "sandbox_read",
  "desktop_write",
  "desktop_read",
  "desktop_screenshot",
  "desktop_health",
  "desktop_open",
  "desktop_type",
  "desktop_click",
]

const TEMPLATES: Record<string, { name: string; task: string; capabilities: string[]; kind: string }> = {
  reconciliation: {
    name: "invoice-reconciler",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    kind: "reconciliation",
  },
  research: {
    name: "research",
    task: "Collect information, analyze it, and produce a verified report",
    capabilities: ["browser", "sandbox"],
    kind: "research",
  },
  coding: {
    name: "coding",
    task: "Modify a repository, run tests, and browser-QA the artifact",
    capabilities: ["sandbox", "browser"],
    kind: "coding",
  },
  operations: {
    name: "operations",
    task: "Look up system status, process the incident, and file a desktop ops ticket",
    capabilities: ["browser", "sandbox", "desktop"],
    kind: "operations",
  },
}

function issueWorkerAuthority(capabilities: string[], budget: number) {
  return AuthorityManager.issue({
    tools: ALL_TOOLS,
    capabilities,
    domains: ["*"],
    maxSpend: budget,
  })
}

async function cmdWorkerCreate(store: ProjectStore, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  store.loadConfig()
  const templateName = String(flags.template || "").trim()
  const template = templateName ? TEMPLATES[templateName] : undefined
  const name = String(flags.name || rest[0] || template?.name || "").trim()
  const task = String(flags.task || rest.slice(name && rest[0] === name ? 1 : 0).join(" ") || template?.task || "").trim()
  if (!name || !task) {
    console.error('Usage: meshly worker create --name <name> --task "<what to do>" [--capabilities browser,sandbox,desktop]')
    console.error("   or: meshly worker create --template reconciliation|research|coding|operations")
    process.exitCode = 1
    return
  }
  if (store.getWorker(name)) {
    console.error(`Worker '${name}' already exists.`)
    process.exitCode = 1
    return
  }
  const capabilities = flagList(flags.capabilities, template?.capabilities || ["browser", "sandbox", "desktop"])
  const kind = String(flags.kind || template?.kind || inferWorkerKind(task) || "probe")
  const worker = {
    id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
    name,
    kind,
    task,
    capabilities,
    priority: Number(flags.priority || 8),
    budget: Number(flags.budget || 2),
    spent: 0,
    limits: {
      maxSpend: Number(flags.budget || 2),
      maxDurationMs: 30 * 60_000,
      maxEnvironments: 3,
      maxRetries: 1,
      maxToolCalls: 40,
    },
    status: "CREATED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.saveWorker(worker)
  store.savePolicy(worker.id, issueWorkerAuthority(capabilities, worker.budget))
  console.log(`\nCreated worker ${worker.name}`)
  console.log(`  ID            ${worker.id}`)
  console.log(`  Kind          ${worker.kind}`)
  console.log(`  Task          ${worker.task}`)
  console.log(`  Environments  ${worker.capabilities.join(" · ")}`)
  console.log(`\nRun it:\n  meshly run ${worker.name}\n`)
}

async function cmdWorkers(store: ProjectStore): Promise<void> {
  store.loadConfig()
  const workers = store.listWorkers()
  if (workers.length === 0) {
    console.log("\nNo workers. Create one:\n  meshly worker create --name research --task \"Open example.com\" --capabilities browser\n")
    return
  }
  console.log("\n  NAME                    ID            ENVIRONMENTS")
  console.log("  " + "-".repeat(72))
  for (const w of workers) {
    console.log(`  ${w.name.padEnd(23)} ${w.id.padEnd(13)} ${w.capabilities.join(",")}`)
  }
  console.log("")
}

async function cmdRun(store: ProjectStore, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  store.loadConfig()
  const target = rest[0]
  if (!target) {
    console.error("Usage: meshly run <worker-name-or-id>")
    process.exitCode = 1
    return
  }
  const definition = store.getWorker(target)
  if (!definition) {
    console.error(`Worker '${target}' not found.`)
    process.exitCode = 1
    return
  }

  const mesh = createClient(flags)
  console.log(`\nMESHLY  mode=${mesh.mode}`)
  console.log(`Worker  ${definition.name}`)
  console.log(`Task    ${definition.task}`)
  console.log(`Envs    ${definition.capabilities.join(" · ")}\n`)

  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    kind: (definition.kind as any) || inferWorkerKind(definition.task),
    task: definition.task,
    capabilities: definition.capabilities,
    priority: definition.priority,
    budget: definition.budget,
    limits: definition.limits,
    authority: issueWorkerAuthority(definition.capabilities, definition.budget),
  })

  const destroyAfter = flags.keep ? false : true
  const scenario = flags.timeout
    ? "ambiguous-timeout"
    : flags.diverge || flags.fail
      ? "reality-divergence"
      : "default"

  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter,
    scenario,
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : destroyAfter),
  })
  const stored = persistRun(store, mesh, run, worker, destroyAfter)
  printRun(stored)

  if (run.status !== "COMPLETED") process.exitCode = 1
}

async function cmdLive(store: ProjectStore, flags: Record<string, string | boolean>): Promise<void> {
  if (!store.exists()) store.init(path.basename(store.root))
  const mesh = createClient(flags)
  const capabilities = flagList(flags.capabilities, ["browser", "sandbox", "desktop"])
  console.log(`\nMESHLY LIVE  mode=${mesh.mode}`)
  console.log(`Probing Solari primitives: ${capabilities.join(" · ")}\n`)

  const worker = await mesh.spawn({
    name: "live-probe",
    task: "Prove Meshly can lease, act, observe, verify, and commit on real Solari infrastructure",
    capabilities,
    budget: 2,
    authority: issueWorkerAuthority(capabilities, 2),
  })

  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : true),
  })
  const stored = persistRun(store, mesh, run, worker, true)
  printRun(stored)
  if (run.status !== "COMPLETED") process.exitCode = 1
}

async function cmdFail(store: ProjectStore, flags: Record<string, string | boolean>): Promise<void> {
  if (!store.exists()) store.init(path.basename(store.root))
  const mesh = createClient(flags)
  let definition = store.getWorker("invoice-reconciler") || store.getWorker("reality-check")
  if (!definition) {
    definition = {
      id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
      name: "invoice-reconciler",
      kind: "reconciliation",
      task: "Reconcile today's payment records with the ERP",
      capabilities: ["browser", "sandbox", "desktop"],
      priority: 8,
      budget: 2,
      spent: 0,
      status: "CREATED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.saveWorker(definition)
  }

  console.log(`\nMESHLY  mode=${mesh.mode}  scenario=reality-divergence`)
  console.log(`Worker  ${definition.name}`)
  console.log(`Task    ${definition.task}\n`)
  console.log("Agent claim:        Invoice marked paid / ERP posted")
  console.log("Solari observation: HTTP 200, payment = PAID")
  console.log("Independent check:  ERP file on desktop")
  console.log("Expected decision:  COMMIT BLOCKED\n")

  const worker = await mesh.spawn({
    id: definition.id,
    name: definition.name,
    kind: "reconciliation",
    task: definition.task,
    capabilities: ["browser", "sandbox", "desktop"],
    priority: definition.priority,
    budget: definition.budget,
    authority: issueWorkerAuthority(["browser", "sandbox", "desktop"], definition.budget),
  })

  const run = await worker.run({
    artifactDir: store.artifactDir(),
    destroyAfter: true,
    scenario: "reality-divergence",
    onProgress: (instance) => persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : true),
  })
  const stored = persistRun(store, mesh, run, worker, true)
  printRun(stored)
  if (run.status !== "BLOCKED") process.exitCode = 1
}

async function cmdResume(store: ProjectStore, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  store.loadConfig()
  const id = rest[0]
  if (!id) {
    console.error("Usage: meshly resume <runId>")
    process.exitCode = 1
    return
  }
  const stored = store.getRun(id)
  if (!stored) {
    console.error(`Run '${id}' not found.`)
    process.exitCode = 1
    return
  }
  const mesh = createClient(flags)
  await mesh.restore(store)
  console.log(`\nMESHLY  mode=${mesh.mode}  resume=${stored.runId}`)
  const destroyAfter = flags.keep ? false : true
  const run = await mesh.resume(stored.runId, {
    artifactDir: store.artifactDir(),
    destroyAfter,
    onProgress: (instance) => {
      const worker = mesh.workers.get(instance.workerId)
      if (worker) persistRun(store, mesh, instance, worker, instance.status === "RUNNING" ? false : destroyAfter)
    },
  })
  const worker = mesh.workers.get(run.workerId)
  if (worker) printRun(persistRun(store, mesh, run, worker, destroyAfter))
  else printRun(store.getRun(run.runId)!)
  if (run.status !== "COMPLETED" && run.status !== "VERIFIED") process.exitCode = 1
}

async function cmdQuickstart(store: ProjectStore, flags: Record<string, string | boolean>): Promise<void> {
  flags.yes = true
  flags.provider = typeof flags.provider === "string" ? flags.provider : "simulator"
  await runInit(store, [], { ...flags, yes: true, provider: flags.provider })
  if (!store.getWorker("invoice-reconciler")) {
    await cmdWorkerCreate(store, [], { template: "reconciliation" })
  }
  await cmdRun(store, ["invoice-reconciler"], { ...flags, simulator: flags.provider === "simulator" || flags.simulator })
  console.log("Then open the console:\n  meshly dev\n")
}

async function cmdRuns(store: ProjectStore): Promise<void> {
  store.loadConfig()
  const runs = store.listRuns()
  if (runs.length === 0) {
    console.log("\nNo runs yet. `meshly run <worker>` or `meshly live`\n")
    return
  }
  console.log("\n  RUN ID                         STATUS      MODE        WORKER")
  console.log("  " + "-".repeat(78))
  for (const r of runs) {
    console.log(
      `  ${r.runId.padEnd(30)} ${r.status.padEnd(11)} ${r.mode.padEnd(11)} ${r.workerName || r.workerId}`,
    )
  }
  console.log("")
}

async function cmdInspect(store: ProjectStore, rest: string[]): Promise<void> {
  store.loadConfig()
  const id = rest[0]
  if (!id) {
    console.error("Usage: meshly inspect <runId>")
    process.exitCode = 1
    return
  }
  const run = store.getRun(id)
  if (!run) {
    console.error(`Run '${id}' not found.`)
    process.exitCode = 1
    return
  }
  printRun(run)
}

async function cmdReplay(store: ProjectStore, rest: string[]): Promise<void> {
  store.loadConfig()
  const id = rest[0]
  if (!id) {
    console.error("Usage: meshly replay <runId>")
    process.exitCode = 1
    return
  }
  const run = store.getRun(id)
  if (!run) {
    console.error(`Run '${id}' not found.`)
    process.exitCode = 1
    return
  }
  const links = [
    ...run.environments.map((e) => e.replayUrl || e.streamUrl).filter(Boolean),
    ...run.steps.flatMap((s) => [s.observation?.replayUrl, s.observation?.streamUrl, s.observation?.browser_replay_url]).filter(Boolean),
  ]
  if (links.length === 0) {
    console.log("\nNo replay or stream URL on this run. Live browser replays are issued after session release.\n")
    return
  }
  console.log("\nReplay / stream URLs")
  for (const link of Array.from(new Set(links))) console.log(`  ${link}`)
  console.log("")
}

async function cmdExport(store: ProjectStore, rest: string[]): Promise<void> {
  store.loadConfig()
  const id = rest[0]
  if (!id) {
    console.error("Usage: meshly export <runId>")
    process.exitCode = 1
    return
  }
  const run = store.getRun(id)
  if (!run) {
    console.error(`Run '${id}' not found.`)
    process.exitCode = 1
    return
  }
  const exportDir = path.resolve(store.root, "exports", run.runId)
  fs.mkdirSync(exportDir, { recursive: true })
  fs.writeFileSync(path.join(exportDir, "run.json"), JSON.stringify(run, null, 2))
  fs.writeFileSync(
    path.join(exportDir, "evidence.json"),
    JSON.stringify(run.evidence || {}, null, 2),
  )
  console.log(`\nExported ${run.runId} → ${exportDir}\n`)
}

function help(): void {
  console.log(`
Meshly — the operating system for autonomous workers.

  wsp manages where an agent works.
  Meshly manages how autonomous work executes safely.

Usage:
  meshly init [--provider solari|simulator] [--yes]
  meshly quickstart [--simulator]          First 10 minutes: init → worker → run
  meshly dev [--port 3400]
  meshly worker create --template reconciliation|research|coding|operations
  meshly worker create --name <name> --task "<task>" [--capabilities browser,sandbox,desktop]
  meshly workers
  meshly run <worker> [--simulator] [--keep] [--fail] [--timeout]
  meshly resume <run> [--simulator] [--keep]
  meshly runs
  meshly inspect <run>
  meshly replay <run>
  meshly export <run>
  meshly restart [--simulator]         Reconnect workers, runs, environments
  meshly mcp                           Meshly MCP server (stdio) for other agents
  meshly live [--simulator] [--capabilities browser,sandbox,desktop]
  meshly fail [--simulator]           Reality-divergence demo (commit BLOCKED)

Kernel / research (not the product loop):
  meshly simulate [count]            Scheduler simulation
  meshly benchmark [count]           1,000-worker scheduler simulation

Live Solari is the default. Pass --simulator to run the kernel without credits.
`)
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { command, rest, flags } = parseArgs(argv)
  const store = new ProjectStore()

  switch (command) {
    case "init":
      await runInit(store, rest, flags)
      break
    case "quickstart":
      await cmdQuickstart(store, flags)
      break
    case "dev": {
      const { startConsole } = await import("@meshly/console")
      const port = Number(flags.port || process.env.PORT || 3400)
      startConsole({ port, cwd: store.root })
      return
    }
    case "worker":
      if (rest[0] === "create") await cmdWorkerCreate(store, rest.slice(1), flags)
      else if (rest[0] === "get" && rest[1]) {
        const w = store.getWorker(rest[1])
        console.log(w ? JSON.stringify(w, null, 2) : `Worker '${rest[1]}' not found.`)
      } else {
        console.log("Usage: meshly worker create --name <name> --task \"<task>\"")
      }
      break
    case "workers":
      await cmdWorkers(store)
      break
    case "run":
      await cmdRun(store, rest, flags)
      break
    case "resume":
      await cmdResume(store, rest, flags)
      break
    case "runs":
      await cmdRuns(store)
      break
    case "inspect":
      await cmdInspect(store, rest)
      break
    case "replay":
      await cmdReplay(store, rest)
      break
    case "export":
      await cmdExport(store, rest)
      break
    case "restart": {
      const mesh = createClient(flags)
      const result = await mesh.restore(store)
      console.log(`\nMeshly restarted`)
      console.log(`  Workers      ${result.workers}`)
      console.log(`  Runs         ${result.runs}`)
      console.log(`  Reconnected  ${result.reconnected}`)
      console.log(`  Lost         ${result.lost}\n`)
      break
    }
    case "mcp": {
      const { startMeshlyMcpServer } = await import("@meshly/sdk")
      const mesh = flags.simulator ? new Meshly({ preferSimulator: true }) : createClient(flags)
      await startMeshlyMcpServer({ runtime: mesh.runtime, store })
      return
    }
    case "live":
      await cmdLive(store, flags)
      break
    case "fail":
      await cmdFail(store, flags)
      break
    case "simulate": {
      const mesh = new Meshly({ preferSimulator: true })
      const { runSimulation } = await import("./simulate.js")
      await runSimulation(mesh, parseInt(rest[0] || "100", 10))
      break
    }
    case "benchmark": {
      const mesh = new Meshly({ preferSimulator: true })
      await runBenchmark(mesh, parseInt(rest[0] || "1000", 10))
      break
    }
    case "help":
    default:
      help()
      if (command !== "help") process.exitCode = 1
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  const self = fileURLToPath(import.meta.url)
  try {
    return fs.realpathSync(entry).toLowerCase() === fs.realpathSync(self).toLowerCase()
  } catch {
    return path.normalize(path.resolve(entry)).toLowerCase() === path.normalize(self).toLowerCase()
  }
}

if (isDirectRun()) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
