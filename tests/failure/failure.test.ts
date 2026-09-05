/**
 * @meshly/tests - Failure Injection & Chaos Engineering Test Suite
 * Asserts runtime resilience against infrastructure crashes, timeouts, and state loss.
 */
import { Meshly } from "@meshly/sdk"

export async function runFailureTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY FAILURE INJECTION & RESILIENCE TEST SUITE")
  console.log("=".repeat(78) + "\n")

  const mesh = new Meshly({ preferSimulator: true })
  let passed = true

  // 1. Test Environment Loss & Recovery
  console.log("[Test 1] Injecting Infrastructure Crash (LOST state)...")
  const worker = await mesh.spawn({
    task: "Resilience test worker",
    capabilities: ["browser"],
  })

  const lease = await mesh.broker.acquire({
    workerId: worker.id,
    type: "browser",
    authority: worker.authority,
    budget: 1.0,
  })

  await mesh.failures.inject({
    type: "CRASH_ENVIRONMENT",
    targetEnvironmentId: lease.environmentId,
  })

  const envAfterCrash = mesh.broker.inspect(lease.environmentId)
  if (envAfterCrash?.status === "LOST") {
    console.log("  ✓ Crash detected: Environment transitioned to LOST")
  } else {
    console.error("  ✗ Expected environment status LOST, got:", envAfterCrash?.status)
    passed = false
  }

  // 2. Test SAGA Compensation on Tool Execution Exception
  console.log("\n[Test 2] Testing SAGA Compensating Rollback on Unhandled Exception...")
  let compensated = false
  const saga = mesh.transaction(worker.id)

  saga.addStep({
    name: "Step 1 (Succeeds)",
    contract: { intent: "Prepare database transaction", preconditions: [], postconditions: [] },
    action: async () => ({ prepared: true }),
    observeState: async () => ({ prepared: true }),
    compensate: async () => {
      compensated = true
      console.log("  ✓ Step 1 compensation executed after Step 2 failure")
    },
  })

  saga.addStep({
    name: "Step 2 (Throws Exception)",
    contract: { intent: "Execute external transfer", preconditions: [], postconditions: [] },
    action: async () => {
      throw new Error("Simulated downstream network timeout (ECONNRESET)")
    },
    observeState: async () => ({}),
  })

  const sagaResult = await saga.execute()
  if (!sagaResult.completed && sagaResult.compensatedSteps.length > 0 && compensated) {
    console.log("  ✓ SAGA executed reverse compensation without leaking uncommitted state")
  } else {
    console.error("  ✗ SAGA failed to compensate properly:", sagaResult)
    passed = false
  }

  // 3. Test Monotonic Spend Exhaustion
  console.log("\n[Test 3] Testing Hard Spend Exhaustion...")
  const budgetWorker = await mesh.spawn({
    task: "Budget strict worker",
    capabilities: ["sandbox"],
    budget: 0.05,
  })

  const deduct1 = budgetWorker.deductSpend(0.04)
  const deduct2 = budgetWorker.deductSpend(0.04)

  if (deduct1 === true && deduct2 === false) {
    console.log("  ✓ Spend strictly prevented from exceeding configured budget ceiling")
  } else {
    console.error("  ✗ Budget ceiling breached!")
    passed = false
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL FAILURE SCENARIOS RESILIENT" : "TESTS FAILED"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("failure.test")) {
  runFailureTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
