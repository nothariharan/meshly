/**
 * @meshly/core - Lifecycle State Machines
 * Enforces strict separation between logical Worker states and physical Environment states.
 */
import { WorkerStatus, EnvironmentStatus } from "../types.js"

export const VALID_WORKER_TRANSITIONS: Record<WorkerStatus, WorkerStatus[]> = {
  CREATED: ["QUEUED", "CANCELLED"],
  QUEUED: ["ALLOCATING", "CANCELLED", "FAILED"],
  ALLOCATING: ["RUNNING", "FAILED", "CANCELLED", "QUEUED"],
  RUNNING: ["WAITING", "PAUSED", "HANDOFF", "COMPLETED", "FAILED", "CANCELLED"],
  WAITING: ["RUNNING", "PAUSED", "CANCELLED", "FAILED"],
  PAUSED: ["RESUMING", "CANCELLED", "FAILED"],
  RESUMING: ["RUNNING", "FAILED", "CANCELLED"],
  HANDOFF: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
}

export const VALID_ENVIRONMENT_TRANSITIONS: Record<EnvironmentStatus, EnvironmentStatus[]> = {
  COLD: ["STARTING", "TERMINATED"],
  STARTING: ["READY", "LOST", "TERMINATING"],
  READY: ["BUSY", "IDLE", "PAUSED", "LOST", "TERMINATING"],
  BUSY: ["IDLE", "PAUSED", "READY", "LOST", "TERMINATING"],
  IDLE: ["BUSY", "PAUSED", "LOST", "TERMINATING"],
  PAUSED: ["RESUMING", "LOST", "TERMINATING"],
  RESUMING: ["READY", "BUSY", "LOST", "TERMINATING"],
  LOST: ["TERMINATING", "STARTING"],
  TERMINATING: ["TERMINATED"],
  TERMINATED: [],
}

export function canTransitionWorker(from: WorkerStatus, to: WorkerStatus): boolean {
  return VALID_WORKER_TRANSITIONS[from]?.includes(to) ?? false
}

export function canTransitionEnvironment(from: EnvironmentStatus, to: EnvironmentStatus): boolean {
  return VALID_ENVIRONMENT_TRANSITIONS[from]?.includes(to) ?? false
}
