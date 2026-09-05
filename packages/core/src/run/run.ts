/**
 * @meshly/core - First-Class Run Primitive
 * Represents one complete attempt to accomplish a task across environments.
 */
import { createHash } from "crypto"
import {
  Run,
  RunStatus,
  ExecutionStep,
  ExecutionStepStatus,
  CheckpointRef,
  ArtifactRecord,
  EvidenceBundle,
} from "../types.js"
import { EventStore } from "../events/events.js"
import { WorkerInstance } from "../worker/worker.js"

export class RunInstance implements Run {
  public readonly runId: string
  public readonly workerId: string
  public readonly objective: string
  public status: RunStatus = "RUNNING"
  public readonly startedAt: number
  public completedAt?: number
  public environments: string[] = []
  public steps: ExecutionStep[] = []
  public checkpoints: CheckpointRef[] = []
  public events: string[] = []
  public artifacts: ArtifactRecord[] = []
  public evidence?: EvidenceBundle
  public error?: string

  private eventStore: EventStore
  private worker: WorkerInstance

  constructor(worker: WorkerInstance, eventStore: EventStore, runId?: string) {
    this.runId = runId || `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    this.workerId = worker.id
    this.objective = worker.task
    this.startedAt = Date.now()
    this.worker = worker
    this.eventStore = eventStore

    this.eventStore.emit("run.started", {
      runId: this.runId,
      workerId: this.workerId,
      data: { objective: this.objective, priority: worker.priority },
    })
  }

  recordEnvironment(envId: string): void {
    if (!this.environments.includes(envId)) {
      this.environments.push(envId)
    }
  }

  createStep(params: { intent: string; action: { tool: string; args: any; description?: string } }): ExecutionStep {
    const step: ExecutionStep = {
      id: `step_${this.steps.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
      runId: this.runId,
      workerId: this.workerId,
      stepIndex: this.steps.length + 1,
      intent: params.intent,
      action: params.action,
      status: "planned",
      timestamp: Date.now(),
    }
    this.steps.push(step)
    return step
  }

  updateStepStatus(stepId: string, status: ExecutionStepStatus, updates?: Partial<ExecutionStep>): void {
    const step = this.steps.find((s) => s.id === stepId)
    if (step) {
      step.status = status
      if (updates) Object.assign(step, updates)
    }
  }

  recordCheckpoint(cp: CheckpointRef): void {
    this.checkpoints.push(cp)
  }

  recordArtifact(art: ArtifactRecord): void {
    this.artifacts.push(art)
  }

  async pause(): Promise<void> {
    this.status = "PAUSED"
    await this.worker.pause()
    this.eventStore.emit("run.paused", {
      runId: this.runId,
      workerId: this.workerId,
      data: { stepIndex: this.steps.length },
    })
  }

  async resume(): Promise<void> {
    this.status = "RUNNING"
    await this.worker.resume()
    this.eventStore.emit("run.resumed", {
      runId: this.runId,
      workerId: this.workerId,
      data: { stepIndex: this.steps.length },
    })
  }

  async cancel(reason?: string): Promise<void> {
    this.status = "CANCELLED"
    this.completedAt = Date.now()
    this.error = reason
    await this.worker.cancel(reason)
    this.eventStore.emit("run.cancelled", {
      runId: this.runId,
      workerId: this.workerId,
      data: { reason },
    })
  }

  complete(evidence?: EvidenceBundle): void {
    this.status = "COMPLETED"
    this.completedAt = Date.now()
    if (evidence) this.evidence = evidence
    this.eventStore.emit("run.completed", {
      runId: this.runId,
      workerId: this.workerId,
      data: {
        durationMs: this.completedAt - this.startedAt,
        totalSteps: this.steps.length,
        verifiedDigest: evidence?.tamperEvidentDigestSha256,
      },
    })
  }

  fail(error?: string): void {
    this.status = "FAILED"
    this.completedAt = Date.now()
    this.error = error
    this.eventStore.emit("run.failed", {
      runId: this.runId,
      workerId: this.workerId,
      data: { error },
    })
  }

  /**
   * Export Tamper-Evident Evidence Bundle
   */
  exportBundle(): {
    run: Run
    events: any[]
    stateDiff: Record<string, any>
    evidence?: EvidenceBundle
    authority: any
    sha256Digest: string
  } {
    const runEvents = this.eventStore.query({ runId: this.runId })
    const stateDiff = {
      initialObservations: this.steps[0]?.observation || {},
      finalObservations: this.steps[this.steps.length - 1]?.observation || {},
    }

    const payload = JSON.stringify({
      runId: this.runId,
      workerId: this.workerId,
      objective: this.objective,
      status: this.status,
      steps: this.steps,
      stateDiff,
    })

    const sha256Digest = createHash("sha256").update(payload).digest("hex")

    return {
      run: {
        runId: this.runId,
        workerId: this.workerId,
        objective: this.objective,
        status: this.status,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        environments: this.environments,
        steps: this.steps,
        checkpoints: this.checkpoints,
        events: runEvents.map((e) => e.id),
        artifacts: this.artifacts,
        evidence: this.evidence,
        error: this.error,
      },
      events: runEvents,
      stateDiff,
      evidence: this.evidence,
      authority: this.worker.authority,
      sha256Digest,
    }
  }
}

export class RunManager {
  private runs: Map<string, RunInstance> = new Map()
  private eventStore: EventStore

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore
  }

  create(worker: WorkerInstance, runId?: string): RunInstance {
    const run = new RunInstance(worker, this.eventStore, runId)
    this.runs.set(run.runId, run)
    return run
  }

  get(runId: string): RunInstance | undefined {
    return this.runs.get(runId)
  }

  list(): RunInstance[] {
    return Array.from(this.runs.values())
  }

  getByWorker(workerId: string): RunInstance[] {
    return Array.from(this.runs.values()).filter((r) => r.workerId === workerId)
  }

  exportBundle(runId: string) {
    const run = this.runs.get(runId)
    if (!run) throw new Error(`Run '${runId}' not found`)
    return run.exportBundle()
  }
}
