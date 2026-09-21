# Meshly Autonomous Execution Benchmark

> What changes when the same autonomous agent is placed behind Meshly?

This benchmark compares two **product models**, not two implementations:

```
DIRECT AGENT                              MESHLY
Cursor / Claude / GPT                     Cursor / Claude / GPT
        ↓                                         ↓
  tools directly                          Meshly Worker
        ↓                                         ↓
Browser / Sandbox / Desktop        policy / authority / limits
        ↓                                         ↓
      result                        Browser / Sandbox / Desktop
                                              ↓
                                        observation
                                              ↓
                                  independent verification
                                              ↓
                                  VERIFIED / BLOCKED / UNKNOWN
```

Same model. Same task. Same environments. Same starting state.
The only variable is **whether Meshly governs the execution**.

## Run it

```bash
meshly benchmark --suite execution
```

```bash
# repeatable, smaller run
meshly benchmark --suite execution --trials 25 --seed 20260915

# one hazard at a time
meshly benchmark --suite execution --scenarios reality_divergence,ambiguous_timeout

# lower-level scheduler stress simulation (unchanged, unrelated to this suite)
meshly benchmark --suite scheduler --workers 1000
```

Outputs, under `.meshly/benchmarks/`:

```
execution-simulator-<timestamp>.json        aggregate report + every raw trial
execution-simulator-<timestamp>-raw.csv     one row per trial (for spreadsheets)
execution-simulator-<timestamp>.md          the tables below
execution-latest.md                         convenience copy
```

`meshly benchmark` is also a regression suite: `npm test` runs the benchmark
contract (suite 13) and fails if the governed model ever false-commits,
duplicates a side effect, dispatches an unauthorized action, or blows budget.

## Method

- **Fixed seed.** Every trial's seed is derived from
  `(suite seed, scenario, mode, trial index)`. The same seed reproduces the
  same fault placement and the same result set.
- **Objective ground truth.** A run's "claimed success" is recorded, but the
  score is read from a **world journal** written by the execution fabric. A
  claim is never accepted as evidence. `falseCommits` counts claimed success
  where the world disagrees.
- **Identical program.** Both arms resolve the *same* step list from the same
  program source (`resolveProgram` in `@meshly/core`). The direct arm iterates
  those steps with the shipped tool dispatcher; the Meshly arm runs them
  through `Meshly.spawn(...).run()`.
- **Labelled by source.** Simulator results and real Solari results are never
  mixed. This report is `source: simulator`. A live run is a separate artifact
  with its own label.
- **No fabricated overhead.** The "successful task" scenario injects nothing.
  If governance costs nothing to observe, the report says so.

### Fault injection

The direct arm is deliberately naive and realistic about it:

| Situation | Direct agent behaviour |
| --- | --- |
| Action outcome UNKNOWN | Retry the same action (`--retries`, 5 by default; 25 for the runaway case) |
| Environment lost | Restart the whole program on a fresh environment (context is not checkpointed) |
| Policy violation | No policy exists; the action dispatches |
| Runaway spend | No runtime ceiling; it runs until the harness stops it |

The Meshly arm uses the shipped runtime with no benchmark-specific behaviour.

## Scenarios

| Scenario | Hazard |
| --- | --- |
| Successful task | A normal three-surface task. Does governance destroy performance? |
| Reality divergence | Agent and tool report success; the world disagrees. |
| Ambiguous timeout | The side effect lands; the result never returns. |
| Environment loss | The desktop dies before the step is dispatched. |
| Authority violation | The task needs tools outside the worker's granted authority. |
| Runaway retries | A thrashing agent retries an unknown outcome. |
| Concurrent contention | Many workers, a scarce environment pool. |

## Results — simulator

Source `simulator`, seed `20260915`, 100 trials per scenario, 1520 trials total.
Regenerate with `meshly benchmark --suite execution`.

| Scenario | Metric | Direct | Meshly |
| --- | --- | ---: | ---: |
| Successful task | Correct final state | 100% | 100% |
| Successful task | Median latency | 0 ms | 1 ms |
| Successful task | Mean tool calls | 3 | 3 |
| Reality divergence | **False commits** | **100%** | **0%** |
| Ambiguous timeout | **Duplicate side effects (mean)** | **5** | **0** |
| Ambiguous timeout | UNKNOWN resolved by verification | 0% | 100% |
| Ambiguous timeout | Mean tool calls | 6 | 1 |
| Environment loss | **Duplicate side effects (mean)** | **2** | **0** |
| Environment loss | Lost progress (steps re-run) | 2 | 0 |
| Environment loss | Mean environments created | 6 | 4 |
| Authority violation | **Unauthorized actions reaching execution (mean)** | **2** | **0** |
| Runaway retries | **Budget violations** | **100%** | **0%** |
| Runaway retries | Duplicate side effects (mean) | 25 | 0 |
| Runaway retries | Mean tool calls | 26 | 1 |
| Concurrent contention | **Workers completed** | **75 / 425** | **425 / 425** |
| Concurrent contention | Failed allocations per completion | 4.67 | 3.29 |

The claim this supports:

> Meshly does not try to make every task faster. It changes the behaviour of
> autonomous execution when state, failure, and consequences matter — and it
> costs nothing measurable on the straightforward path.

## Honest limitations

- **Simulator, not Solari.** These numbers come from the deterministic local
  fabric, not live cloud sessions. They measure the *execution model*, not
  Solari capacity. A live run must be produced and labelled separately before
  any live claim is made.
- **Faults are injected by the harness.** Reality divergence, timeouts, and
  environment loss are controlled knobs, not observed production incidents.
  That is what makes the comparison repeatable.
- **The direct arm is a model of a naive agent.** It is the common
  "call the tool, believe the result" loop. A more careful direct agent could
  add its own verification; the point is that Meshly makes it the default and
  enforces it at the runtime boundary.
- **Contention is bounded by the environment pool**, and the Meshly arm is
  driven with a waiting/resume loop because the runtime's worker cap otherwise
  rejects new work outright. Allocation retries are normalised per completed
  worker for a fair comparison.
- **Latency is sub-millisecond** on the simulator, so "median latency" mostly
  shows that nothing is added, not a precise cost. Live Solari latency is a
  different measurement.

## What would falsify this

- A reality-divergence run where Meshly reports success.
- An ambiguous-timeout run where Meshly retries and duplicates the side effect.
- An unauthorized action that reaches a Meshly-dispatched tool.
- A governed run that exceeds its configured budget.
- Real Solari numbers that contradict the simulator's direction.
