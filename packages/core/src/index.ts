/**
 * @meshly/core
 *
 * The operating layer for autonomous workers.
 * Core Verbs: SCHEDULE • PERSIST • AUTHORIZE • VERIFY • RESUME
 */

// Universal types and contracts
export * from "./types.js"

// Event Store with causal ordering
export { EventStore } from "./events/events.js"

// Lifecycle state machines
export {
  VALID_WORKER_TRANSITIONS,
  VALID_ENVIRONMENT_TRANSITIONS,
  canTransitionWorker,
  canTransitionEnvironment,
} from "./lifecycle/states.js"

// Execution fabric interfaces & simulator
export type {
  ExecutionFabric,
  FabricResource,
  BrowserLaunchOptions,
  SandboxCreateOptions,
  DesktopCreateOptions,
} from "./fabric/fabric.js"
export { SimulatorExecutionFabric } from "./fabric/simulator.js"
export { EnvironmentBroker } from "./fabric/broker.js"
export type { AcquireRequirements } from "./fabric/broker.js"

// Authority and policy interception
export { AuthorityManager } from "./authority/authority.js"
export type {
  ActionIntent,
  PolicyDecision,
  AuthorizationResult,
} from "./authority/authority.js"

// Context management and zero-loss handoff
export { ContextManager } from "./context/context.js"

// Tiered memory management
export { MemoryManager } from "./memory/memory.js"

// Reality engine and evidence bundles
export { Verifier } from "./verification/verifier.js"

// Distributed transactions and compensations
export { SagaTransaction } from "./transactions/saga.js"
export type { SagaStepDef, SagaExecutionResult, SagaExecutionResult as SagaResult } from "./transactions/saga.js"

// Semantic checkpointing
export { CheckpointManager } from "./checkpoint/checkpoint.js"

// Multi-factor scheduler and decisions
export { Scheduler } from "./scheduler/scheduler.js"
export type { ScheduleCandidate, ScheduleCandidate as ScheduledWorker } from "./scheduler/scheduler.js"

// Worker instances and lifecycle
export { WorkerInstance } from "./worker/worker.js"
export { WorkerManager } from "./worker/manager.js"

// First-Class Runs
export { RunInstance, RunManager } from "./run/run.js"

// Agent-Agnostic Adapters
export {
  ScriptAgentAdapter,
  OpenAIAgentAdapter,
  AnthropicAgentAdapter,
  MCPAgentAdapter,
} from "./agents/adapter.js"

// Human takeover and operator manager
export { OperatorManager } from "./operator/operator.js"
export type { TakeoverSession, TakeoverSession as OperatorSession } from "./operator/operator.js"

// Chaos engineering and failure injection
export { FailureInjector } from "./failure/injector.js"
export type { FailureScenario, FailureScenario as FailureType, InjectedFailureResult } from "./failure/injector.js"

// Central runtime engine
export { MeshlyRuntime } from "./runtime.js"
export type { MeshlyConfig, WorkflowStep, WorkflowDef } from "./runtime.js"
