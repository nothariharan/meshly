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
- `meshly init` / `worker create` / `run` / `live` / `fail` / `dev`
- Workers-first console on `.meshly/` (no seeded fake runs)
- One live Solari probe: browser + sandbox + desktop
- Deterministic verification failure (`meshly fail`) that actually mismatches world state

## Next (do not skip ahead to a website)

1. One real Browser → Sandbox → Desktop workflow with observable world state
2. One real ambiguous failure (timeout / unknown state → no blind retry)
3. Two more workers without kernel changes
4. Then npm publish, then docs/landing/demo recording

