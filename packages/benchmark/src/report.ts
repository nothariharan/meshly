/**
 * Report rendering. One command, three artifacts: terminal, Markdown, raw CSV.
 */
import fs from "node:fs"
import path from "node:path"
import type { ExecutionBenchmarkReport, ModeSummary, TrialResult } from "./types.js"

export function formatTerminal(report: ExecutionBenchmarkReport): string {
  const lines: string[] = []
  lines.push("")
  lines.push("=".repeat(74))
  lines.push(" MESHLY EXECUTION BENCHMARK")
  lines.push(` source: ${report.source}   trials/scenario: ${report.scenarios[0]?.trials ?? 0}   seed: ${report.seed}   sessions: ${report.sessionsCreated}`)
  lines.push(" Same model. Same task. Same environments. Same starting state.")
  lines.push(" The only variable: whether Meshly governs the execution.")
  lines.push("=".repeat(74))

  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct
    const m = scenario.modes.meshly
    lines.push("")
    lines.push(` ${scenario.title.toUpperCase()}  (${scenario.trials} trials)`)
    lines.push(` ${scenario.description}`)
    lines.push(` truth: ${scenario.truthDetail}`)
    lines.push("")
    lines.push(`   ${"".padEnd(30)} ${"DIRECT".padStart(12)} ${"MESHLY".padStart(12)}`)
    lines.push(`   ${"-".repeat(56)}`)
    const batch = d.unitsRequested > d.trials || m.unitsRequested > m.trials
    lines.push(row("Task success", pct(d.successRate), pct(m.successRate)))
    lines.push(row("Correct final state", pct(d.correctFinalStateRate), pct(m.correctFinalStateRate)))
    if (batch) {
      lines.push(row("Workers completed", `${d.unitsCompleted}/${d.unitsRequested}`, `${m.unitsCompleted}/${m.unitsRequested}`))
      lines.push(row("Env / completed worker", per(num(d.environmentsPerCompletion), d.unitsCompleted), per(num(m.environmentsPerCompletion), m.unitsCompleted)))
      lines.push(row("Failed alloc / completion", per(num(d.failedAllocationsPerCompletion), d.unitsCompleted), per(num(m.failedAllocationsPerCompletion), m.unitsCompleted)))
      lines.push(row("Spend / completed worker", per(usd(d.spendPerCompletion), d.unitsCompleted), per(usd(m.spendPerCompletion), m.unitsCompleted)))
    }
    lines.push(row("False commits", pct(d.falseCommitRate), pct(m.falseCommitRate)))
    lines.push(row("Duplicate side effects", num(d.meanDuplicateSideEffects), num(m.meanDuplicateSideEffects)))
    lines.push(row("Unauthorized actions", num(d.meanUnauthorizedActions), num(m.meanUnauthorizedActions)))
    lines.push(row("Recovered from loss", pct(d.recoveryRate), pct(m.recoveryRate)))
    lines.push(row("Lost progress (steps)", num(d.meanLostProgressSteps), num(m.meanLostProgressSteps)))
    lines.push(row("UNKNOWN resolved", pct(d.unknownResolutionRate), pct(m.unknownResolutionRate)))
    lines.push(row("Budget violations", pct(d.budgetViolationRate), pct(m.budgetViolationRate)))
    lines.push(row("Median latency", ms(d.medianLatencyMs), ms(m.medianLatencyMs)))
    lines.push(row("Mean tool calls", num(d.meanToolCalls), num(m.meanToolCalls)))
    lines.push(row("Mean spend", usd(d.meanSpendUsd), usd(m.meanSpendUsd)))
    if (!batch) {
      lines.push(row("Environments created", num(d.meanEnvironmentsCreated), num(m.meanEnvironmentsCreated)))
      lines.push(row("Failed allocations", num(d.meanFailedAllocations), num(m.meanFailedAllocations)))
    }
    if (scenario.governanceOverheadMs !== 0) {
      const sign = scenario.governanceOverheadMs > 0 ? "+" : ""
      lines.push(
        `   ${"governance latency delta".padEnd(30)} ${"".padStart(12)} ${`${sign}${scenario.governanceOverheadMs}ms`.padStart(12)}`,
      )
    }
  }

  lines.push("")
  lines.push("=".repeat(74))
  lines.push(" SOURCE")
  for (const note of report.notes) lines.push(`  · ${note}`)
  lines.push("=".repeat(74))
  lines.push("")
  return lines.join("\n")
}

