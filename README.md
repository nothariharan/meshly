<p align="center">
  <a href="https://meshly-six.vercel.app">
    <img src="logo.png" alt="" width="96" />
  </a>
</p>

<p align="center">
  <img src="text_logo.png" alt="Meshly" width="300" />
</p>

<p align="center">
  <strong>The operating system for autonomous workers.</strong><br />
  Agents reason. Meshly governs execution. Solari provides the environment.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nothariharan/meshly"><img src="https://img.shields.io/npm/v/@nothariharan/meshly?style=flat-square&label=npm&color=18181b&labelColor=09090b" alt="npm" /></a>
  <a href="https://meshly-six.vercel.app"><img src="https://img.shields.io/badge/site-meshly-18181b?style=flat-square&labelColor=09090b" alt="Website" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-18181b?style=flat-square&labelColor=09090b" alt="Node.js 20 or newer" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-18181b?style=flat-square&labelColor=09090b" alt="MIT License" /></a>
</p>

<br />

A run passes through policy, authority, and limits, then into Browser, Sandbox, or Desktop. Meshly reads the world back and returns one of three results.

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>VERIFIED</strong><br />
      The observed world matches the claim. The run can commit.
    </td>
    <td width="33%" valign="top">
      <strong>BLOCKED</strong><br />
      The agent and the world disagree. The commit stays held.
    </td>
    <td width="33%" valign="top">
      <strong>UNKNOWN</strong><br />
      A side effect may have landed. Retry stays held until an independent check.
    </td>
  </tr>
</table>

## Install

Node.js 20 or newer. A Solari API key is required for a live run.

```bash
npm install -g @nothariharan/meshly
meshly init --api-key <your Solari key>
meshly doctor
meshly run
meshly dev
```

<table>
  <tr>
    <td width="20%" align="center"><strong>01</strong><br />Install</td>
    <td width="20%" align="center"><strong>02</strong><br />Connect Solari</td>
    <td width="20%" align="center"><strong>03</strong><br />Create a worker</td>
    <td width="20%" align="center"><strong>04</strong><br />Run it</td>
    <td width="20%" align="center"><strong>05</strong><br />Open the console</td>
  </tr>
</table>

`meshly dev` serves the operator console at [http://localhost:3400](http://localhost:3400).

`meshly mcp` uses Solari when `SOLARI_API_KEY` is set. A project previously initialized with `--provider simulator` does not change that. Pass `--simulator` when you mean the local kernel:

```bash
meshly init --provider simulator --yes
meshly doctor --simulator
npx -y @nothariharan/meshly mcp --simulator
```

## Console

```bash
meshly dev
```

Open Worker, then Run, then Environment, then Evidence.

```text
AUTHORIZE  →  EXECUTE  →  OBSERVE  →  VERIFY  →  COMMIT
```

When the world state is unknown, Meshly holds the retry.

```text
UNKNOWN
Side effect may have occurred.
Retry blocked.

Independent verification
World state confirmed
VERIFIED
```

When the agent and the world disagree:

```text
Agent claim      SUCCESS
Tool execution   SUCCESS
World state      MISMATCH
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

Solari sessions stay inside Meshly.

```ts
if (run.status === "UNKNOWN") {
  await run.verify()
}
```

UNKNOWN is a held side effect, separate from FAILED. Verification checks the world again and leaves the original action in place. See [docs/concepts/unknown.md](docs/concepts/unknown.md).

The canonical worker is [examples/reconciliation-worker](examples/reconciliation-worker).

## Benchmark

Same model. Same task. Same starting state. The variable is whether Meshly governs the execution. Ground truth is read from the world.

```bash
meshly benchmark --suite execution
```

These figures are from the local simulator (`source: simulator`, seed `20260915`). They are recorded separately from any live Solari run.

| | Direct | Meshly |
| --- | ---: | ---: |
| False commits | 100% | 0% |
| Duplicate side effects | 5 | 0 |
| Unauthorized actions | 2 | 0 |
| Budget violations | 100% | 0% |

Method, scenarios, and limits: [docs/benchmark.md](docs/benchmark.md).

## From this repo

```bash
npm install
npm run build
npm run meshly -- init --yes --provider simulator
npm run meshly -- doctor --simulator
npm run meshly -- run
npm run meshly -- dev
```

To install the built package on another machine:

```bash
npm run pack:local
```

The install command is written to `dist/npm/INSTALL.txt`.

## Honesty

| | |
| --- | --- |
| **Live runs** | A missing Solari key fails closed. Live execution requires `SOLARI_API_KEY`. |
| **Simulator** | `meshly simulate` and `meshly benchmark` exercise the scheduler. They are separate from a live Solari capacity test. |
| **SHA-256** | The digest is tamper-evident evidence of the stored bundle. It records what was written. It does not certify that the observation is true. |

## License

[MIT](LICENSE)
