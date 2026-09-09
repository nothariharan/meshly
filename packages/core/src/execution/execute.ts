/**
 * Product execution loop.
 *
 * One environment capability → one verified step:
 * Intent → authorize → lease → action → observe → verify → commit.
 *
 * Works against live Solari handles and the simulator.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { EnvironmentType, VerificationContract } from "../types.js"
import type { MeshlyRuntime } from "../runtime.js"
import type { RunInstance } from "../run/run.js"

const ENVIRONMENT_TYPES: EnvironmentType[] = ["browser", "sandbox", "desktop"]

export interface ExecuteWorkerOptions {
  artifactDir?: string
  destroyAfter?: boolean
  /**
   * `reality-divergence`: agent and tool report success, independent
   * world check is written to fail. Used for the operator demo.
   */
  scenario?: "default" | "reality-divergence"
  onProgress?: (run: RunInstance) => void
}

export async function executeWorker(
  runtime: MeshlyRuntime,
  workerId: string,
  options: ExecuteWorkerOptions = {},
): Promise<RunInstance> {
  const worker = runtime.workers.get(workerId)
  if (!worker) throw new Error(`Worker '${workerId}' not found`)

  const destroyAfter = options.destroyAfter ?? true
  const types = requestedEnvironmentTypes(worker.capabilities)
  runtime.scheduler.claim(worker.id)
  const run = runtime.runs.create(worker)
  worker.context.runId = run.runId
  worker.status = "RUNNING"
  worker.updatedAt = new Date()
  options.onProgress?.(run)

  const leases: string[] = []

  try {
    for (const type of types) {
      const tool = toolFor(type)
      const contract = contractFor(type, options.scenario)

      runtime.events.emit("intent.created", {
        workerId: worker.id,
        runId: run.runId,
        data: { intent: intentFor(type, worker.task), tool, type, scenario: options.scenario || "default" },
      })

      const authorized = runtime.authority.authorize(worker.id, worker.authority, {
        tool,
        capability: type,
      })

      const step = run.createStep({
        intent: intentFor(type, worker.task),
        action: { tool, args: { type, scenario: options.scenario || "default" }, description: `Execute on Solari ${type}` },
      })
      step.contract = {
        intent: contract.intent,
        preconditions: contract.preconditions,
        postconditions: contract.postconditions,
        onFailure: contract.onFailure,
      }
      options.onProgress?.(run)

      if (!authorized.allowed) {
        run.updateStepStatus(step.id, "rejected", { error: authorized.violation })
        runtime.events.emit("action.denied", {
          workerId: worker.id,
          runId: run.runId,
          data: { tool, reason: authorized.violation },
        })
        run.fail(authorized.violation)
        worker.status = "FAILED"
        options.onProgress?.(run)
        return run
      }

      runtime.events.emit("authority.approved", {
        workerId: worker.id,
        runId: run.runId,
        data: { tool, capability: type },
      })
      runtime.events.emit("action.authorized", {
        workerId: worker.id,
        runId: run.runId,
        data: { tool, capability: type },
      })
      run.updateStepStatus(step.id, "authorized")
      options.onProgress?.(run)

      const lease = await runtime.broker.acquire({
        workerId: worker.id,
        type,
        capabilities: [type],
        authority: worker.authority,
        budget: Math.max(0.01, worker.budget.maxSpend - worker.budget.spent),
      })
      leases.push(lease.leaseId)
      worker.environmentLease = lease
      run.recordEnvironment(lease.environmentId)

      const env = runtime.broker.inspect(lease.environmentId)
      runtime.events.emit(`solari.${type}.created` as "solari.browser.created", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: lease.environmentId,
        leaseId: lease.leaseId,
        data: { fabricId: env?.fabricId, provider: env?.handle ? "live-or-sim" : undefined },
      })

      const observation: Record<string, any> = {
        environmentId: lease.environmentId,
        fabricId: env?.fabricId,
        type,
        leaseId: lease.leaseId,
      }

      run.updateStepStatus(step.id, "executing")
      options.onProgress?.(run)

      const result = await runtime.verifyStep({
        workerId: worker.id,
        runId: run.runId,
        contract,
        executeAction: async () => {
          const action = await performAction(type, handleOrThrow(env?.handle, type), observation, options.artifactDir, run.runId)
          worker.deductSpend(costFor(type))
          runtime.events.emit("action.executed", {
            workerId: worker.id,
            runId: run.runId,
            environmentId: lease.environmentId,
            data: { tool, claimedSuccess: action.claimedSuccess, type },
          })
          return action
        },
        observeState: async () => {
          const world: Record<string, any> = {
            ...observation,
            replayUrl: env?.replayUrl,
            streamUrl: env?.streamUrl,
            browser_replay_url: env?.replayUrl,
            desktop_stream_url: env?.streamUrl,
          }
          runtime.events.emit("observation.captured", {
            workerId: worker.id,
            runId: run.runId,
            environmentId: lease.environmentId,
            data: { type, keys: Object.keys(world) },
          })
          runtime.events.emit("observation.recorded", {
            workerId: worker.id,
            runId: run.runId,
            environmentId: lease.environmentId,
            data: { type, title: world.title, stdout: world.stdout, ready: world.ready },
          })
          return world
        },
      })

      if (!result.state.worldStateMatched) {
        run.updateStepStatus(step.id, "rejected", {
          observation,
          agentClaim: result.state.agentClaim,
          toolExecution: result.state.toolExecution,
          worldStateMatched: false,
          error: result.state.error,
          evidence: result.evidence,
        })
        run.block(result.state.error || `Verification failed on ${type}`)
        worker.status = "WAITING"
        worker.verificationState = result.state
        options.onProgress?.(run)
        return run
      }

      runtime.events.emit("commit.committed", {
        workerId: worker.id,
        runId: run.runId,
        environmentId: lease.environmentId,
        data: { type },
      })
      run.updateStepStatus(step.id, "committed", {
        observation,
        agentClaim: result.state.agentClaim,
        toolExecution: result.state.toolExecution,
        worldStateMatched: true,
        evidence: result.evidence,
      })
      worker.verificationState = result.state
      if (result.evidence) run.evidence = result.evidence
      options.onProgress?.(run)
    }

    runtime.complete(worker.id)
    worker.status = "COMPLETED"
    run.complete(run.evidence)
    options.onProgress?.(run)
    return run
  } catch (err: any) {
    const message = err?.message || String(err)
    runtime.fail(worker.id, message)
    worker.status = "FAILED"
    run.fail(message)
    options.onProgress?.(run)
    return run
  } finally {
    if (destroyAfter) {
      for (const leaseId of leases) {
        const lease = runtime.broker.getLease(leaseId)
        if (lease) {
          await runtime.broker.release(leaseId)
          await runtime.broker.destroy(lease.environmentId)
        }
      }
    } else {
      for (const leaseId of leases) {
        await runtime.broker.release(leaseId)
      }
    }
    options.onProgress?.(run)
  }
}

