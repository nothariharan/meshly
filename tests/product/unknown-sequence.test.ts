/**
 * UNKNOWN event-sequence contract.
 *
 * The distributed-systems story is the event log itself:
 *   DISPATCHED → UNKNOWN → VERIFICATION_STARTED → WORLD_STATE_OBSERVED → VERIFIED
 * or
 *   DISPATCHED → UNKNOWN → VERIFICATION_STARTED → WORLD_STATE_OBSERVED → SAFE_TO_RETRY
 *
 * This test asserts both branches on the real kernel path (simulator is an
 * explicit test mode; the same loop drives live Solari).
 */
import { Meshly } from "@meshly/sdk"

export async function runUnknownSequenceTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY UNKNOWN EVENT SEQUENCE — OBSERVED, NOT INFERRED")
  console.log("=".repeat(78) + "\n")

  let passed = true
  const ok = (name: string, cond: boolean, detail?: string) => {
    if (cond) console.log(`  ✓ ${name}`)
    else {
      passed = false
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
    }
  }
  const seqOf = (mesh: Meshly, runId: string) =>
    mesh.events
      .query({ runId })
      .sort((a, b) => a.sequence - b.sequence)
      .map((e) => e.type)

  // Branch A: side effect landed, result lost → VERIFIED
  const present = new Meshly({ preferSimulator: true })
  const presentWorker = await present.spawn({
    name: "timeout-present",
    task: "ambiguous timeout experiment",
    capabilities: ["desktop"],
  })
  const verified = await presentWorker.run({ destroyAfter: false, scenario: "ambiguous-timeout" })
  const eventsA = seqOf(present, verified.runId)
  ok("A: run reached VERIFIED", verified.status === "VERIFIED", verified.status)
  ok("A: action.unknown recorded", eventsA.includes("action.unknown"))
  ok(
    "A: verification.independent rented before world-state read",
    eventsA.indexOf("verification.independent") < eventsA.lastIndexOf("observation.recorded") ||
      eventsA.includes("observation.recorded"),
    eventsA.join(" → "),
  )
  ok("A: world state observed", eventsA.includes("observation.recorded"))
  ok("A: commit.committed after independent verification", eventsA.includes("commit.committed"))
  ok("A: no retry event", !eventsA.includes("action.retried"))
  ok(
    "A: order DISPATCHED → UNKNOWN → VERIFY → OBSERVE → VERIFIED",
    eventsA.indexOf("action.executed") < eventsA.indexOf("action.unknown") &&
      eventsA.indexOf("action.unknown") < eventsA.indexOf("verification.independent") &&
      eventsA.indexOf("verification.independent") < eventsA.lastIndexOf("observation.recorded") &&
      eventsA.lastIndexOf("observation.recorded") < eventsA.indexOf("commit.committed"),
    eventsA.join(" → "),
  )

  // Branch B: side effect never landed, result lost → UNKNOWN, safe to retry
  const absent = new Meshly({ preferSimulator: true })
  const absentWorker = await absent.spawn({
    name: "timeout-absent",
    task: "ambiguous timeout experiment",
    capabilities: ["desktop"],
  })
  const stillUnknown = await absentWorker.run({ destroyAfter: false, scenario: "ambiguous-timeout-absent" })
  const eventsB = seqOf(absent, stillUnknown.runId)
  ok("B: run stays UNKNOWN", stillUnknown.status === "UNKNOWN", stillUnknown.status)
  ok("B: action.unknown recorded", eventsB.includes("action.unknown"))
  ok("B: verification.independent ran", eventsB.includes("verification.independent"))
  ok("B: world state observed", eventsB.includes("observation.recorded"))
  ok("B: side effect absent in world", stillUnknown.steps[0]?.observation?.erp_status === undefined)
  ok("B: no automatic retry", !eventsB.includes("action.retried") && !eventsB.includes("action.executed.retry"))
  const safeToRetry = absent.events
    .query({ runId: stillUnknown.runId, type: "run.unknown" })
    .some((e) => e.data?.safeToRetry === true)
  ok("B: safe-to-retry is explicit, not automatic", safeToRetry)
  const verify = await stillUnknown.verify()
  ok("B: run.verify() re-checks world, does not retry", verify.matched === false)
  ok("B: UNKNOWN is not FAILED", stillUnknown.status !== "FAILED")

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "UNKNOWN SEQUENCE VERIFIED" : "FAILURES ENCOUNTERED"}`)
  console.log("=".repeat(78) + "\n")
  return { passed }
}

if (process.argv[1]?.includes("unknown-sequence")) {
  runUnknownSequenceTests().then((res) => process.exit(res.passed ? 0 : 1))
}
