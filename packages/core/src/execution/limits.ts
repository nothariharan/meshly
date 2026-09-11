/**
 * Operational limits. Strangers should not casually burn Solari credits.
 */
import { DEFAULT_WORKER_LIMITS, type WorkerLimits } from "../types.js"
import type { WorkerInstance } from "../worker/worker.js"

export function resolveLimits(worker: WorkerInstance): WorkerLimits {
  return {
    ...DEFAULT_WORKER_LIMITS,
    ...worker.limits,
    maxSpend: worker.budget.maxSpend,
  }
}

export function formatLimit(limit: keyof WorkerLimits, limits: WorkerLimits): string {
  if (limit === "maxSpend") return `$${limits.maxSpend.toFixed(2)}`
  if (limit === "maxDurationMs") return `${Math.round(limits.maxDurationMs / 60_000)}m`
  if (limit === "maxEnvironments") return String(limits.maxEnvironments)
  if (limit === "maxRetries") return String(limits.maxRetries)
  return String(limits.maxToolCalls)
}
