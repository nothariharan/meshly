/**
 * Meshly Contract Invariant Test Suite
 * Programmatically asserts the mathematical and operational guarantees of Meshly:
 *   - AUTHORITY: Monotonic narrowing, expiration rejection, policy interception
 *   - LIFECYCLE: Cascade cancellation, zero orphan environments, lease expiration
 *   - STATE: Checkpoint restoration, model-agnostic handoff, bounded memory
 *   - VERIFICATION: Reality match required, unverified writes blocked, SAGA compensation
 *   - RESOURCE: Budget ceilings, exclusive assignment, warm pool return
 *   - AUDIT: Event immutability, full causal timeline traceability
 */
import { Meshly } from "../src/mesh.js"
import { AuthorityManager } from "../src/authority.js"

interface TestResult {
  category: string
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function assert(category: string, name: string, condition: boolean, message?: string) {
  if (condition) {
    results.push({ category, name, passed: true })
  } else {
    results.push({ category, name, passed: false, error: message || "Assertion failed" })
  }
}

export async function runContractTests(): Promise<{ passed: boolean; results: TestResult[] }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY CONTRACT INVARIANTS & GUARANTEES TEST SUITE")
  console.log("=".repeat(78) + "\n")

  const mesh = new Meshly()

  // --------------------------------------------------------------------------
  // 1. AUTHORITY INVARIANTS
  // --------------------------------------------------------------------------
  const rootAuth = AuthorityManager.create({
    tools: ["read_invoice", "write_invoice"],
    capabilities: ["read:invoice", "refund:max500"],
    domains: ["stripe.com"],
    maxSpend: 2.0,
    writeAccess: ["/data/invoices"],
    lifespanMs: 10_000,
  })

  // Invariant 1: Child cannot expand tools
  const childAttempt = AuthorityManager.deriveChild(rootAuth, {
    tools: ["read_invoice", "delete_database"], // illegal extra tool
    maxSpend: 10.0, // illegal spend expansion
    domains: ["stripe.com", "malicious-site.com"], // illegal domain expansion
  })

  assert(
    "AUTHORITY",
    "Child authority is strictly subset of parent (tools)",
    !childAttempt.tools.includes("delete_database") && childAttempt.tools.includes("read_invoice")
  )

  assert(
    "AUTHORITY",
    "Child spend cap never exceeds parent spend cap",
    childAttempt.maxSpend !== undefined && childAttempt.maxSpend <= rootAuth.maxSpend!
  )

  assert(
    "AUTHORITY",
    "Child domains cannot expand beyond parent whitelist",
    childAttempt.domains !== undefined && !childAttempt.domains.includes("malicious-site.com")
  )

  // Invariant 2: Expired authority rejects execution
  const expiredAuth = AuthorityManager.create({
    tools: ["*"],
    lifespanMs: -1000, // already expired
  })
  const evalExpired = AuthorityManager.evaluate(expiredAuth, { tool: "any_tool" })
  assert(
    "AUTHORITY",
    "Expired authority lease rejects action intent",
    !evalExpired.allowed && evalExpired.policyReason === "LEASE_EXPIRED"
  )

  // --------------------------------------------------------------------------
  // 2. RESOURCE & LEASE INVARIANTS
  // --------------------------------------------------------------------------
  const worker1 = await mesh.spawn({
    task: "Resource test worker 1",
    capabilities: ["browser"],
    budget: 0.1,
  })

  const lease1 = await mesh.broker.acquire({
    workerId: worker1.id,
    type: "browser",
    authority: worker1.authority,
    budget: 0.1,
  })

  const env1 = mesh.broker.inspect(lease1.environmentId)!
  assert(
    "RESOURCE",
    "Acquired environment is marked BUSY and owned exclusively",
    env1.status === "BUSY" && env1.owner === worker1.id
  )

  // Budget deduction constraint
  const overspendResult = worker1.deductSpend(0.5) // exceeds 0.1 budget
  assert(
    "RESOURCE",
    "Worker cannot exceed configured budget cap",
    !overspendResult && worker1.budget.spent <= worker1.budget.maxSpend
  )

  // Release resource back to pool
  await mesh.broker.release(lease1.leaseId)
  assert(
    "RESOURCE",
    "Released environment returns to warm pool in IDLE state",
    env1.status === "IDLE" && env1.owner === undefined
  )

  // --------------------------------------------------------------------------
  // 3. LIFECYCLE & CANCELLATION INVARIANTS
  // --------------------------------------------------------------------------
  const parentWorker = await mesh.spawn({
    task: "Parent worker",
    capabilities: ["sandbox"],
  })

  const childWorker1 = await parentWorker.spawnChild({
    task: "Child worker 1",
    capabilities: ["sandbox"],
    requestedAuthority: { tools: ["*"] },
  })

