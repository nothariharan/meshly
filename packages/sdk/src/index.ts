/**
 * @meshly/sdk - The Unified Developer SDK for Meshly
 * Run agents like infrastructure. Schedule their compute. Preserve their state. Control their authority. Verify their work.
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
} from "@meshly/core"
import { SolariExecutionFabric } from "@meshly/solari"

export interface MeshlyClientOptions extends MeshlyConfig {
  solariApiKey?: string
  preferSimulator?: boolean
}

export class Meshly {
  public readonly runtime: MeshlyRuntime

  constructor(options: MeshlyClientOptions = {}) {
    let fabric: ExecutionFabric

    if (options.executionFabric) {
      fabric = options.executionFabric
    } else if (options.preferSimulator) {
      fabric = new SimulatorExecutionFabric()
    } else {
      const apiKey = options.solariApiKey || process.env.SOLARI_API_KEY
      fabric = new SolariExecutionFabric({ apiKey, fallbackToSimulator: true })
    }

    this.runtime = new MeshlyRuntime({
      ...options,
      executionFabric: fabric,
    })
  }

  // Gateway access to core subsystems
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

  // Core Ergonomics
  async spawn(params: {
    task: string
    capabilities: Capability[]
    priority?: number
    deadline?: Date
    budget?: number
    authority?: Authority
    parentId?: string
    metadata?: Record<string, any>
    initialMemory?: Array<{ key: string; value: any; tier?: "hot" | "warm" | "cold" }>
  }): Promise<WorkerInstance> {
    return this.runtime.spawn(params)
  }

  async scheduleNext(): Promise<{ worker?: WorkerInstance; lease?: EnvironmentLease; score?: number }> {
    return this.runtime.scheduleNext()
  }

  async verifyStep(params: {
    workerId: string
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

  stats() {
    return this.runtime.stats()
  }
}

// Re-export all core modules and solari adapter
export * from "@meshly/core"
export * from "@meshly/solari"
export default Meshly
