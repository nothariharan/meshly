/**
 * Real Meshly execution benchmark results.
 *
 * Source:   simulator (deterministic local fabric — not live Solari)
 * Command:  meshly benchmark --suite execution
 * Seed:     20260915
 * Trials:   100 per scenario (1520 trials total)
 * Generated from `.meshly/benchmarks/execution-latest.md`. Do not hand-edit.
 *
 * Regenerate, then replace these numbers. Never mix simulator and Solari runs.
 */

export interface BenchmarkRow {
  metric: string
  detail?: string
  direct: string
  meshly: string
  /** Lower is better / direct is unsafe. */
  hazard?: boolean
  good?: boolean
}

export const BENCHMARK_META = {
  source: "simulator",
  seed: 20260915,
  trials: 100,
  command: "meshly benchmark --suite execution",
} as const

export const BENCHMARK_HEADLINE: BenchmarkRow[] = [
  { metric: "Task success", detail: "normal execution", direct: "100%", meshly: "100%", good: true },
  { metric: "False commits", detail: "reality divergence", direct: "100%", meshly: "0%", hazard: true },
  { metric: "Duplicate side effects", detail: "timeout & retry", direct: "5 – 25", meshly: "0", hazard: true },
  { metric: "Recovery without duplicate work", detail: "environment crash", direct: "0%", meshly: "100%", good: true },
]

export const BENCHMARK_ROWS: BenchmarkRow[] = [
  { metric: "Task success", detail: "normal multi-surface task", direct: "100%", meshly: "100%" },
  { metric: "False commits", detail: "reality divergence", direct: "100%", meshly: "0%", hazard: true },
  { metric: "Duplicate side effects", detail: "ambiguous timeout", direct: "5", meshly: "0", hazard: true },
  { metric: "Duplicate side effects", detail: "environment loss & recovery", direct: "2", meshly: "0", hazard: true },
  { metric: "Duplicate side effects", detail: "runaway retry loop", direct: "25", meshly: "0", hazard: true },
  { metric: "Unauthorized actions", detail: "reaching execution", direct: "2", meshly: "0", hazard: true },
  { metric: "Budget violations", detail: "runaway retries", direct: "100%", meshly: "0%", hazard: true },
  { metric: "Lost progress", detail: "steps re-run after loss", direct: "2", meshly: "0", hazard: true },
  { metric: "Workers completed", detail: "scarce environment pool (contention)", direct: "75 / 425 (18%)", meshly: "425 / 425 (100%)" },
  { metric: "Governance overhead", detail: "median latency delta", direct: "0 ms", meshly: "+1 ms" },
] as const

