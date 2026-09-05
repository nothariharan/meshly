/**
 * Meshly Core Types & System Contracts
 * The operating layer for autonomous workers built on Solari.
 *
 * Core Verbs: SCHEDULE • PERSIST • AUTHORIZE • VERIFY • RESUME
 */

export type Capability =
  | "browser"
  | "sandbox"
  | "desktop"
  | "network"
  | "filesystem"
  | string // Allows fine-grained capabilities: "read:invoice", "write:invoice", "refund:max500"

export type WorkerStatus =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "PAUSED"
  | "HANDOFF"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"

export type EnvironmentType = "browser" | "sandbox" | "desktop"

export type EnvironmentStatus =
  | "COLD"
  | "STARTING"
  | "READY"
  | "BUSY"
  | "IDLE"
  | "PAUSED"
  | "RESUMING"
  | "LOST"
  | "TERMINATING"
  | "TERMINATED"

export interface Budget {
  maxSpend: number
  spent: number
  currency: string
}

export interface Authority {
  tools: string[]
  capabilities: string[]
  domains?: string[]
  maxSpend?: number
  writeAccess?: string[]
  expiresAt: Date
  boundToJobId?: string
}

export interface MemoryRef {
  key: string
  tier: "hot" | "warm" | "cold"
  value: any
  tokensEstimate: number
  updatedAt: number
}

export interface CheckpointRef {
  id: string
  workerId: string
  step: number
  stateSnapshot: Record<string, any>
  environmentIds: string[]
  timestamp: number
  replayTimestampMs?: number
  verifiedWorldState?: Record<string, any>
}

export interface EnvironmentAffinity {
  profile?: string
  files?: string[]
  checkpointId?: string
  template?: string
}

export interface EnvironmentLease {
  leaseId: string
  workerId: string
  environmentId: string
  createdAt: Date
  expiresAt: Date
  capabilities: Capability[]
  budget: number
  authority: Authority
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "RELEASED"
}

export interface Environment {
  id: string
  type: EnvironmentType
  status: EnvironmentStatus
  owner?: string
  currentLeaseId?: string
  profile?: string
  loadedFiles: string[]
  cost: number
  capabilities: Capability[]
  streamUrl?: string
  replayUrl?: string
  handle?: any
  lastActiveAt: Date
}

export interface ContextRef {
  workerId: string
  task: string
  objective: string
  currentStep: number
  plan: string[]
  environmentState?: string
  lastObservation?: any
  recentActions: ActionRecord[]
  artifacts: ArtifactRecord[]
  relevantMemory: MemoryRef[]
  pendingVerification?: any
  outstandingApproval?: any
  metadata: Record<string, any>
}

export interface ActionRecord {
  step: number
  tool: string
  args: any
  result?: any
  error?: string
  authorized: boolean
  verified: boolean
  timestamp: number
}

export interface ArtifactRecord {
  name: string
  type: string
  uri?: string
  data?: any
  createdAt: number
}

export interface Worker {
  id: string
  task: string
  status: WorkerStatus
  priority: number
  deadline?: Date
  budget: Budget
  capabilities: Capability[]
  authority: Authority
  context: ContextRef
  memory: MemoryRef[]
  environmentLease?: EnvironmentLease
  checkpoint?: CheckpointRef
  verificationState?: VerificationState
  parentId?: string
  children: string[]
  createdAt: Date
  updatedAt: Date
}

export interface VerificationCondition {
  target: "browser" | "sandbox" | "desktop" | "state"
  type: "text_contains" | "status_equals" | "file_exists" | "json_match" | "custom"
  query: string
  expected: any
}

export type FailureStrategy = "retry" | "pause" | "human" | "compensate"

export interface VerificationContract {
  intent: string
  preconditions: VerificationCondition[]
  postconditions: VerificationCondition[]
  onFailure?: FailureStrategy
  compensate?: (context: any) => Promise<void>
}

export interface VerificationState {
  agentClaim: "SUCCESS" | "FAILURE" | "PENDING"
  toolExecution: "SUCCESS" | "FAILURE" | "PENDING"
  worldStateMatched: boolean
  workflowResult: "SUCCESS" | "FAILURE" | "PENDING"
  observations: Record<string, any>
  error?: string
  timestamp: number
}

export interface EvidenceBundle {
  workerId: string
  jobId: string
  intent: string
  timestamp: number
  verified: boolean
  agentClaim: string
  worldStateMatch: boolean
  stateDiff: {
    before: Record<string, any>
    after: Record<string, any>
  }
  replays: {
    browser?: string
    desktop?: string
    microvmLogs?: string[]
  }
  tamperEvidentDigestSha256: string
}

export type EventType =
  | "worker.created"
  | "worker.scheduled"
  | "worker.paused"
  | "worker.resumed"
  | "worker.handoff"
  | "worker.cancelled"
  | "worker.completed"
  | "worker.failed"
  | "environment.acquired"
  | "environment.reused"
  | "environment.paused"
  | "environment.resumed"
  | "environment.released"
  | "environment.lost"
  | "lease.granted"
  | "lease.expired"
  | "lease.revoked"
  | "authority.granted"
  | "authority.revoked"
  | "action.requested"
  | "action.authorized"
  | "action.denied"
  | "action.executed"
  | "observation.captured"
  | "verification.passed"
  | "verification.failed"
  | "compensation.started"
  | "compensation.completed"
  | "checkpoint.created"
  | "checkpoint.restored"
  | "memory.retrieved"
  | "human.intervention"

export interface MeshlyEvent {
  id: string
  type: EventType
  timestamp: number
  workerId?: string
  environmentId?: string
  leaseId?: string
  data: Record<string, any>
}