function row(label: string, direct: string, meshly: string): string {
  return `   ${label.padEnd(30)} ${direct.padStart(12)} ${meshly.padStart(12)}`
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function ms(value: number): string {
  return `${value}ms`
}

function usd(value: number): string {
  return `$${value.toFixed(4)}`
}

/** Per-completion metrics are only meaningful if something completed. */
function per(value: string, completed: number): string {
  return completed > 0 ? value : "n/a"
}

export function formatMarkdown(report: ExecutionBenchmarkReport): string {
  const lines: string[] = []
  lines.push("# Meshly Autonomous Execution Benchmark")
  lines.push("")
  lines.push(`- **Source:** \`${report.source}\``)
  lines.push(`- **Generated:** ${report.generatedAt}`)
  lines.push(`- **Seed:** ${report.seed}`)
  lines.push(`- **Trials per scenario:** ${report.scenarios[0]?.trials ?? 0}`)
  lines.push(`- **Environments provisioned:** ${report.sessionsCreated}`)
  lines.push("")
  lines.push("Same model. Same task. Same environments. Same starting state.")
  lines.push("The only variable is whether Meshly governs the execution.")
  lines.push("")
  lines.push("Ground truth is read from the world journal, never from either model's claim.")
  lines.push("")
  lines.push("## Headline")
  lines.push("")
  lines.push("| Scenario | Metric | Direct | Meshly |")
  lines.push("| --- | --- | ---: | ---: |")
  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct
    const m = scenario.modes.meshly
    lines.push(`| ${scenario.title} | False commits | ${pct(d.falseCommitRate)} | ${pct(m.falseCommitRate)} |`)
    lines.push(`| ${scenario.title} | Duplicate side effects (mean) | ${num(d.meanDuplicateSideEffects)} | ${num(m.meanDuplicateSideEffects)} |`)
    lines.push(`| ${scenario.title} | Unauthorized actions (mean) | ${num(d.meanUnauthorizedActions)} | ${num(m.meanUnauthorizedActions)} |`)
    lines.push(`| ${scenario.title} | Correct final state | ${pct(d.correctFinalStateRate)} | ${pct(m.correctFinalStateRate)} |`)
    lines.push(`| ${scenario.title} | Median latency | ${ms(d.medianLatencyMs)} | ${ms(m.medianLatencyMs)} |`)
  }
  lines.push("")
  lines.push("## Per scenario")
  for (const scenario of report.scenarios) {
    const d = scenario.modes.direct
    const m = scenario.modes.meshly
    lines.push("")
    lines.push(`### ${scenario.title}`)
    lines.push("")
    lines.push(scenario.description)
    lines.push("")
    lines.push(`_Ground truth:_ ${scenario.truthDetail}`)
    lines.push("")
    lines.push("| Metric | Direct | Meshly |")
    lines.push("| --- | ---: | ---: |")
    lines.push(`| Task success | ${pct(d.successRate)} | ${pct(m.successRate)} |`)
    lines.push(`| Correct final state | ${pct(d.correctFinalStateRate)} | ${pct(m.correctFinalStateRate)} |`)
    lines.push(`| Units completed | ${d.unitsCompleted}/${d.unitsRequested} | ${m.unitsCompleted}/${m.unitsRequested} |`)
    lines.push(`| Environments per completion | ${per(num(d.environmentsPerCompletion), d.unitsCompleted)} | ${per(num(m.environmentsPerCompletion), m.unitsCompleted)} |`)
    lines.push(`| Failed allocations per completion | ${per(num(d.failedAllocationsPerCompletion), d.unitsCompleted)} | ${per(num(m.failedAllocationsPerCompletion), m.unitsCompleted)} |`)
    lines.push(`| Spend per completion | ${per(usd(d.spendPerCompletion), d.unitsCompleted)} | ${per(usd(m.spendPerCompletion), m.unitsCompleted)} |`)
    lines.push(`| False commits | ${pct(d.falseCommitRate)} | ${pct(m.falseCommitRate)} |`)
    lines.push(`| Duplicate side effects | ${num(d.meanDuplicateSideEffects)} | ${num(m.meanDuplicateSideEffects)} |`)
    lines.push(`| Unauthorized actions reaching execution | ${num(d.meanUnauthorizedActions)} | ${num(m.meanUnauthorizedActions)} |`)
    lines.push(`| Recovered from environment loss | ${pct(d.recoveryRate)} | ${pct(m.recoveryRate)} |`)
    lines.push(`| UNKNOWN resolved instead of thrashed | ${pct(d.unknownResolutionRate)} | ${pct(m.unknownResolutionRate)} |`)
    lines.push(`| Budget violations | ${pct(d.budgetViolationRate)} | ${pct(m.budgetViolationRate)} |`)
    lines.push(`| Mean tool calls | ${num(d.meanToolCalls)} | ${num(m.meanToolCalls)} |`)
    lines.push(`| Mean retries | ${num(d.meanRetries)} | ${num(m.meanRetries)} |`)
    lines.push(`| Median latency | ${ms(d.medianLatencyMs)} | ${ms(m.medianLatencyMs)} |`)
    lines.push(`| p95 latency | ${ms(d.p95LatencyMs)} | ${ms(m.p95LatencyMs)} |`)
    lines.push(`| Mean spend | ${usd(d.meanSpendUsd)} | ${usd(m.meanSpendUsd)} |`)
    lines.push(`| Mean environments created | ${num(d.meanEnvironmentsCreated)} | ${num(m.meanEnvironmentsCreated)} |`)
    lines.push(`| Mean failed allocations | ${num(d.meanFailedAllocations)} | ${num(m.meanFailedAllocations)} |`)
    lines.push(`| Mean lost progress (steps) | ${num(d.meanLostProgressSteps)} | ${num(m.meanLostProgressSteps)} |`)
  }
  lines.push("")
  lines.push("## Notes")
  lines.push("")
  for (const note of report.notes) lines.push(`- ${note}`)
  lines.push("")
  return lines.join("\n") + "\n"
}

