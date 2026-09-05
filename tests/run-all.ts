/**
 * Master Test Runner for Meshly
 * Runs all invariant, failure resilience, security policy, and reality verification test suites.
 */
import { runInvariantTests } from "./invariants/invariants.test.js"
import { runFailureTests } from "./failure/failure.test.js"
import { runSecurityTests } from "./security/security.test.js"
import { runVerificationTests } from "./verification/verification.test.js"

async function main() {
  const startTime = Date.now()
  console.log("\n" + "#".repeat(80))
  console.log("  MESHLY COMPREHENSIVE TEST SUITE RUNNER")
  console.log("  Verifying all operational, mathematical, and architectural guarantees")
  console.log("#".repeat(80))

  const invariants = await runInvariantTests()
  const failures = await runFailureTests()
  const security = await runSecurityTests()
  const verification = await runVerificationTests()

  const allPassed = invariants.passed && failures.passed && security.passed && verification.passed
  const duration = Date.now() - startTime

  console.log("\n" + "=".repeat(80))
  console.log("  TEST SUMMARY MATRIX")
  console.log("=".repeat(80))
  console.log(`  1. Invariant Tests:    ${invariants.passed ? "✓ PASSED (14/14 Invariants)" : "✗ FAILED"}`)
  console.log(`  2. Failure Chaos:      ${failures.passed ? "✓ PASSED (3/3 Scenarios)" : "✗ FAILED"}`)
  console.log(`  3. Security Red-Team:  ${security.passed ? "✓ PASSED (5/5 Attacks Intercepted)" : "✗ FAILED"}`)
  console.log(`  4. Reality Verifier:   ${verification.passed ? "✓ PASSED (3/3 Proofs Validated)" : "✗ FAILED"}`)
  console.log("-".repeat(80))
  console.log(`  TOTAL STATUS:          ${allPassed ? "100% GREEN • PRODUCTION READY" : "FAILURES ENCOUNTERED"}`)
  console.log(`  ELAPSED TIME:          ${duration}ms`)
  console.log("=".repeat(80) + "\n")

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error("Test runner crashed:", err)
  process.exit(1)
})
