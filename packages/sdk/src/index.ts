/**
 * @meshly/sdk — developer surface for the autonomous worker OS.
 *
 * const mesh = new Meshly({ execution: new Solari({ apiKey }) })
 * const worker = await mesh.spawn({ task, capabilities })
 * const run = await worker.run()
 */
import {
  MeshlyRuntime,
  MeshlyConfig,
  ExecutionFabric,
  SimulatorExecutionFabric,
  Capability,
  Authority,
  WorkerInstance,
  EnvironmentLease,
  VerificationContract,
  VerificationState,
  EvidenceBundle,
  SagaTransaction,
  WorkflowDef,
  RunInstance,
  AgentAdapter,
} from "@meshly/core"
import { SolariExecutionFabric } from "@meshly/solari"

export interface MeshlyClientOptions extends MeshlyConfig {
  execution?: ExecutionFabric
  solariApiKey?: string
  preferSimulator?: boolean
  /** When live Solari fails, fall back to the simulator. Default false. */
  fallbackToSimulator?: boolean
}

export class Meshly {
  public readonly runtime: MeshlyRuntime
  public readonly mode: "live" | "simulator"

  constructor(options: MeshlyClientOptions = {}) {
    let fabric: ExecutionFabric
    let mode: "live" | "simulator" = "simulator"

    if (options.execution) {
      fabric = options.execution
      mode = fabric.name.includes("simulator") ? "simulator" : "live"
    } else if (options.executionFabric) {
      fabric = options.executionFabric
      mode = fabric.name.includes("simulator") ? "simulator" : "live"
    } else if (options.preferSimulator) {
      fabric = new SimulatorExecutionFabric()
    } else {
      const apiKey = options.solariApiKey || process.env.SOLARI_API_KEY
      if (!apiKey) {
        fabric = new SimulatorExecutionFabric()
      } else {
        fabric = new SolariExecutionFabric({
          apiKey,
          fallbackToSimulator: options.fallbackToSimulator ?? false,
        })
        mode = "live"
      }
    }

    this.mode = mode
    this.runtime = new MeshlyRuntime({
      ...options,
      executionFabric: fabric,
    })
  }

  get events() {
    return this.runtime.events
  }

  get broker() {
    return this.runtime.broker
  }

  get scheduler() {
    return this.runtime.scheduler
  }

  get workers() {
    return this.runtime.workers
  }

  get runs() {
    return this.runtime.runs
  }

  get authority() {
    return this.runtime.authority
  }

  get contexts() {
    return this.runtime.contexts
  }

  get memory() {
    return this.runtime.memory
  }

  get checkpoints() {
    return this.runtime.checkpoints
  }

  get operator() {
    return this.runtime.operator
  }

  get failures() {
    return this.runtime.failures
  }

  get workflow() {
    return this.runtime.workflow
  }

  async run(params: {
    task: string
    capabilities: Capability[]
    name?: string
    priority?: number
    budget?: number
    authority?: Authority
    workflow?: WorkflowDef
    metadata?: Record<string, any>
  }): Promise<RunInstance> {
    if (params.workflow) {
      return this.runtime.run(params)
    }
    const worker = await this.spawn({
      task: params.task,
      capabilities: params.capabilities,
      name: params.name,
      priority: params.priority,
      budget: params.budget,
      authority: params.authority,
      metadata: params.metadata,
    })
    return worker.run()
  }

  async runWithAgent(params: {
    adapter: AgentAdapter
    task: string
    capabilities: Capability[]
    priority?: number
    budget?: number
    authority?: Authority
    maxSteps?: number
    verifyContract?: VerificationContract
  }): Promise<RunInstance> {
    return this.runtime.runWithAgent(params)
  }

  async spawn(params: {
    task: string
    capabilities: Capability[]
    name?: string
    id?: string
    kind?: import("@meshly/core").WorkerKind
    priority?: number
    deadline?: Date
    budget?: number
    authority?: Authority
    parentId?: string
    metadata?: Record<string, any>
    initialMemory?: Array<{ key: string; value: any; tier?: "hot" | "warm" | "cold" }>
    limits?: Partial<import("@meshly/core").WorkerLimits>
  }): Promise<WorkerInstance> {
    return this.runtime.spawn(params)
  }

  async execute(
    workerId: string,
    options?: {
      artifactDir?: string
      destroyAfter?: boolean
      scenario?: "default" | "reality-divergence" | "ambiguous-timeout"
      kind?: string
      signal?: AbortSignal
      onProgress?: (run: RunInstance) => void
    },
  ): Promise<RunInstance> {
    return this.runtime.executeWorker(workerId, options)
  }

  async resume(runId: string, options?: {
    artifactDir?: string
    destroyAfter?: boolean
    scenario?: "default" | "reality-divergence" | "ambiguous-timeout"
    kind?: string
    signal?: AbortSignal
    onProgress?: (run: RunInstance) => void
  }): Promise<RunInstance> {
    return this.runtime.resumeRun(runId, options)
  }

  async scheduleNext(): Promise<{ worker?: WorkerInstance; lease?: EnvironmentLease; score?: number }> {
    return this.runtime.scheduleNext()
  }

  async verifyStep(params: {
    workerId: string
    runId?: string
    contract: VerificationContract
    executeAction: () => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
    observeState: () => Promise<Record<string, any>>
  }): Promise<{ state: VerificationState; evidence?: EvidenceBundle }> {
    return this.runtime.verifyStep(params)
  }

  async handoff(fromWorkerId: string, newTask: string): Promise<WorkerInstance> {
    return this.runtime.handoff(fromWorkerId, newTask)
  }

  transaction(workerId: string): SagaTransaction {
    return this.runtime.transaction(workerId)
  }

  async persist(store?: import("@meshly/core").ProjectStore) {
    const { ProjectStore } = await import("@meshly/core")
    this.runtime.persist(store || new ProjectStore())
  }

  async restore(store?: import("@meshly/core").ProjectStore) {
    const { ProjectStore } = await import("@meshly/core")
    return this.runtime.restore(store || new ProjectStore())
  }

  stats() {
    return this.runtime.stats()
  }
}

export * from "@meshly/core"
export * from "@meshly/solari"
export default Meshly
