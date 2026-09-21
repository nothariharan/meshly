/**
 * @meshly/benchmark
 *
 * The Meshly Autonomous Execution Benchmark.
 *
 * Same model. Same task. Same environments. Same starting state.
 * The only variable is whether Meshly governs the execution.
 *
 *   import { runExecutionBenchmark } from "@meshly/benchmark"
 *   const { report, trials } = await runExecutionBenchmark({ trials: 100 })
 */
export type {
  BenchmarkMode,
  BenchmarkOptions,
  ExecutionBenchmarkReport,
  ModeSummary,
  ScenarioId,
  ScenarioReport,
  TruthKind,
  TrialResult,
} from "./types.js"

export { runExecutionBenchmark, summarize, LIVE_SAFE_SCENARIOS, type EngineOptions, type ExecutionTrialReport } from "./engine.js"
export { SCENARIOS, SCENARIO_ORDER, type ScenarioSpec } from "./scenarios.js"
export { BenchmarkFabric, type FabricFault, type FabricStats, type WriteRecord } from "./fabric.js"
export { runDirectAgent, costFor, type DirectOptions, type DirectResult } from "./direct.js"
export { runMeshlyWorker, type MeshlyOptions } from "./meshly-runner.js"
export { createRng, deriveSeed, type Rng } from "./rng.js"
export {
  formatTerminal,
  formatMarkdown,
  toCsv,
  writeReport,
  type WrittenReport,
} from "./report.js"

import { runExecutionBenchmark, type EngineOptions, type ExecutionTrialReport } from "./engine.js"
import { writeReport, formatTerminal, type WrittenReport } from "./report.js"
import { SCENARIO_ORDER } from "./scenarios.js"
import type { BenchmarkOptions, ScenarioId } from "./types.js"

export interface ExecutionBenchmarkOutcome extends ExecutionTrialReport {
  written: WrittenReport
  terminal: string
}

/**
 * One call: run the benchmark, render it, and write JSON + CSV + Markdown.
 * Used by `meshly benchmark --suite execution`.
 */
export async function runExecutionBenchmarkSuite(
  options: BenchmarkOptions = {},
  onScenario?: EngineOptions["onScenario"],
): Promise<ExecutionBenchmarkOutcome> {
  const trials = options.trials ?? 100
  const seed = options.seed ?? 20260915
  const scenarioIds: ScenarioId[] = options.scenarios && options.scenarios.length ? options.scenarios : SCENARIO_ORDER

  const result = await runExecutionBenchmark({
    trials,
    seed,
    scenarioIds,
    concurrencyLevels: options.concurrencyLevels ?? [10, 25, 50],
    concurrencyTrips: options.concurrencyTrips ?? 5,
    createFabric: options.createFabric,
    source: options.source,
    maxSessions: options.maxSessions,
    armSettleMs: options.armSettleMs,
    onScenario,
  })

  const outputDir = options.outputDir ?? defaultOutputDir()
  const written = writeReport(result.report, result.trials, outputDir)
  return { ...result, written, terminal: formatTerminal(result.report) }
}

function defaultOutputDir(): string {
  return process.env.MESHLY_BENCHMARK_DIR || `${process.cwd()}/.meshly/benchmarks`
}

export default runExecutionBenchmarkSuite
