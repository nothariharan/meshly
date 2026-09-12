# Validation report — v0.1 product-proof sprint

Scope: complete the remaining product-proof gap on top of commit `c8a1366`
("freeze the API and harden Meshly for adoption"). No new kernel concepts, no
redesign, no website, no npm publish.

The rule for this sprint: a run shown in the console must correspond to an
actual persisted Meshly Run. Nothing in the frontend is fabricated.

## 1. What is real Solari execution

These paths dispatch through `SolariExecutionFabric` → `@solarisdk/browser` /
`@solarisdk/sdk` and produce real session / sandbox / desktop ids.

| Path | Real? | Evidence |
|---|---|---|
| Reconciliation worker: Browser → Sandbox → Desktop | **Real** | live run `run_mty1a8zl_ri7a` — 3 real Solari ids, `payment=PAID`, `ledger=UNPAID`, `erp=POSTED`, `COMMITTED` |
| Browser extraction (`browser_extract`) | **Real** | live page title, URL, `payment_status=PAID` read from the session |
| Sandbox reconciliation (`sandbox_exec`) | **Real** | `python3` runs in the sandbox; `exitCode=0`, `payment`/`ledger` parsed from stdout |
| Desktop side effect (`desktop_write`) + independent read | **Real** | real desktop session; `erp_status` observed from the desktop file |
| Reality divergence → `COMMIT BLOCKED` | **Real** | live run `run_mty1d3ft_qm7h` — claim PAID / tool SUCCESS / world `ERP=UNPAID` → blocked |
| UNKNOWN → independent verification → VERIFIED | **Real** | live run `run_mty1mh0i_3gb7` (desktop write races a 25 ms Meshly timeout, then a fresh desktop read confirms `POSTED`) |
| Coding worker: Sandbox → tests → Browser QA | **Real** | live run `run_mty22r96_s3jm` — sandbox write, `PASS`, browser `QA PASS` |
| Operations worker: Browser → Sandbox → Desktop | **Real** | live run `run_mty233by_zggb` resumed after a real Solari concurrency limit; desktop `ACK-DEGRADED` |
| Research worker: Browser → Sandbox → report | **Real** (generality) | runs through the same public API; probe run live |
| Environment loss recovery (sandbox killed mid-run) | **Real** | `tests/live/environment-lost.ts` |
| Ambiguous timeout (real dispatch, lost result) | **Real** | `tests/live/unknown-timeout.ts` |
| Crash mid-run → PAUSED, resume from checkpoint | **Real** | `tests/live/crash-mid-run.ts` |

## 2. What is simulator-only (explicit test mode)

The simulator is opt-in (`preferSimulator` / `--simulator` / `--provider
simulator`). It is never a silent fallback.

| Path | Simulator-only | Notes |
|---|---|---|
| `tests/product/*` suites | yes | deterministic CI coverage of the same loop |
| `meshly simulate` / `meshly benchmark` | yes | scheduler simulations, documented as such |
| `meshly demo retry` (safe-retry branch) | yes | negative control: side effect absent, result lost → UNKNOWN, safe-to-retry |
| `--provider simulator` project mode | yes | local kernel demo only |

## 3. What this sprint changed

**Kernel (no new abstractions):**

- `packages/core/src/execution/loop.ts` — real observation carry-forward:
  later steps consume earlier environments' observations (the sandbox
  reconciles the payment record actually read from the browser, not a
  hard-coded fixture). UNKNOWN now emits `observation.captured` +
  `observation.recorded` for the independent world read, and an explicit
  safe-to-retry `run.unknown` event when the side effect is absent.
- `packages/core/src/execution/recipes.ts` — added the
  `ambiguous-timeout-absent` scenario (negative control) and the
  `carryForwardFrom: "browser"` declaration on the sandbox step.
- `packages/core/src/execution/tools.ts` — `browser_extract` surfaces the
  real `payments_record` payload; `desktop_write` supports `dropSideEffect`
  for the negative control.
- A timeout scenario no longer overwrites `worker.kind`. This fixes a real
  bug where a reconciliation worker drifted into the Operations project after
  a timeout run.

**Console (`apps/console`):**

- Workspace shell: left sidebar with Projects → Workers, main pane for
  Worker / Run detail. Projects are a derived view over real persisted
  workers (grouped by `kind`) — no new persistence.
- Worker detail: status, task, capabilities, budget, authority, project
  crumb, three-environment strip, recent runs.
- Run detail: execution timeline (Intent → Authorization → Action →
  Observation → Verification → Commit), Agent claim / Tool observation /
  World state cards, first-class UNKNOWN / VERIFIED / BLOCKED / COMMITTED
  verdicts, an explicit UNKNOWN sequence readout, environments table, event
  stream with data, tamper-evident digest, evidence inspector, operator
  actions (Verify, Take over, Resume, Cancel, Compensate).
- Create-worker modal now offers the real templates (reconciliation,
  research, coding, operations).

**CLI:**

- `meshly demo seed` — creates the demo project through the real store
  (workers + policies, no fake runs).
- `meshly demo retry` — the safe-retry negative control.
- `meshly demo unknown|blocked` unchanged.

**Test suite:**

- New suite `tests/product/unknown-sequence.test.ts` asserts the event-order
  contract on both branches:
  `DISPATCHED → UNKNOWN → VERIFICATION_STARTED → WORLD_STATE_OBSERVED →
  VERIFIED` and the same → `SAFE_TO_RETRY`. Wired into `tests/run-all.ts`
  (now 12/12 suites).

## 4. Acceptance

- Four workers run on the same kernel via the public Worker/Run API.
- Canonical reconciliation uses real Browser/Sandbox/Desktop infrastructure.
- UNKNOWN recovery is real and does not auto-retry.
- All results are visible in the existing Console, from persisted state.
- Simulator remains an explicit test mode.

`npm test` → 12/12 suites green.
`npm run build` → clean.

## 5. Not done (by instruction)

- npm publish
- website
- architecture changes