export function toCsv(trials: TrialResult[]): string {
  const columns: Array<keyof TrialResult> = [
    "scenario",
    "mode",
    "trial",
    "seed",
    "status",
    "claimedSuccess",
    "correctFinalState",
    "falseCommit",
    "duplicateSideEffects",
    "unauthorizedActionsExecuted",
    "recoveredFromLoss",
    "unknownResolved",
    "budgetViolation",
    "toolCalls",
    "retries",
    "spendUsd",
    "latencyMs",
    "environmentsCreated",
    "environmentReuses",
    "orphanEnvironments",
    "failedAllocations",
    "peakConcurrentEnvironments",
    "lostProgressSteps",
    "error",
  ]
  const header = columns.join(",")
  const rows = trials.map((trial) =>
    columns
      .map((column) => {
        const value = (trial as any)[column]
        if (value === undefined || value === null) return ""
        const text = String(value)
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      })
      .join(","),
  )
  return [header, ...rows].join("\n") + "\n"
}

export interface WrittenReport {
  dir: string
  json: string
  csv: string
  markdown: string
  latest: string
}

export function writeReport(
  report: ExecutionBenchmarkReport,
  trials: TrialResult[],
  outputDir: string,
): WrittenReport {
  fs.mkdirSync(outputDir, { recursive: true })
  const stamp = report.generatedAt.replace(/[:.]/g, "-")
  const base = `execution-${report.source}-${stamp}`
  const json = path.join(outputDir, `${base}.json`)
  const csv = path.join(outputDir, `${base}-raw.csv`)
  const markdown = path.join(outputDir, `${base}.md`)
  const latest = path.join(outputDir, "execution-latest.md")

  fs.writeFileSync(json, JSON.stringify({ report, trials }, null, 2))
  fs.writeFileSync(csv, toCsv(trials))
  const md = formatMarkdown(report)
  fs.writeFileSync(markdown, md)
  fs.writeFileSync(latest, md)

  return { dir: outputDir, json, csv, markdown, latest }
}

export function summarizeLine(summary: ModeSummary): string {
  return `${summary.unitsCompleted}/${summary.unitsRequested} completed, ${summary.meanDuplicateSideEffects} dup, ${summary.medianLatencyMs}ms`
}

export type { ModeSummary }
