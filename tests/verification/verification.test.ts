/**
 * @meshly/tests - Reality Engine & Verification Test Suite
 * Asserts decoupling between LLM claims, tool exit codes, and physical world state.
 */
import { Verifier } from "@meshly/core"
import { createHash } from "crypto"

export async function runVerificationTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY REALITY ENGINE & EVIDENCE VERIFICATION SUITE")
  console.log(" Decoupling Agent Claim vs Physical Reality")
  console.log("=".repeat(78) + "\n")

  let passed = true

  // 1. Precondition Guard
  console.log("[Test 1] Precondition Guard (Halts before touching the world)...")
  let actionExecuted = false
  const preResult = await Verifier.verifyStep({
    workerId: "test_wrk",
    contract: {
      intent: "Update user status to active",
      preconditions: [{ target: "state", type: "status_equals", query: "user_exists", expected: true }],
      postconditions: [{ target: "state", type: "status_equals", query: "status", expected: "ACTIVE" }],
    },
    executeAction: async () => {
      actionExecuted = true
      return { claimedSuccess: true }
    },
    observeState: async () => ({ user_exists: false }), // precondition fails
  })

  if (!actionExecuted && preResult.state.workflowResult === "FAILURE") {
    console.log("  ✓ Action was prevented from executing because precondition was not satisfied")
  } else {
    console.error("  ✗ Precondition failed to guard action execution!")
    passed = false
  }

  // 2. Lying Agent Detection (Claim = true, Reality = false)
  console.log("\n[Test 2] Lying Agent Detection (Agent claims success, DOM unchanged)...")
  const lieResult = await Verifier.verifyStep({
    workerId: "test_wrk",
    contract: {
      intent: "Click Submit Button and confirm modal disappears",
      preconditions: [],
      postconditions: [{ target: "browser", type: "status_equals", query: "modal_visible", expected: false }],
    },
    executeAction: async () => {
      // Agent claims it clicked and succeeded
      return { claimedSuccess: true, message: "Button clicked successfully!" }
    },
    observeState: async () => ({ modal_visible: true }), // reality did not change
  })

  if (
    lieResult.state.agentClaim === "SUCCESS" &&
    lieResult.state.worldStateMatched === false &&
    lieResult.state.workflowResult === "FAILURE"
  ) {
    console.log("  ✓ Reality divergence detected: Agent Claim=SUCCESS, World Match=FALSE")
  } else {
    console.error("  ✗ Failed to detect lying agent divergence:", lieResult)
    passed = false
  }

  // 3. Tamper-Evident Digest Integrity
  console.log("\n[Test 3] Tamper-Evident SHA-256 Evidence Bundle Integrity...")
  const validResult = await Verifier.verifyStep({
    workerId: "test_wrk",
    contract: {
      intent: "Verify invoice payment status",
      preconditions: [],
      postconditions: [{ target: "state", type: "status_equals", query: "paid", expected: true }],
    },
    executeAction: async () => ({ claimedSuccess: true }),
    observeState: async () => ({ paid: true, amount: 500 }),
  })

  if (validResult.evidence && validResult.evidence.verified) {
    const evidence = validResult.evidence
    const payload = JSON.stringify({
      workerId: evidence.workerId,
      intent: evidence.intent,
      timestamp: evidence.timestamp,
      stateDiff: evidence.stateDiff,
    })
    const recomputedHash = createHash("sha256").update(payload).digest("hex")

    if (recomputedHash === evidence.tamperEvidentDigestSha256) {
      console.log(`  ✓ Evidence bundle validated: SHA-256 checksum matches ${evidence.tamperEvidentDigestSha256.slice(0, 16)}...`)
    } else {
      console.error("  ✗ Evidence SHA-256 hash mismatch!")
      passed = false
    }
  } else {
    console.error("  ✗ Evidence bundle not generated for valid step")
    passed = false
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL REALITY VERIFICATION GUARANTEES MET" : "TESTS FAILED"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("verification.test")) {
  runVerificationTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
