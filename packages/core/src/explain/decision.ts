/**
 * Why a run decided to commit, block, wait, or stay UNKNOWN.
 * Console, CLI, and SDK share this. No new kernel nouns.
 */
import type { RunStatus } from "../types.js"

export interface ExplainableStep {
  intent?: string
  status?: string
  action?: { tool?: string; args?: Record<string, any> }
  observation?: Record<string, any>
  agentClaim?: string
  toolExecution?: string
  actionOutcome?: string
  worldStateMatched?: boolean
  error?: string
  contract?: {
    intent?: string
    postconditions?: Array<{ query: string; expected: any; type?: string }>
  }
}

export interface ExplainableEvent {
  type: string
  environmentId?: string
  data?: Record<string, any>
}

export interface ExplainableRun {
  runId: string
  workerId: string
  workerName?: string
  kind?: string
  status: string
  error?: string
  steps?: ExplainableStep[]
  events?: ExplainableEvent[]
}

export interface DecisionExplanation {
  decision: string
  headline: string
  why: string[]
  policy?: string
  authority?: string
  next?: string
}

export function isUnknownStatus(status: string): boolean {
  return status === "UNKNOWN" || status === "VERIFYING"
}

export function isBlockedStatus(status: string): boolean {
  return status === "BLOCKED" || status === "VERIFICATION_FAILED"
}

export function isCommittedStatus(status: string): boolean {
  return status === "COMPLETED" || status === "COMMITTED" || status === "VERIFIED"
}

export function policyNameFor(kind?: string): string {
  if (kind === "reconciliation") return "finance.reconcile"
  if (kind === "research") return "research.collect"
  if (kind === "coding") return "engineering.code"
  if (kind === "operations") return "ops.incident"
  if (kind === "probe") return "meshly.probe"
  return kind || "worker.default"
}

export function explainDecision(
  run: ExplainableRun,
  extras: { policy?: string; authority?: string } = {},
): DecisionExplanation {
  const steps = run.steps || []
  const last = [...steps].reverse()[0]
  const events = run.events || []
  const sawUnknown = events.some((e) => e.type === "action.unknown" || e.type === "run.unknown") ||
    last?.actionOutcome === "UNKNOWN" ||
    last?.agentClaim === "UNKNOWN" ||
    isUnknownStatus(run.status)
  const policy = extras.policy || policyNameFor(run.kind)
  const authority = extras.authority || run.workerId

  if (isBlockedStatus(run.status) || (last?.worldStateMatched === false && last?.actionOutcome !== "UNKNOWN" && !sawUnknown)) {
    return blockedExplanation(run, last, policy, authority)
  }

  if (sawUnknown || isUnknownStatus(run.status) || run.status === "VERIFIED") {
    if (sawUnknown || isUnknownStatus(run.status) || last?.agentClaim === "UNKNOWN") {
      return unknownExplanation(run, last, policy, authority)
    }
  }

  if (run.status === "WAITING") {
    return {
      decision: "WAITING",
      headline: "WAITING",
      why: [
        run.error || "An environment could not be allocated.",
        "Recorded work was kept.",
        "Meshly did not invent a successful result.",
      ],
      policy,
      authority,
      next: `meshly resume ${run.runId}`,
    }
  }

  if (isCommittedStatus(run.status)) {
    return committedExplanation(run, last, policy, authority)
  }

  if (run.status === "FAILED" || run.status === "CANCELLED") {
    return {
      decision: run.status,
      headline: run.status,
      why: [run.error || last?.error || "The run did not complete."],
      policy,
      authority,
    }
  }

  return {
    decision: run.status,
    headline: run.status,
    why: last?.intent ? [last.intent] : ["The run is still in progress."],
    policy,
    authority,
  }
}

export function explainEnvironment(
  run: ExplainableRun,
  envType?: string,
): DecisionExplanation {
  const events = run.events || []
  const type = envType || inferEnvType(run)
  const reused = events.some((e) => e.type === "environment.reused")
  const scheduled = events.find((e) => e.type === "worker.scheduled" && Array.isArray(e.data?.reasons))
  const reasons = (scheduled?.data?.reasons as string[] | undefined) || []
  const why = reasons.length
    ? reasons
    : [
        type ? `✓ capability match (${type})` : "✓ capability match",
        "✓ worker affinity",
        reused ? "✓ warm" : "○ cold provision",
        "✓ within budget",
        "✓ lease available",
      ]

  return {
    decision: "SCHEDULED",
    headline: type ? `${type[0].toUpperCase()}${type.slice(1)} selected` : "Environment selected",
    why,
    authority: run.workerId,
  }
}

