# Product

This file is the locked definition. Do not drift back into kernel-only architecture.

## The split

**wsp** manages where an agent works.

**Meshly** manages how autonomous work executes safely.

**Solari** is the execution substrate: cloud browsers, sandboxes, GUI desktops, snapshots, pause/resume, recording/replay.

```
Agents (Claude / GPT / MCP)     reason, plan, pick tools
        ↓
Meshly                          worker OS: lifecycle, authority, leases,
                                verify, recover, commit, audit
        ↓
Solari                          browser / sandbox / desktop
```

Meshly does not generate tokens. Solari does not decide whether a side effect may commit.

## What Meshly owns

Worker lifecycle · Scheduling · Authority · Environment allocation · Context/state · Verification · Recovery · Commit semantics · Auditability

## What Solari owns

Browser · Sandbox · Desktop · Compute · GUI · Session infrastructure

## What the agent owns

Planning · Tool selection · Interpretation · Intent

## Product loop

```
npx meshly init
npx meshly dev
npx meshly worker create
npx meshly run
```

A developer should not have to understand the kernel or clone this repo.

Published packages (not yet on npm until you run `npm publish --access public`):

- `@meshly/core` — kernel
- `@meshly/solari` — Solari fabric
- `@meshly/sdk` — developer API
- `@meshly/cli` — human CLI (`meshly`)
- `meshly` — unscoped bin so `npx meshly` works
- `@meshly/console` — operator app (`meshly dev`)

## Honesty

- Live Solari is the default when `SOLARI_API_KEY` is set. Failures surface. No silent simulator fallback.
- `meshly simulate` / `meshly benchmark` are **scheduler simulations**, not live Solari capacity tests.
- Real Solari capacity testing is a separate later phase, after one excellent live workflow exists.

## 7-day build order

1. Live Solari adapter + first real browser/sandbox/desktop execution
2. `meshly worker create` + Worker/Run lifecycle
3. Console around Workers → Runs → execution graph
4. Killer failure: timeout / ambiguous side effect → independent verify → do not retry
5. Second and third workers without changing the kernel
6. Stress/lifecycle against real Solari
7. Docs, landing, demo recording

Every day produces something externally demonstrable.

## Shipped in this repo

- Live Solari adapter (no silent simulator fallback)
- `meshly init` / `worker create` / `run` / `live` / `fail` / `dev` / `restart` / `mcp`
- Workers-first console on `.meshly/` (no seeded fake runs)
- Agent runtime: ActionRequest → Policy → ExecutionFabric → Solari (agents never get a Solari client)
- Reconciliation worker: Browser payment → Sandbox ledger → Desktop ERP → independent verify
- Research, coding, and operations workers on the same kernel
- Ambiguous timeout: result = UNKNOWN, no retry until independent verification
- Persistence under `.meshly/` (workers, runs, environments, events, checkpoints, memory, policies, evidence)
- `meshly restart` reconnects surviving Solari environments

## Next

The runtime is usable. New work must make Meshly easier to use, make a worker safer to run, or make the execution lifecycle more observable.

Frozen API: [docs/api.md](api.md)

1. Keep the core API frozen (Workers, Runs, Environments, Policies, Events)
2. Canonical reconciliation workflow in the console (Worker → Run → Environment → Evidence)
3. Real Solari validation of resume-after-kill
4. External-user install test (`npm install -g meshly`)
5. Then website / challenge demo

Do not invent new kernel concepts.

## Evidence

The product-model benchmark lives in [docs/benchmark.md](benchmark.md) and is
run with `meshly benchmark --suite execution`. It compares direct agent
execution against Meshly-governed execution on the same task, environments, and
faults. It is an evaluation harness, not a second runtime: it adds no kernel
concepts and both arms use the shipped tool dispatcher and the shipped Meshly
runtime.


