# Meshly

The operating system for autonomous workers.

Agents reason.
Meshly governs execution.
Solari provides the environment.

## Install

```bash
npm install -g meshly
meshly init
```

From this repo (packages are not on npm yet):

```bash
npm install
npm run meshly -- init --yes --provider simulator
npm run meshly -- run invoice-reconciler --simulator
npm run meshly -- dev
```

## Quickstart

```text
Connect Solari
     ↓
Create worker
     ↓
Run worker
     ↓
Open console
     ↓
See real execution
```

```bash
meshly init
meshly run invoice-reconciler
meshly dev                 # http://localhost:3400
```

## Console

Click Worker → Run → Environment → Evidence.

```text
AUTHORIZE → EXECUTE → OBSERVE → VERIFY → COMMIT
```

If the world state is unknown, Meshly does not retry.

```text
✓ Intent
✓ Authorized
✓ Dispatched
⚠ UNKNOWN
Side effect may have occurred.
Retry blocked pending verification.
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

## Packages

The user installs Meshly. Internals:

| Package | Role |
|---|---|
| `meshly` | CLI / main entry |
| `@meshly/sdk` | Developer SDK |
| `@meshly/core` | Runtime internals |
| `@meshly/solari` | Solari execution adapter |
| `@meshly/console` | Operator console (`meshly dev`) |

Not published yet. Architecture notes live in [`docs/`](docs/). Frozen API: [`docs/api.md`](docs/api.md).

## Honesty

- Live Solari is the default when `SOLARI_API_KEY` is set. Failures surface. No silent simulator fallback.
- `meshly simulate` / `meshly benchmark` are scheduler simulations, not live Solari capacity tests.
- SHA-256 on a run is tamper-evident execution evidence. It does not prove the observation is true.

## License

MIT
