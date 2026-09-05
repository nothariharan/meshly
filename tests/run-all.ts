/**
 * Master Test Runner for Meshly
 * Runs all invariant, failure resilience, security policy, and reality verification test suites.
 */
import { runInvariantTests } from "./invariants/invariants.test.js"
import { runDistributedEdgeCaseTests } from "./invariants/distributed-edge-cases.test.js"
import { runFailureTests } from "./failure/failure.test.js"
import { runSecurityTests } from "./security/security.test.js"
import { runMaliciousAgentTests } from "./security/malicious-agent.test.js"
import { runVerificationTests } from "./verification/verification.test.js"
import { runStupidAgentTests } from "./verification/stupid-agent.test.js"
import { runAgentAgnosticTests } from "./agent-agnostic/agent-agnostic.test.js"

async function main() {
  const startTime = Date.now()
  console.log("\n" + "#".repeat(80))
  console.log("  MESHLY COMPREHENSIVE TEST SUITE RUNNER")
  console.log("  Verifying all operational, safety, and architectural guarantees")
  console.log("#".repeat(80))

  const invariants = await runInvariantTests()
  const distributedEdgeCases = await runDistributedEdgeCaseTests()
  const failures = await runFailureTests()
  const security = await runSecurityTests()
  const malicious = await runMaliciousAgentTests()
  const verification = await runVerificationTests()
  const stupidAgent = await runStupidAgentTests()
  const agentAgnostic = await runAgentAgnosticTests()

  const allPassed =
    invariants.passed &&
    distributedEdgeCases.passed &&
    failures.passed &&
    security.passed &&
    malicious.passed &&
    verification.passed &&
    stupidAgent.passed &&
    agentAgnostic.passed

  const duration = Date.now() - startTime

  console.log("\n" + "=".repeat(80))
  console.log("  TEST SUMMARY MATRIX (8/8 SUITES)")
  console.log("=".repeat(80))
  console.log(`  1. Invariant Tests:        ${invariants.passed ? "✓ PASSED (14/14 Invariants)" : "✗ FAILED"}`)
  console.log(`  2. Distributed Edge Cases: ${distributedEdgeCases.passed ? "✓ PASSED (3/3 Scenarios: Re-verification, State Detection, Causal Events)" : "✗ FAILED"}`)
  console.log(`  3. Failure Chaos:          ${failures.passed ? "✓ PASSED (3/3 Scenarios)" : "✗ FAILED"}`)
  console.log(`  4. Security Red-Team:      ${security.passed ? "✓ PASSED (5/5 Attacks Intercepted)" : "✗ FAILED"}`)
  console.log(`  5. Malicious Agent Escapes: ${malicious.passed ? "✓ PASSED (6/6 Escalation & Egress Attempts Blocked)" : "✗ FAILED"}`)
  console.log(`  6. Reality Verifier:       ${verification.passed ? "✓ PASSED (3/3 Proofs Validated)" : "✗ FAILED"}`)
  console.log(`  7. Stupid Agent Safety:    ${stupidAgent.passed ? "✓ PASSED (4/4 Delusion, Loop & Hallucination Defenses)" : "✗ FAILED"}`)
  console.log(`  8. Agent-Agnostic Adapters: ${agentAgnostic.passed ? "✓ PASSED (4/4 OpenAI, Claude, MCP & Model Handoffs)" : "✗ FAILED"}`)
  console.log("-".repeat(80))
  console.log(`  TOTAL STATUS:              ${allPassed ? "100% GREEN • VERIFIED RUNTIME KERNEL (TESTED SAFETY INVARIANTS)" : "FAILURES ENCOUNTERED"}`)
  console.log(`  ELAPSED TIME:              ${duration}ms`)
  console.log("=".repeat(80) + "\n")

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error("Test runner crashed:", err)
  process.exit(1)
})