export function formatDecision(explanation: DecisionExplanation, opts: { headline?: boolean } = {}): string {
  const lines = opts.headline === false ? ["Why?", ""] : [explanation.headline, "", "Why?", ""]
  explanation.why.forEach((line, i) => {
    lines.push(`${i + 1}. ${line}`)
  })
  if (explanation.policy) {
    lines.push("", `Policy:`, explanation.policy)
  }
  if (explanation.authority) {
    lines.push(`Authority:`, explanation.authority)
  }
  if (explanation.next) {
    lines.push("", "Next:", explanation.next)
  }
  return lines.join("\n")
}

function blockedExplanation(
  run: ExplainableRun,
  last: ExplainableStep | undefined,
  policy: string,
  authority: string,
): DecisionExplanation {
  const payment = findObservation(run, "payment_status")
  const erp = findObservation(run, "erp_status")
  const contract = last?.contract
  const required = (contract?.postconditions || []).map((c) => `${c.query} === ${JSON.stringify(c.expected)}`)
  const why = [
    `Agent claimed ${claimText(last, payment)}`,
    payment ? `Browser returned payment = ${payment}` : `Tool execution ${last?.toolExecution || "SUCCESS"}`,
    erp ? `ERP observation = ${erp}` : `World state = MISMATCH`,
    required.length
      ? `Verification contract requires:\n   ${required.join("\n   ")}`
      : "Verification contract was not satisfied.",
    last?.error || run.error || "Condition failed",
    "Commit was therefore denied",
  ]

  return {
    decision: "COMMIT BLOCKED",
    headline: "COMMIT BLOCKED",
    why,
    policy,
    authority,
  }
}

function unknownExplanation(
  run: ExplainableRun,
  last: ExplainableStep | undefined,
  policy: string,
  authority: string,
): DecisionExplanation {
  const erp = findObservation(run, "erp_status")
  const confirmed = run.status === "VERIFIED" || last?.worldStateMatched === true
  const why = [
    "Side effect may have occurred.",
    "Retry blocked.",
    "Independent verification ran against the world — not the agent claim.",
    confirmed
      ? `World state confirmed${erp ? ` (${erp})` : ""}.`
      : `World state absent${last?.error ? ` — ${last.error}` : "."}`,
    confirmed ? "Decision: VERIFIED. UNKNOWN does not mean FAILED." : "Decision: UNKNOWN. UNKNOWN does not mean FAILED.",
  ]

  return {
    decision: confirmed ? "VERIFIED" : "UNKNOWN",
    headline: confirmed ? "UNKNOWN → VERIFIED" : "UNKNOWN",
    why,
    policy,
    authority,
    next: confirmed ? undefined : `meshly verify ${run.runId}`,
  }
}

function committedExplanation(
  run: ExplainableRun,
  last: ExplainableStep | undefined,
  policy: string,
  authority: string,
): DecisionExplanation {
  const payment = findObservation(run, "payment_status")
  const erp = findObservation(run, "erp_status")
  const why = [
    `Agent claimed ${claimText(last, payment)}`,
    payment ? `Browser returned payment = ${payment}` : `Tool execution ${last?.toolExecution || "SUCCESS"}`,
    erp ? `World state confirmed (${erp})` : "Independent verification matched the contract.",
    "Commit was allowed.",
  ]
  return {
    decision: run.status === "VERIFIED" ? "VERIFIED" : "COMMITTED",
    headline: run.status === "VERIFIED" ? "VERIFIED" : "COMMITTED",
    why,
    policy,
    authority,
  }
}

function claimText(last: ExplainableStep | undefined, payment?: string): string {
  if (payment) return `invoice = ${payment}`
  if (last?.agentClaim) return String(last.agentClaim)
  return "SUCCESS"
}

function findObservation(run: ExplainableRun, key: string): string | undefined {
  for (const step of run.steps || []) {
    const value = step.observation?.[key]
    if (value !== undefined && value !== null && value !== "") return String(value)
  }
  return undefined
}

function inferEnvType(run: ExplainableRun): string | undefined {
  const last = [...(run.steps || [])].reverse()[0]
  const tool = last?.action?.tool || ""
  if (tool.startsWith("browser")) return "browser"
  if (tool.startsWith("sandbox")) return "sandbox"
  if (tool.startsWith("desktop")) return "desktop"
  return undefined
}

export function outcomeOf(status: RunStatus | string): "SUCCESS" | "FAILURE" | "UNKNOWN" | "BLOCKED" {
  if (isUnknownStatus(status)) return "UNKNOWN"
  if (isBlockedStatus(status)) return "BLOCKED"
  if (isCommittedStatus(status) || status === "VERIFIED") return "SUCCESS"
  if (status === "FAILED" || status === "CANCELLED") return "FAILURE"
  return "UNKNOWN"
}
