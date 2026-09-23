# Meshly

The operating system for autonomous workers.

Agents reason.
Meshly governs execution.
Solari provides the environment.

## Install

```bash
npm install -g @nothariharan/meshly
meshly init
meshly doctor
meshly run
meshly dev
```

`meshly init` needs a Solari API key (`--api-key` or `SOLARI_API_KEY`). Meshly will not silently fall back to a simulator.

```text
install
  ↓
connect Solari
  ↓
create worker
  ↓
run worker
  ↓
open console
```

## Console

```bash
meshly dev                 # http://localhost:3400
```

Click Worker → Run → Environment → Evidence.

```text
AUTHORIZE → EXECUTE → OBSERVE → VERIFY → COMMIT
```

If the world state is unknown, Meshly does not retry.

```text
⚠ UNKNOWN
Side effect may have occurred.
Retry blocked.

Independent verification
World state confirmed

VERIFIED
```

If the agent and the world disagree:

```text
Agent claim     SUCCESS
Tool execution  SUCCESS
World state     MISMATCH

COMMIT BLOCKED
```

```bash
meshly demo unknown
meshly demo blocked
```

## SDK

```ts
import { Meshly } from "@meshly/sdk"

const mesh = new Meshly({
  solariApiKey: process.env.SOLARI_API_KEY,
})

const worker = await mesh.workers.spawn({
  task: "Reconcile today's payments with the ERP",
  kind: "reconciliation",
  capabilities: ["browser", "sandbox", "desktop"],
})

const run = await worker.run()
await run.pause()
await run.resume()
await run.verify()
await run.cancel()
```

You should not have to manage Solari sessions yourself.

```ts
if (run.status === "UNKNOWN") {
  await run.verify()
}
```

UNKNOWN does not mean FAILED. Verification does not retry the side effect. See [docs/concepts/unknown.md](docs/concepts/unknown.md).

The canonical worker is [examples/reconciliation-worker](examples/reconciliation-worker).

## Benchmark

What changes when the same agent is placed behind Meshly?

```bash
meshly benchmark --suite execution
```

Same model. Same task. Same environments. Same starting state. The only
variable is whether Meshly governs the execution. Ground truth is read from the
world, never from the model's claim.

```text
REALITY DIVERGENCE     DIRECT   MESHLY
False commits           100%      0%

AMBIGUOUS TIMEOUT
Duplicate side effects     5       0

AUTHORITY VIOLATION
Unauthorized actions       2       0

RUNAWAY RETRIES
Budget violations       100%      0%
```

Full method, scenarios, and honest limitations: [docs/benchmark.md](docs/benchmark.md).
Results are labelled `simulator` or `solari` and are never mixed.

## Install from npm

```bash
npm install -g @nothariharan/meshly
meshly init --api-key <your Solari key>
meshly doctor
meshly run
meshly dev
```

`meshly mcp` uses Solari when `SOLARI_API_KEY` is set. Pass `--simulator` when you mean the local kernel. A project previously initialized with `--provider simulator` does not change `meshly mcp`.

## From this repo

```bash
npm install
npm run build
npm run meshly -- init --yes --provider simulator
npm run meshly -- doctor --simulator
npm run meshly -- run
npm run meshly -- dev
```

To install on a machine that has never seen this repo, without publishing:

```bash
npm run pack:local
```

The exact install command is written to `dist/npm/INSTALL.txt`.

## Honesty

- Live Solari is the default when you connect a key. Failures surface. No silent simulator fallback.
- `meshly simulate` / `meshly benchmark` are scheduler simulations, not live Solari capacity tests.
- SHA-256 on a run is tamper-evident execution evidence. It does not prove the observation is true.

## License

MIT
