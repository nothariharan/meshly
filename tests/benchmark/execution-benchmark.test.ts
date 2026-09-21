/**
 * Execution benchmark regression suite.
 *
 * These assertions are the benchmark's contract: with the same seed the
 * governed model must not false-commit, must not duplicate side effects, must
 * not dispatch unauthorized actions, and must not blow a budget. The direct
 * model is expected to do all four, which is the whole point of the contrast.
 */
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { runExecutionBenchmark } from "../../packages/benchmark/src/engine.js"
import { writeReport } from "../../packages/benchmark/src/report.js"
import type { ScenarioId } from "../../packages/benchmark/src/types.js"

export async function runExecutionBenchmarkTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY EXECUTION BENCHMARK — DIRECT VS GOVERNED")
  console.log("=".repeat(78) + "\n")

  let passed = true
  const ok = (name: string, cond: boolean, detail?: string) => {
    if (cond) console.log(`  ✓ ${name}`)
    else {
      passed = false
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
    }
  }

  const scenarioIds: ScenarioId[] = [
    "success",
    "reality_divergence",
    "ambiguous_timeout",
    "environment_loss",
    "authority_violation",
    "runaway_retry",
    "concurrent_contention",
  ]

  const { report, trials } = await runExecutionBenchmark({
    trials: 3,
    seed: 4242,
    scenarioIds,
    concurrencyLevels: [10],
    concurrencyTrips: 1,
  })

  const scenario = (id: ScenarioId) => report.scenarios.find((s) => s.id === id)!
  const direct = (id: ScenarioId) => scenario(id).modes.direct
  const meshly = (id: ScenarioId) => scenario(id).modes.meshly

  ok("report labels its source", report.source === "simulator", report.source)
  ok("all scenarios reported", report.scenarios.length === scenarioIds.length)

  ok(
    "success: both models complete with correct final state",
    direct("success").correctFinalStateRate === 1 && meshly("success").correctFinalStateRate === 1,
  )
  ok(
    "success: no governance overhead in the simulator is fabricated",
    direct("success").meanToolCalls === meshly("success").meanToolCalls,
  )

  ok(
    "reality_divergence: direct false-commits",
    direct("reality_divergence").falseCommitRate === 1,
    String(direct("reality_divergence").falseCommitRate),
  )
  ok(
    "reality_divergence: Meshly commits nothing unverified",
    meshly("reality_divergence").falseCommitRate === 0,
    String(meshly("reality_divergence").falseCommitRate),
  )

  ok(
    "ambiguous_timeout: direct duplicates the side effect",
    direct("ambiguous_timeout").meanDuplicateSideEffects > 0,
    String(direct("ambiguous_timeout").meanDuplicateSideEffects),
  )
  ok(
    "ambiguous_timeout: Meshly duplicates nothing",
    meshly("ambiguous_timeout").meanDuplicateSideEffects === 0,
    String(meshly("ambiguous_timeout").meanDuplicateSideEffects),
  )
  ok(
    "ambiguous_timeout: Meshly resolves UNKNOWN by independent verification",
    meshly("ambiguous_timeout").unknownResolutionRate === 1,
    String(meshly("ambiguous_timeout").unknownResolutionRate),
  )

  ok(
    "environment_loss: direct re-runs committed work",
    direct("environment_loss").meanLostProgressSteps > 0,
    String(direct("environment_loss").meanLostProgressSteps),
  )
  ok(
    "environment_loss: Meshly resumes without duplicate work",
    meshly("environment_loss").meanDuplicateSideEffects === 0 && meshly("environment_loss").meanLostProgressSteps === 0,
  )

  ok(
    "authority_violation: direct dispatches unauthorized actions",
    direct("authority_violation").meanUnauthorizedActions > 0,
    String(direct("authority_violation").meanUnauthorizedActions),
  )
  ok(
    "authority_violation: Meshly blocks them before dispatch",
    meshly("authority_violation").meanUnauthorizedActions === 0,
    String(meshly("authority_violation").meanUnauthorizedActions),
  )

  ok(
    "runaway_retry: direct violates the budget",
    direct("runaway_retry").budgetViolationRate === 1,
    String(direct("runaway_retry").budgetViolationRate),
  )
  ok(
    "runaway_retry: Meshly stays within budget",
    meshly("runaway_retry").budgetViolationRate === 0,
    String(meshly("runaway_retry").budgetViolationRate),
  )
  ok(
    "runaway_retry: Meshly halts instead of thrashing",
    meshly("runaway_retry").meanToolCalls < direct("runaway_retry").meanToolCalls,
  )

  ok(
    "contention: Meshly completes every worker under scarcity",
    meshly("concurrent_contention").unitsCompleted === meshly("concurrent_contention").unitsRequested,
    `${meshly("concurrent_contention").unitsCompleted}/${meshly("concurrent_contention").unitsRequested}`,
  )
  ok(
    "contention: direct drops workers on allocation failure",
    direct("concurrent_contention").unitsCompleted < direct("concurrent_contention").unitsRequested,
  )

  const second = await runExecutionBenchmark({
    trials: 3,
    seed: 4242,
    scenarioIds: ["ambiguous_timeout", "reality_divergence"],
    concurrencyLevels: [10],
    concurrencyTrips: 1,
  })
  const firstDirect = trials.filter((t) => t.scenario === "ambiguous_timeout" && t.mode === "direct")
  const secondDirect = second.trials.filter((t) => t.scenario === "ambiguous_timeout" && t.mode === "direct")
  // Latency is environmental; the seed must reproduce the decision, not the clock.
  const fingerprint = (rows: typeof firstDirect) =>
    rows.map(({ latencyMs, ...rest }) => rest)
  ok(
    "same seed reproduces the same trial",
    JSON.stringify(fingerprint(firstDirect)) === JSON.stringify(fingerprint(secondDirect)),
  )
  ok(
    "raw trials are emitted for every scenario and mode",
    trials.length === (scenarioIds.length - 1) * 3 * 2 + 2,
    String(trials.length),
  )

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-benchmark-"))
  const written = writeReport(report, trials, dir)
  ok(
    "report writes JSON, CSV and Markdown",
    fs.existsSync(written.json) && fs.existsSync(written.csv) && fs.existsSync(written.markdown),
  )
  const csv = fs.readFileSync(written.csv, "utf8")
  ok("CSV has a header and raw rows", csv.startsWith("scenario,mode,trial") && csv.split("\n").length > 5)

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "EXECUTION BENCHMARK CONTRACT VERIFIED" : "FAILURES ENCOUNTERED"}`)
  console.log("=".repeat(78) + "\n")
  return { passed }
}