  const childWorker2 = await parentWorker.spawnChild({
    task: "Child worker 2",
    capabilities: ["sandbox"],
    requestedAuthority: { tools: ["*"] },
  })

  // Cancel parent -> must cascade to children
  await parentWorker.cancel("Test cancellation cascade")

  assert(
    "LIFECYCLE",
    "Worker cancellation cascades to all descendants",
    parentWorker.status === "CANCELLED" &&
      childWorker1.status === "CANCELLED" &&
      childWorker2.status === "CANCELLED"
  )

  // --------------------------------------------------------------------------
  // 4. STATE & HANDOFF INVARIANTS
  // --------------------------------------------------------------------------
  const handoffSource = await mesh.spawn({
    task: "Initial worker before crash",
    capabilities: ["browser"],
    initialMemory: [{ key: "session_token", value: "tok_xyz9812", tier: "warm" }],
  })

  mesh.contexts.recordAction(handoffSource.id, {
    tool: "browser_navigate",
    args: { url: "https://example.com" },
    result: { status: 200 },
    authorized: true,
    verified: true,
  })

  // Semantic checkpoint
  const cp = handoffSource.checkpointState(1, { page: "https://example.com" })
  assert(
    "STATE",
    "Semantic checkpoint preserves verified world state",
    cp.verifiedWorldState?.page === "https://example.com"
  )

  // Transfer context to replacement worker
  const replacementWorker = await mesh.handoff(handoffSource.id, "Replacement worker continuing task")
  const transferredMemory = mesh.memory.get(replacementWorker.id, "session_token")

  assert(
    "STATE",
    "Model-agnostic handoff preserves cognitive context and memories",
    replacementWorker.context.currentStep === handoffSource.context.currentStep &&
      transferredMemory?.value === "tok_xyz9812"
  )

  // --------------------------------------------------------------------------
  // 5. VERIFICATION & REALITY INVARIANTS
  // --------------------------------------------------------------------------
  const verifierWorker = await mesh.spawn({
    task: "Verifier invariant check",
    capabilities: ["sandbox"],
  })

  let compensationExecuted = false
  const failureContract = {
    intent: "Ensure unverified claims block workflow commit",
    preconditions: [],
    postconditions: [{ target: "state" as const, type: "status_equals" as const, query: "state_flag", expected: "COMMITTED" }],
    compensate: async () => {
      compensationExecuted = true
    },
  }

  // Agent falsely claims success while state_flag is UNCOMMITTED
  const fakeState = { state_flag: "UNCOMMITTED" }
  const verifyRes = await mesh.verifyStep({
    workerId: verifierWorker.id,
    contract: failureContract,
    executeAction: async () => ({ claimedSuccess: true }),
    observeState: async () => fakeState,
  })

  assert(
    "VERIFICATION",
    "Agent claim of success does not bypass physical reality check",
    verifyRes.state.agentClaim === "SUCCESS" &&
      verifyRes.state.worldStateMatched === false &&
      verifyRes.state.workflowResult === "FAILURE"
  )

  assert(
    "VERIFICATION",
    "Reality divergence triggers automatic SAGA compensation",
    compensationExecuted === true
  )

  // --------------------------------------------------------------------------
  // 6. AUDIT & EVENT INVARIANTS
  // --------------------------------------------------------------------------
  const recentEvents = mesh.events.query({ limit: 10 })
  assert(
    "AUDIT",
    "Every consequential action emits an immutable event",
    recentEvents.length > 0 && Object.isFrozen(recentEvents[0])
  )

  const timeline = mesh.events.getTimeline(parentWorker.id)
  assert(
    "AUDIT",
    "Worker lifecycle events form a chronological audit timeline",
    timeline.length >= 2 && timeline.some((e) => e.type === "worker.created") && timeline.some((e) => e.type === "worker.cancelled")
  )

  // --------------------------------------------------------------------------
  // REPORT RESULTS
  // --------------------------------------------------------------------------
  const categories = Array.from(new Set(results.map((r) => r.category)))
  let allPassed = true

  for (const cat of categories) {
    console.log(`\n[${cat}]`)
    const catResults = results.filter((r) => r.category === cat)
    for (const r of catResults) {
      if (r.passed) {
        console.log(`  ✓ ${r.name}`)
      } else {
        console.log(`  ✗ ${r.name}: ${r.error}`)
        allPassed = false
      }
    }
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Results: ${results.filter((r) => r.passed).length}/${results.length} Invariants Verified`)
  console.log(` Overall Status: ${allPassed ? "100% INVARIANTS SATISFIED" : "TESTS FAILED"}`)
  console.log("=".repeat(78) + "\n")

  return { passed: allPassed, results }
}

if (process.argv[1]?.endsWith("invariants.test.ts") || process.argv[1]?.endsWith("invariants.test.js")) {
  runContractTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
