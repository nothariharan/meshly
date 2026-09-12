# Meshly

The operating system for autonomous workers.

Agents reason.
Meshly governs execution.
Solari provides the environment.

## Install

```bash
npm install -g meshly
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

## From this repo

Packages are not on npm yet. From a clone:

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
npm install -g ./dist/npm/meshly-0.1.0.tgz ./dist/npm/meshly-cli-0.1.0.tgz ./dist/npm/meshly-core-0.1.0.tgz ./dist/npm/meshly-sdk-0.1.0.tgz ./dist/npm/meshly-solari-0.1.0.tgz ./dist/npm/meshly-console-0.1.0.tgz
```

## Honesty

- Live Solari is the default when you connect a key. Failures surface. No silent simulator fallback.
- `meshly simulate` / `meshly benchmark` are scheduler simulations, not live Solari capacity tests.
- SHA-256 on a run is tamper-evident execution evidence. It does not prove the observation is true.

## License

MIT