function handleOrThrow(handle: any, type: EnvironmentType): any {
  if (!handle) throw new Error(`No live handle for ${type}`)
  return handle
}

function requestedEnvironmentTypes(capabilities: string[]): EnvironmentType[] {
  const found = ENVIRONMENT_TYPES.filter((type) => capabilities.includes(type))
  return found.length > 0 ? found : ["browser"]
}

function toolFor(type: EnvironmentType): string {
  if (type === "browser") return "browser_navigate"
  if (type === "sandbox") return "sandbox_exec"
  return "desktop_screenshot"
}

function costFor(type: EnvironmentType): number {
  if (type === "browser") return 0.05
  if (type === "sandbox") return 0.02
  return 0.08
}

function intentFor(type: EnvironmentType, task: string): string {
  if (type === "browser") return `Open a live browser session and observe a page for: ${task}`
  if (type === "sandbox") return `Run an isolated command in a sandbox for: ${task}`
  return `Capture desktop GUI state for: ${task}`
}

export function contractFor(type: EnvironmentType, scenario: ExecuteWorkerOptions["scenario"] = "default"): VerificationContract {
  if (scenario === "reality-divergence" && type === "browser") {
    return {
      intent: "Independent world check: page title must contain paid invoice 4421",
      preconditions: [],
      postconditions: [
        { target: "browser", type: "text_contains", query: "title", expected: "Invoice 4421 paid" },
      ],
      onFailure: "human",
    }
  }
  if (type === "browser") {
    return {
      intent: "Browser loaded a real page with a title",
      preconditions: [],
      postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Example" }],
    }
  }
  if (type === "sandbox") {
    return {
      intent: "Sandbox command exited 0 and printed 4",
      preconditions: [],
      postconditions: [
        { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
        { target: "sandbox", type: "text_contains", query: "stdout", expected: "4" },
      ],
    }
  }
  return {
    intent: "Desktop display is ready",
    preconditions: [],
    postconditions: [{ target: "desktop", type: "status_equals", query: "ready", expected: true }],
  }
}

async function performAction(
  type: EnvironmentType,
  handle: any,
  observation: Record<string, any>,
  artifactDir: string | undefined,
  runId: string,
): Promise<{ claimedSuccess: boolean; [key: string]: any }> {
  if (type === "browser") {
    const page = await handle.newPage()
    await page.goto("https://example.com")
    const title = await page.title()
    const url = typeof page.url === "function" ? page.url() : "https://example.com/"
    observation.title = title
    observation.url = url
    observation.sessionId = handle.id
    observation.httpStatus = 200
    if (page.screenshot) {
      const png = await page.screenshot()
      observation.screenshotPath = writeArtifact(artifactDir, runId, "browser.png", png)
    }
    return { claimedSuccess: true, title, url, httpStatus: 200 }
  }

  if (type === "sandbox") {
    if (handle.connect) await handle.connect()
    const out = await handle.commands.run("python3", {
      args: ["-c", "print(2+2)"],
    })
    observation.exitCode = out.exitCode
    observation.stdout = String(out.stdout || "").trim()
    observation.stderr = String(out.stderr || "").trim()
    observation.sandboxId = handle.sandboxId || handle.id
    return { claimedSuccess: out.exitCode === 0, ...out }
  }

  if (handle.connect) await handle.connect()
  if (handle.health) {
    for (let i = 0; i < 30; i++) {
      const health = await handle.health()
      observation.ready = Boolean(health?.ready)
      observation.health = health
      if (health?.ready) break
      await sleep(1000)
    }
  } else {
    observation.ready = true
  }
  observation.sessionId = handle.sessionId || handle.id
  observation.streamUrl = handle.streamUrl
  if (handle.screenshot) {
    const png = await handle.screenshot({ format: "png" })
    observation.screenshotPath = writeArtifact(artifactDir, runId, "desktop.png", png)
  }
  return { claimedSuccess: observation.ready === true, ready: observation.ready }
}

function writeArtifact(
  artifactDir: string | undefined,
  runId: string,
  filename: string,
  data: Buffer | Uint8Array | string,
): string | undefined {
  if (!artifactDir) return undefined
  const dir = path.join(artifactDir, runId)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, filename)
  writeFileSync(file, data)
  return file
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
