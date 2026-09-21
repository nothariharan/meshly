# @meshly/benchmark

The Meshly Autonomous Execution Benchmark.

Same model. Same task. Same environments. Same starting state. The only
variable is whether Meshly governs the execution.

```bash
meshly benchmark --suite execution
```

## Direct use

```ts
import { runExecutionBenchmark } from "@meshly/benchmark"

const { report, trials } = await runExecutionBenchmark({
  trials: 100,
  seed: 20260915,
  scenarioIds: ["reality_divergence", "ambiguous_timeout"],
  concurrencyLevels: [10, 25, 50],
  concurrencyTrips: 5,
})
```

Scenarios: `success`, `reality_divergence`, `ambiguous_timeout`,
`environment_loss`, `authority_violation`, `runaway_retry`,
`concurrent_contention`.

Ground truth is read from a world journal written by the benchmark fabric,
never from either model's claim. Results are labelled `simulator` or `solari`
and are never mixed.

See [docs/benchmark.md](../../docs/benchmark.md).

MIT
