/**
 * @meshly/core - Reality Engine & Verifier
 * Decouples agent claims from physical world reality.
 * Emits tamper-evident content-addressed evidence bundles.
 */
import { createHash } from "crypto"
import { VerificationContract, VerificationState, EvidenceBundle, VerificationCondition } from "../types.js"
import { EventStore } from "../events/events.js"

export class Verifier {
  static async verifyStep(params: {
    workerId: string
    contract: VerificationContract
    executeAction: () => Promise<{ claimedSuccess?: boolean; [key: string]: any }>
    observeState: () => Promise<Record<string, any>>
    events?: EventStore
  }): Promise<{ state: VerificationState; evidence?: EvidenceBundle }> {
    const timestamp = Date.now()
    const { workerId, contract, executeAction, observeState, events } = params

    // 1. Observe Pre-State
    const initialObservation = await observeState()
    let prePassed = true
    let preFailureReason = ""

    for (const cond of contract.preconditions) {
      const actual = initialObservation[cond.query]
      if (!this.matches(cond, actual)) {
        prePassed = false
        preFailureReason = `Precondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`
        break
      }
    }

    if (!prePassed) {
      const failState: VerificationState = {
        agentClaim: "PENDING",
        toolExecution: "PENDING",
        worldStateMatched: false,
        workflowResult: "FAILURE",
        observations: initialObservation,
        error: preFailureReason,
        timestamp,
      }

      if (events) {
        events.emit("verification.failed", { workerId, data: { reason: preFailureReason, stage: "precondition" } })
      }
      return { state: failState }
    }

    // 2. Execute Action
    let actionOutput: Record<string, any> = {}
    let toolExecutionSuccess = false
    let agentClaimSuccess = true

    try {
      actionOutput = await executeAction()
      toolExecutionSuccess = true
      agentClaimSuccess = actionOutput.claimedSuccess !== false
    } catch (err: any) {
      toolExecutionSuccess = false
      agentClaimSuccess = false

      if (contract.compensate) {
        if (events) events.emit("compensation.started", { workerId, data: { error: err.message } })
        try {
          await contract.compensate({ error: err.message, initialObservation })
          if (events) events.emit("compensation.completed", { workerId, data: { recovered: true } })
        } catch (compErr) {
          console.error("[Meshly Verifier] Compensation error:", compErr)
        }
      }

      const excState: VerificationState = {
        agentClaim: "FAILURE",
        toolExecution: "FAILURE",
        worldStateMatched: false,
        workflowResult: "FAILURE",
        observations: initialObservation,
        error: `Action failed with exception: ${err.message}`,
        timestamp,
      }

      if (events) {
        events.emit("verification.failed", { workerId, data: { error: err.message, stage: "action_execution" } })
      }
      return { state: excState }
    }

    // 3. Observe Post-State & Verify Postconditions
    const postObservation = await observeState()
    let postPassed = true
    let mismatchDetail = ""

    for (const cond of contract.postconditions) {
      const actual = postObservation[cond.query]
      if (!this.matches(cond, actual)) {
        postPassed = false
        mismatchDetail = `Postcondition failed on '${cond.query}': expected '${cond.expected}', observed '${actual}'`
        break
      }
    }

    if (!postPassed) {
      if (contract.compensate) {
        if (events) events.emit("compensation.started", { workerId, data: { reason: mismatchDetail } })
        try {
          await contract.compensate({ reason: mismatchDetail, pre: initialObservation, post: postObservation })
          if (events) events.emit("compensation.completed", { workerId, data: { compensated: true } })
        } catch (compErr) {
          console.error("[Meshly Verifier] Compensation error:", compErr)
        }
      }

      const divergenceState: VerificationState = {
        agentClaim: agentClaimSuccess ? "SUCCESS" : "FAILURE",
        toolExecution: toolExecutionSuccess ? "SUCCESS" : "FAILURE",
        worldStateMatched: false,
        workflowResult: "FAILURE",
        observations: postObservation,
        error: mismatchDetail,
        timestamp,
      }

      if (events) {
        events.emit("verification.failed", {
          workerId,
          data: {
            reason: mismatchDetail,
            agentClaim: divergenceState.agentClaim,
            toolExecution: divergenceState.toolExecution,
            worldStateMatched: false,
          },
        })
      }
      return { state: divergenceState }
    }

    // 4. Generate Tamper-Evident Evidence Bundle
    const stateDiff = {
      before: initialObservation,
      after: postObservation,
    }

    const digestPayload = JSON.stringify({
      workerId,
      intent: contract.intent,
      timestamp,
      stateDiff,
    })

    const tamperEvidentDigestSha256 = createHash("sha256").update(digestPayload).digest("hex")

    const evidence: EvidenceBundle = {
      workerId,
      jobId: `job_${timestamp.toString(36)}`,
      intent: contract.intent,
      timestamp,
      verified: true,
      agentClaim: agentClaimSuccess ? "SUCCESS" : "FAILURE",
      worldStateMatch: true,
      stateDiff,
      replays: {
        browser: postObservation["browser_replay_url"] || postObservation["replayUrl"],
        desktop: postObservation["desktop_stream_url"] || postObservation["streamUrl"],
        microvmLogs: postObservation["microvm_exit_codes"],
      },
      tamperEvidentDigestSha256,
    }

    const successState: VerificationState = {
      agentClaim: "SUCCESS",
      toolExecution: "SUCCESS",
      worldStateMatched: true,
      workflowResult: "SUCCESS",
      observations: postObservation,
      timestamp,
    }

    if (events) {
      events.emit("verification.passed", {
        workerId,
        data: { intent: contract.intent, digest: tamperEvidentDigestSha256 },
      })
    }

    return { state: successState, evidence }
  }

  private static matches(cond: VerificationCondition, actual: any): boolean {
    if (actual === undefined || actual === null) return false
    switch (cond.type) {
      case "status_equals":
      case "json_match":
        return actual === cond.expected
      case "text_contains":
        return String(actual).toLowerCase().includes(String(cond.expected).toLowerCase())
      case "file_exists":
        return Boolean(actual)
      case "custom":
        return typeof cond.expected === "function" ? cond.expected(actual) : actual === cond.expected
      default:
        return actual === cond.expected
    }
  }
}
