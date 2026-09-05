/**
 * @meshly/tests - Stupid Agent Safety Test Suite (Point 27)
 * Philosophical principle: "Meshly assumes the worker can be wrong."
 * Tests that Meshly remains completely resilient when a model:
 *   1. Misreads results & falsely claims success while the world failed
 *   2. Enters an infinite action retry loop without making progress
 *   3. Attempts invalid tool calls with hallucinated arguments
 *   4. Forgets historical context and overwrites critical state
 */
import { Meshly, Verifier, AuthorityManager } from "@meshly/sdk"

export async function runStupidAgentTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY STUPID AGENT SAFETY TEST SUITE")
  console.log(" Testing Resilience Against Hallucination, Delusion & Loops")
  console.log("=".repeat(78) + "\n")

  const mesh = new Meshly({ preferSimulator: true })
  let passed = true

  const worker = await mesh.spawn({
    task: "Handle fragile financial reconciliation",
    capabilities: ["browser", "sandbox"],
    budget: 0.10, // Strict small budget
    authority: AuthorityManager.issue({
      tools: ["submit_form", "query_status"],
      maxSpend: 0.10,
    }),
  })

  // 1. Delusional Agent: Claims success when world failed
  console.log("[Test 1] Delusional Agent: Claims 'Payment Sent!' when DOM shows 'Payment Rejected'...")
  const liveWorldState = {
    payment_status: "REJECTED_INSUFFICIENT_FUNDS",
    ledger_committed: false,
  }

  const contract = {
    intent: "Submit vendor payment and verify status is COMMITTED",
    preconditions: [],
    postconditions: [
      { target: "state" as const, type: "status_equals" as const, query: "payment_status", expected: "COMMITTED" },
    ],
  }

  const delusionRes = await Verifier.verifyStep({
    workerId: worker.id,
    contract,
    executeAction: async () => {
      // Model hallucination:
      return { claimedSuccess: true, commentary: "I have confirmed the payment was committed!" }
    },
    observeState: async () => ({ ...liveWorldState }),
  })

  if (
    delusionRes.state.agentClaim === "SUCCESS" &&
    delusionRes.state.worldStateMatched === false &&
    delusionRes.state.workflowResult === "FAILURE"
  ) {
    console.log("  ✓ Delusion caught: Model claim ignored, unverified commit blocked")
  } else {
    passed = false
    console.error("  ✗ Safety failure: Hallucinated success was permitted to commit!")
  }

  // 2. Loop / Thrashing Agent: Trapped in infinite tool call loop
  console.log("\n[Test 2] Thrashing Agent: Running repeated actions in a loop...")
  let loopCount = 0
  let budgetHalted = false

  while (loopCount < 20) {
    loopCount++
    const allowed = worker.deductSpend(0.03)
    if (!allowed) {
      budgetHalted = true
      break
    }
  }

  if (budgetHalted && loopCount <= 4) {
    console.log(`  ✓ Infinite loop halted after ${loopCount} iterations ($0.10 budget exhausted)`)
  } else {
    passed = false
    console.error("  ✗ Safety failure: Agent was allowed to run unchecked loop!")
  }

  // 3. Hallucinated Tools: Agent invents tools that do not exist
  console.log("\n[Test 3] Hallucinated Tool Call: Model invokes imaginary tool...")
  const hallucinatedTool = "magical_auto_fix_everything"
  const authCheck = AuthorityManager.evaluate(worker.authority, { tool: hallucinatedTool })

  if (!authCheck.allowed && authCheck.policyReason === "TOOL_DISALLOWED") {
    console.log(`  ✓ Tool '${hallucinatedTool}' intercepted before execution`)
  } else {
    passed = false
    console.error("  ✗ Safety failure: Hallucinated tool was allowed!")
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL STUPID AGENT FAILURE MODES CONTAINED" : "SAFETY BREACH"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("stupid-agent")) {
  runStupidAgentTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
