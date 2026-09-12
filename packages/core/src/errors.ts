/**
 * User-facing Meshly errors.
 * These are what a stranger sees. Not stack traces.
 */
export type MeshlyErrorCode =
  | "NO_PROJECT"
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "CONCURRENCY_LIMIT"
  | "INSUFFICIENT_CREDIT"
  | "ENVIRONMENT_UNAVAILABLE"
  | "AUTHORITY_DENIED"
  | "BUDGET_EXCEEDED"
  | "LIMIT_EXCEEDED"
  | "RUN_NOT_FOUND"
  | "UNKNOWN_SIDE_EFFECT"

export class MeshlyError extends Error {
  readonly code: MeshlyErrorCode | string
  readonly title: string
  readonly reason: string
  readonly runId?: string
  readonly action: string
  readonly retry?: string
  readonly retryable: boolean

  constructor(params: {
    code: MeshlyErrorCode | string
    title: string
    reason: string
    runId?: string
    action?: string
    retry?: string
    retryable?: boolean
    cause?: unknown
  }) {
    super(params.title)
    this.name = "MeshlyError"
    this.code = params.code
    this.title = params.title
    this.reason = params.reason
    this.runId = params.runId
    this.action = params.action || "No work was lost."
    this.retry = params.retry
    this.retryable = params.retryable ?? Boolean(params.retry)
    if (params.cause) (this as Error & { cause?: unknown }).cause = params.cause
  }

  format(): string {
    const lines = [this.title, "", "Reason:", this.reason]
    if (this.runId) lines.push("", "Run:", this.runId)
    lines.push("", "Action:", this.action)
    if (this.retry) lines.push("", "Retry:", this.retry)
    return `${lines.join("\n")}\n`
  }
}

export function formatUserError(err: unknown): string {
  if (err instanceof MeshlyError) return err.format()
  const mapped = toMeshlyError(err)
  if (mapped) return mapped.format()
  if (err instanceof Error) return err.message
  return String(err)
}

export function toMeshlyError(
  err: unknown,
  extras: { runId?: string; environment?: string } = {},
): MeshlyError | undefined {
  if (err instanceof MeshlyError) {
    if (extras.runId && !err.runId) {
      return new MeshlyError({ ...err, runId: extras.runId, title: err.title, reason: err.reason, code: err.code })
    }
    return err
  }

  const anyErr = err as { message?: string; code?: string; status?: number; name?: string } | undefined
  const message = anyErr?.message || String(err)
  const code = anyErr?.code || anyErr?.name
  const env = extras.environment || inferEnvironment(message)
  const envLabel = env ? env[0].toUpperCase() + env.slice(1) : "execution"

  if (code === "ConcurrencyLimitExceeded" || /concurrent session cap|concurrency limit/i.test(message)) {
    return new MeshlyError({
      code: "CONCURRENCY_LIMIT",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: "Solari concurrency limit reached.",
      runId: extras.runId,
      action: "The worker was placed in WAITING state.\nNo work was lost.",
      retry: extras.runId ? `meshly resume ${extras.runId}` : "meshly resume <runId>",
      cause: err,
    })
  }

  if (code === "MissingApiKey" || /No SOLARI_API_KEY/i.test(message)) {
    return new MeshlyError({
      code: "MISSING_API_KEY",
      title: "Meshly is not connected to Solari.",
      reason: "No SOLARI_API_KEY. Meshly will not pretend live infrastructure ran.",
      action: "No environments were allocated.",
      retry: "meshly init --api-key <your Solari key>",
      cause: err,
    })
  }

  if (code === "Unauthorized" || anyErr?.status === 401 || /invalid api key|unauthorized/i.test(message)) {
    return new MeshlyError({
      code: "INVALID_API_KEY",
      title: "Solari rejected the API key.",
      reason: "The key is missing, expired, or not authorized for this account.",
      runId: extras.runId,
      action: "No environments were allocated.",
      retry: "meshly init --api-key <your Solari key>",
      cause: err,
    })
  }

  if (code === "InsufficientCredit" || anyErr?.status === 402) {
    return new MeshlyError({
      code: "INSUFFICIENT_CREDIT",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: "Solari credit is exhausted.",
      runId: extras.runId,
      action: "The worker was not started.",
      retry: "Add Solari credit, then meshly resume <runId>",
      cause: err,
    })
  }

  if (/no stealth pool|pool is empty|no browser capacity|no sandbox capacity|desktop unavailable/i.test(message)) {
    return new MeshlyError({
      code: "ENVIRONMENT_UNAVAILABLE",
      title: `Meshly could not allocate a ${envLabel} environment.`,
      reason: message,
      runId: extras.runId,
      action: "The worker was placed in WAITING state.\nNo work was lost.",
      retry: extras.runId ? `meshly resume ${extras.runId}` : "meshly resume <runId>",
      cause: err,
    })
  }

  if (/Budget exceeded|Spend cap reached|exceeds authority limit/i.test(message)) {
    return new MeshlyError({
      code: "BUDGET_EXCEEDED",
      title: "Worker exceeded its spend cap.",
      reason: message,
      runId: extras.runId,
      action: "Execution stopped. No further tools were dispatched.",
      cause: err,
    })
  }

  if (/Duration cap|Tool-call cap|Retry blocked|limit reached/i.test(message)) {
    return new MeshlyError({
      code: "LIMIT_EXCEEDED",
      title: "Worker hit an operational limit.",
      reason: message,
      runId: extras.runId,
      action: "Execution stopped. Recorded work was kept.",
      cause: err,
    })
  }

  if (/not in the worker authority|LEASE_EXPIRED|blocked before|denied/i.test(message)) {
    return new MeshlyError({
      code: "AUTHORITY_DENIED",
      title: "Policy denied the action.",
      reason: message,
      runId: extras.runId,
      action: "The tool was not dispatched.",
      cause: err,
    })
  }

  return undefined
}

export function isRetryableAllocation(err: unknown): boolean {
  const mapped = err instanceof MeshlyError ? err : toMeshlyError(err)
  return mapped?.code === "CONCURRENCY_LIMIT" || mapped?.code === "ENVIRONMENT_UNAVAILABLE" || Boolean(mapped?.retryable)
}

function inferEnvironment(message: string): string | undefined {
  const lower = message.toLowerCase()
  if (lower.includes("desktop")) return "desktop"
  if (lower.includes("sandbox")) return "sandbox"
  if (lower.includes("browser")) return "browser"
  return undefined
}
