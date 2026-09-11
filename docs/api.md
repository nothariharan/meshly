# Frozen API

v0.1 of Meshly is a usable runtime. This surface is frozen.

Anything that does not reinforce this model needs a very good reason to enter core.

## Mental model

```text
Meshly
 ├── Workers
 ├── Runs
 ├── Environments
 ├── Policies
 └── Events
```

## Developer API

```ts
import { Meshly } from "@meshly/sdk"

const mesh = new Meshly({ solariApiKey: process.env.SOLARI_API_KEY })

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

That is the product. Agents reason. Meshly governs execution. Solari provides the environment.

## Lifecycle

```text
Worker → Run → Environment → Execution → Verification → Commit
```

A run is not success/failure. Meshly understands:

```text
success
failure
unknown
```

`UNKNOWN` means the action was dispatched, the response disappeared, and world state is unverified. Meshly does not retry. It verifies reality.

## Operational limits

Every worker has hard caps:

- max execution cost
- max duration
- max environments
- max retries
- max concurrent workers (runtime)
- max tool calls

The console shows spend, duration, and environment counts against those caps.

## MCP

Other agents operate Meshly. They do not talk to Solari directly.

```text
meshly_create_worker
meshly_run
meshly_get_run
meshly_verify
meshly_pause
meshly_resume
meshly_takeover
```

## What does not belong in core

New kernel concepts, additional workflow engines, or agent frameworks.

From this point onward, every feature must make Meshly easier to use, make a worker safer to run, or make the execution lifecycle more observable.

Deeper architecture lives in `docs/architecture.md` and `docs/product.md`.
