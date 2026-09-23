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
import { Meshly, AuthorityManager, inferWorkerKind, explainDecision, formatDecision, policyNameFor, formatUserError, MeshlyError } from "@meshly/sdk"
import type { RunInstance, WorkerInstance } from "@meshly/core"
import { runBenchmark } from "./benchmark.js"
import { loadEnv, requireSolariKey } from "./env.js"
import { cliUsesSimulator, mcpUsesSimulator } from "./mode.js"
import { ProjectStore, type StoredRun, type StoredWorker } from "./store.js"
import { runInit } from "./init.js"
import { runDoctor, cliVersion } from "./doctor.js"
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

function createClient(
  flags: Record<string, string | boolean>,
  store?: ProjectStore,
  surface: "cli" | "mcp" = "cli",
): Meshly {
  const simulator = surface === "mcp" ? mcpUsesSimulator(flags) : cliUsesSimulator(flags, store)
  if (simulator) return new Meshly({ preferSimulator: true })
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

/** Rough live-session estimate per trial, by scenario (both arms). */
const LIVE_SESSIONS_PER_TRIAL: Record<string, number> = {
  success: 6,
  reality_divergence: 6,
  ambiguous_timeout: 2,
  authority_violation: 4,
  runaway_retry: 2,
}

function estimateLiveSessions(scenarios: string[], trials: number): number {
  return scenarios.reduce((total, id) => total + (LIVE_SESSIONS_PER_TRIAL[id] ?? 4), 0) * trials
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
  if (run.error && run.status !== "VERIFIED" && run.status !== "BLOCKED" && run.status !== "UNKNOWN") {
    console.log(`  Error       ${run.error}`)
  }
  console.log("")
  for (const step of run.steps) {
    const env = String(step.action?.tool || "").split("_")[0]?.toUpperCase() || "STEP"
    console.log(`  ${env.padEnd(10)} ${String(step.status).toUpperCase()}`)
    if (step.observation?.payment_status) console.log(`     Payment    ${step.observation.payment_status}`)
    if (step.observation?.ledger) console.log(`     Ledger     ${step.observation.ledger}`)
    if (step.observation?.erp_status) console.log(`     ERP        ${step.observation.erp_status}`)
    if (step.observation?.title) console.log(`     Title      ${step.observation.title}`)
    if (step.observation?.stdout) console.log(`     stdout     ${step.observation.stdout}`)
    const hideError =
      step.status === "unknown" ||
      run.status === "VERIFIED" ||
      run.status === "UNKNOWN" ||
      run.status === "VERIFYING"
    if (step.error && !hideError) console.log(`     Error      ${step.error}`)
    console.log("")
  }
  printSignature(run)
  if (run.sha256Digest) console.log(`  Digest     ${run.sha256Digest}`)
  console.log("")
}

function printSignature(run: StoredRun): void {
  const events = run.events || []
  const unknown = run.status === "UNKNOWN" || run.status === "VERIFYING" || run.status === "VERIFIED" ||
    events.some((e) => e.type === "action.unknown" || e.type === "run.unknown")
  const last = [...(run.steps || [])].reverse()[0]
  const world = last?.observation?.erp_status || last?.observation?.payment_status

  if (unknown && (run.status === "VERIFIED" || run.status === "UNKNOWN" || run.status === "VERIFYING")) {
    const confirmed = run.status === "VERIFIED"
    console.log("  ⚠ UNKNOWN")
    console.log("    Side effect may have occurred.")
    console.log("    Retry blocked.")
    console.log("")
    console.log("  Independent verification")
    if (confirmed) {
      console.log(`    World state confirmed${world ? ` (${world})` : ""}`)
      console.log("")
      console.log("  VERIFIED")
    } else {
      console.log(`    World state absent${last?.error ? ` — ${last.error}` : ""}`)
      console.log("")
      console.log("  UNKNOWN")
    }
    console.log("")
  } else if (run.status === "BLOCKED") {
    console.log(`  Agent claim     ${last?.agentClaim || "SUCCESS"}`)
    console.log(`  Tool execution  ${last?.toolExecution || "SUCCESS"}`)
    console.log("  World state     MISMATCH")
    console.log("")
    console.log("  COMMIT BLOCKED")
    if (run.error) console.log(`    ${run.error}`)
    console.log("")
  }

  const explanation = explainDecision(run, {
    policy: policyNameFor(run.kind),
    authority: run.workerId,
  })
  const alreadyHeadlined = run.status === "BLOCKED" || run.status === "UNKNOWN" || run.status === "VERIFYING" || run.status === "VERIFIED"
  for (const line of formatDecision(explanation, { headline: !alreadyHeadlined }).split("\n")) {
    console.log(line ? `  ${line}` : "")
  }
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
  const created = createWorkerFromEverything(store, name, task, {
    capabilities: flagList(flags.capabilities, template?.capabilities || ["browser", "sandbox", "desktop"]),
    kind: String(flags.kind || template?.kind || inferWorkerKind(task) || "probe"),
    priority: Number(flags.priority || 8),
    budget: Number(flags.budget || 2),
  })
  if (!created) {
    console.error(`Worker '${name}' already exists.`)
    process.exitCode = 1
    return
  }
  console.log(`\nCreated worker ${created.name}`)
  console.log(`  ID            ${created.id}`)
  console.log(`  Kind          ${created.kind}`)
  console.log(`  Task          ${created.task}`)
  console.log(`  Environments  ${created.capabilities.join(" · ")}`)
  console.log(`\nRun it:\n  meshly run ${created.name}\n`)
}

function createWorkerFromEverything(
  store: ProjectStore,
  name: string,
  task: string,
  opts: { capabilities: string[]; kind: string; priority?: number; budget?: number },
): StoredWorker | undefined {
  if (store.getWorker(name)) return undefined
  const budget = opts.budget ?? 2
  const worker = {
    id: `wrk_${Math.random().toString(36).slice(2, 9)}`,
    name,
    kind: opts.kind,
    task,
    capabilities: opts.capabilities,
    priority: opts.priority ?? 8,
    budget,
    spent: 0,
    limits: {
      maxSpend: budget,
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
  store.savePolicy(worker.id, issueWorkerAuthority(opts.capabilities, budget))
  return worker
}

/**
 * Seed the demo project through the real store. No fake runs — the console
 * reads exactly what the runtime would persist.
 */
async function cmdDemoSeed(store: ProjectStore): Promise<void> {
  if (!store.exists()) store.init(path.basename(store.root), process.env.SOLARI_API_KEY ? "solari" : "simulator")
  store.loadConfig()
  const order: Array<keyof typeof TEMPLATES> = ["reconciliation", "research", "coding", "operations"]
  const created: string[] = []
  for (const key of order) {
    const t = TEMPLATES[key]
    const worker = createWorkerFromEverything(store, t.name, t.task, {
      capabilities: t.capabilities,
      kind: t.kind,
    })
    created.push(worker ? `+ ${worker.name}` : `· ${t.name} (exists)`)
  }
  console.log("\nMeshly demo project\n")
  for (const line of created) console.log(`  ${line}`)
  console.log("\nOpen the console:\n  meshly dev          → http://localhost:3400")
  console.log("Run the flagship worker:\n  meshly run invoice-reconciler\n")
}

async function cmdWorkers(store: ProjectStore): Promise<void> {
  requireProject(store)
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

async function cmdVerify(store: ProjectStore, rest: string[]): Promise<void> {
  requireProject(store)
  const id = rest[0]
  if (!id) {
    console.error("Usage: meshly verify <runId>")
    process.exitCode = 1
    return
  }
  const stored = store.getRun(id)
  if (!stored) {
    console.error(formatUserError(new MeshlyError({
      code: "RUN_NOT_FOUND",
      title: `Run '${id}' was not found.`,
      reason: "Meshly only verifies recorded runs. It does not invent a result.",
      retry: "meshly runs",
    })))
    process.exitCode = 1
    return
  }
  const mesh = createClient({}, store)
  await mesh.restore(store)
  const run = mesh.runtime.runs.get(stored.runId)
  if (!run) {
    const explanation = explainDecision(stored, { policy: policyNameFor(stored.kind), authority: stored.workerId })
    console.log(`\n${formatDecision(explanation)}\n`)
    console.log("UNKNOWN does not mean FAILED. Meshly did not retry the side effect.\n")
    return
  }
  const result = await run.verify()
  console.log(`\nVERIFY ${run.runId}`)
  console.log(`  Status      ${run.status}`)
  console.log(`  Matched     ${result.matched}`)
  if (result.error) console.log(`  Error       ${result.error}`)
  console.log("")
  console.log(formatDecision(run.explain({ policy: policyNameFor(run.kind), authority: run.workerId })))
  console.log("")
  console.log("UNKNOWN does not mean FAILED. Verification does not retry the side effect.\n")
  if (!result.matched) process.exitCode = 1
}

function requireProject(store: ProjectStore): void {
  if (store.exists()) return
  throw new MeshlyError({
    code: "NO_PROJECT",
    title: "No Meshly project in this directory.",
    reason: "Meshly has not been initialized here.",
    action: "Nothing was started.",
    retry: "meshly init --api-key <your Solari key>",
  })
}

async function cmdRun(store: ProjectStore, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  requireProject(store)
  store.loadConfig()
  const workers = store.listWorkers()
  const target = rest[0] || (workers.length === 1 ? workers[0].name : "invoice-reconciler")
  const definition = store.getWorker(target)
  if (!definition) {
    console.error(rest[0] ? `Worker '${target}' not found.` : "Usage: meshly run [worker-name-or-id]")
    process.exitCode = 1
    return
  }

  const mesh = createClient(flags, store)
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
    ? flags.absent
      ? "ambiguous-timeout-absent"
      : "ambiguous-timeout"
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

  if (run.status !== "COMPLETED" && run.status !== "VERIFIED") process.exitCode = 1
}

async function cmdLive(store: ProjectStore, flags: Record<string, string | boolean>): Promise<void> {
  if (!store.exists()) store.init(path.basename(store.root))
  const mesh = createClient(flags, store)
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
  const mesh = createClient(flags, store)
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
  const mesh = createClient(flags, store)
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
  if (typeof flags.provider !== "string") {
    flags.provider = flags.simulator ? "simulator" : "solari"
  }
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

  npm install -g meshly
  meshly init
  meshly doctor
  meshly run
  meshly dev

Usage:
  meshly init [--api-key <key>] [--provider solari|simulator] [--yes]
  meshly doctor [--simulator] [--skip-probe]
  meshly worker create --template reconciliation|research|coding|operations
  meshly worker create --name <name> --task "<task>" [--capabilities browser,sandbox,desktop]
  meshly workers
  meshly run [worker] [--keep] [--timeout]
  meshly demo seed                     Create the demo project (real workers, no fake runs)
  meshly fail                          World mismatch → COMMIT BLOCKED
  meshly demo unknown                  Timeout → UNKNOWN → independent verify → VERIFIED
  meshly demo retry                    Timeout → UNKNOWN → world absent → SAFE TO RETRY
  meshly demo blocked                  Same as meshly fail
  meshly resume <run>
  meshly verify <run>                  Re-check world state. Does not retry.
  meshly runs
  meshly inspect <run>
  meshly replay <run>
  meshly export <run>
  meshly restart                       Reconnect workers, runs, environments
  meshly dev [--port 3400]
  meshly mcp [--simulator]             MCP server. Simulator only with --simulator.
  meshly benchmark --suite execution   Direct agent vs Meshly-governed execution
                                       [--trials 100] [--seed 20260915] [--out <dir>]
                                       [--scenarios reality_divergence,ambiguous_timeout]
                                       [--live --yes] [--max-sessions 30]
  meshly benchmark --suite scheduler   Scheduler stress simulation [--workers 1000]

Live Solari is the default. Pass --simulator only for a local kernel demo.
`)
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { command, rest, flags } = parseArgs(argv)
  if (flags.version || flags.v || command === "version" || command === "--version" || command === "-v") {
    console.log(cliVersion())
    return
  }
  const store = new ProjectStore()

  switch (command) {
    case "init":
      await runInit(store, rest, flags)
      break
    case "doctor":
      await runDoctor(store, flags)
      break
    case "demo":
      if (rest[0] === "seed") {
        await cmdDemoSeed(store)
      } else if (rest[0] === "unknown" || rest[0] === "timeout") {
        await cmdRun(store, rest.slice(1), { ...flags, timeout: true })
      } else if (rest[0] === "retry") {
        await cmdRun(store, rest.slice(1), { ...flags, timeout: true, absent: true })
      } else if (rest[0] === "blocked" || rest[0] === "fail") {
        await cmdFail(store, flags)
      } else {
        console.error("Usage: meshly demo seed|unknown|retry|blocked")
        process.exitCode = 1
      }
      break
    case "quickstart":
      await cmdQuickstart(store, flags)
      break
    case "dev": {
      const port = Number(flags.port || process.env.PORT || 3400)
      const { startConsole } = await import("@meshly/console")
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
    case "verify":
      await cmdVerify(store, rest)
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
      const mesh = createClient(flags, store)
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
      const mesh = createClient(flags, store, "mcp")
      const note = mesh.mode === "simulator" ? " (--simulator). This is not live Solari." : ""
      process.stderr.write(`meshly mcp mode=${mesh.mode}${note}\n`)
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
      const suite = String(flags.suite || rest[0] || "execution").toLowerCase()
      const schedulerSuite = suite === "scheduler" || suite === "sim" || /^\d+$/.test(suite)
      if (schedulerSuite) {
        const mesh = new Meshly({ preferSimulator: true })
        const workers = /^\d+$/.test(suite) ? Number(suite) : parseInt(String(flags.workers || "1000"), 10)
        await runBenchmark(mesh, workers)
        break
      }

      const { runExecutionBenchmarkSuite, BenchmarkFabric, LIVE_SAFE_SCENARIOS } = await import("@meshly/benchmark")
      const live = Boolean(flags.live) || String(flags.source || "").toLowerCase() === "solari"
      const outDir = typeof flags.out === "string" ? path.resolve(flags.out) : path.join(store.root, ".meshly", "benchmarks")

      let scenarios =
        typeof flags.scenarios === "string"
          ? (flags.scenarios.split(",").map((s) => s.trim()).filter(Boolean) as any)
          : undefined
      const concurrencyLevels =
        typeof flags.levels === "string"
          ? flags.levels.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
          : undefined

      if (!live) {
        const trials = Number(flags.trials || 100)
        const seed = Number(flags.seed || 20260915)
        const outcome = await runExecutionBenchmarkSuite(
          { trials, seed, scenarios, concurrencyLevels, outputDir: outDir },
          (id, index, total) => process.stdout.write(`\r  [${index}/${total}] ${id}…`),
        )
        process.stdout.write(`\r${" ".repeat(64)}\r`)
        console.log(outcome.terminal)
        console.log(`  JSON      ${outcome.written.json}`)
        console.log(`  CSV       ${outcome.written.csv}`)
        console.log(`  Markdown  ${outcome.written.markdown}`)
        console.log("")
        break
      }

      // ---- live Solari ----
      const apiKey = requireSolariKey()
      const { SolariExecutionFabric } = await import("@meshly/sdk")
      const liveDefaults: any[] = ["reality_divergence", "ambiguous_timeout", "authority_violation"]
      scenarios = (scenarios && scenarios.length ? scenarios : liveDefaults).filter((id: string) =>
        (LIVE_SAFE_SCENARIOS as string[]).includes(id),
      )
      if (!scenarios.length) {
        console.error(`\nNo live-safe scenarios selected. Choose from: ${LIVE_SAFE_SCENARIOS.join(", ")}\n`)
        process.exitCode = 1
        break
      }
      const trials = Number(flags.trials || 1)
      const seed = Number(flags.seed || 20260915)
      const maxSessions = Number(flags["max-sessions"] || 30)
      const estimate = estimateLiveSessions(scenarios, trials)

      console.log("\nMESHLY EXECUTION BENCHMARK — LIVE SOLARI")
      console.log("  This provisions real cloud browsers, sandboxes, and desktops.")
      console.log("  Both arms run the same task against the same real infrastructure.")
      console.log("  Environment loss and contention are simulator-only by default.\n")
      console.log(`  Scenarios    ${scenarios.join(", ")}`)
      console.log(`  Trials       ${trials} per scenario (${trials * 2} runs)`)
      console.log(`  Est. sessions ~${estimate}`)
      console.log(`  Hard cap     ${maxSessions} sessions`)
      console.log(`  Plan check   if trial 1 looks wrong, this is the moment to stop.\n`)

      if (!flags.yes && !Boolean(flags["dry-run"])) {
        console.log("  Nothing was started. Add --yes to spend Solari credit:\n")
        console.log(`    meshly benchmark --suite execution --live --yes\n`)
        break
      }
      if (Boolean(flags["dry-run"])) {
        console.log("  Dry run. Nothing was started.\n")
        break
      }

      const outcome = await runExecutionBenchmarkSuite(
        {
          trials,
          seed,
          scenarios,
          outputDir: outDir,
          source: "solari",
          maxSessions,
          armSettleMs: Number(flags.settle || 5000),
          createFabric: () =>
            new BenchmarkFabric(new SolariExecutionFabric({ apiKey, fallbackToSimulator: false }), "solari"),
        },
        (id, index, total) => process.stdout.write(`\r  [${index}/${total}] ${id}…`),
      )
      process.stdout.write(`\r${" ".repeat(64)}\r`)
      console.log(outcome.terminal)
      console.log(`  Sessions provisioned  ${outcome.report.sessionsCreated}`)
      console.log(`  JSON      ${outcome.written.json}`)
      console.log(`  CSV       ${outcome.written.csv}`)
      console.log(`  Markdown  ${outcome.written.markdown}`)
      console.log("")
      // Live SDK clients can keep the event loop alive. The report is already
      // written synchronously above, so exit deliberately.
      process.exit(process.exitCode ?? 0)
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
  runCli(process.argv.slice(2))
    .then(() => {
      const cmd = process.argv[2]
      if (cmd !== "dev" && cmd !== "mcp") {
        process.exit(process.exitCode ?? 0)
      }
    })
    .catch((err) => {
      console.error(formatUserError(err))
      process.exit(1)
    })
}
