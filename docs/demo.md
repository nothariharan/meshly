# Demo

Frozen candidate: `b604b64`. Do not add features before recording.

This is a proof of what already works — real runs from `.meshly/`, not seeded
screens. Do not re-run the live workflow during recording unless a run is
actually missing.

## Demo environment

```text
Machine:      local workstation
Node:         >= 20 (verified on 22.19.0)
Provider:     Solari (live) — SOLARI_API_KEY set
Project:      .meshly/ in this repo
```

## Demo command

```bash
meshly dev                 # http://localhost:3400
```

## Cursor → Meshly → Solari (agent-driven demo)

Cursor is the reasoning interface, Meshly is the control layer, Solari is the
execution infrastructure. Cursor never receives Solari tools.

Point Cursor at the Meshly MCP server (`.cursor/mcp.json` or Cursor settings):

```json
{
  "mcpServers": {
    "meshly": {
      "command": "meshly",
      "args": ["mcp"]
    }
  }
}
```

Then ask Cursor:

> Create a Meshly worker called invoice-reconciler with browser, sandbox and
> desktop capabilities, reconcile invoice 4421, run it, and report only after
> Meshly has independently verified the world state.

Cursor should call `meshly_create_worker` → `meshly_run` → `meshly_get_run` →
`meshly_verify`. It must **not** see `solari_*` tools.

Verify the invariant at any time:

```bash
npx tsx tests/live/mcp-invariant.ts          # simulator
npx tsx tests/live/mcp-invariant.ts --live   # real Solari
```

## Solari session hygiene

`meshly run` destroys its environments. A killed or dropped session can still
linger in Solari's warm pool and occupy concurrency. Drain before recording:

```bash
npx tsx scripts/drain-solari.ts
```

Meshly recovers on its own when an environment dies **before** a side effect is
dispatched (it allocates a replacement and retries). When a write may already
have landed, it stays UNKNOWN and never retries — that is the point.

## Run IDs

| Story | Run ID | Status |
|---|---|---|
| Success — Browser → Sandbox → Desktop → COMMITTED | `run_mty1a8zl_ri7a` | COMPLETED |
| Reality divergence — claim SUCCESS / world MISMATCH → BLOCKED | `run_mty1d3ft_qm7h` | BLOCKED |
| UNKNOWN — dispatched, result lost, independent read → VERIFIED | `run_mty1mh0i_3gb7` | VERIFIED |
| UNKNOWN (negative) — side effect absent → still UNKNOWN | `run_mty1mpuq_jajd` | UNKNOWN |
| Recovery — environment lost, replacement allocated, completes | `run_mtwsrftz_c021` | COMPLETED |

## Exact demo sequence

```text
0:00  Workers / Home
      "Meshly is a runtime for autonomous workers. Agents reason, Meshly
       governs execution, and Solari provides the actual cloud environments."

0:20  Open the successful run  run_mty1a8zl_ri7a
      Worker → Run → Browser → Sandbox → Desktop → Verification → Commit
      Real Solari environments. Payment PAID / ledger UNPAID / ERP POSTED.

0:50  Open the BLOCKED run  run_mty1d3ft_qm7h
      Agent claim SUCCESS · Tool SUCCESS · World MISMATCH → COMMIT BLOCKED
      "The agent said it worked. The tool said it worked. Meshly checked
       reality and refused to commit."

1:25  Open the UNKNOWN run  run_mty1mh0i_3gb7
      DISPATCHED → UNKNOWN → retry blocked → independent verification →
      world state confirmed → VERIFIED
      "It marks the state UNKNOWN and verifies the world before deciding."

1:55  Open the recovery run  run_mtwsrftz_c021
      sandbox killed → environment.lost → replacement allocated → completes
      "It survives environment failure and resumes rather than restarting."

2:15  Projects: Finance / Engineering / Research / Operations
      Same runtime, same public API.

2:30  Close: Agent → Meshly → Solari
      "Agents reason. Solari executes. Meshly governs the gap between the two."
```

## What not to say

- Do not mention the test suites unless asked.
- Do not mention the local tarballs.
- Do not mention the simulator unless asked.
- Do not call it production-ready.
- Do not call the SHA-256 digest a cryptographic proof of truth.
- Do not show source code.

## Known failure recovery

If a run is missing or the console shows no project:

```bash
meshly demo seed           # recreate the demo workers through the real store
meshly dev                 # restart the console
```

If a worker is stuck in WAITING after a Solari concurrency limit:

```bash
meshly resume <runId>      # Meshly never retries a write on its own
```

If the console is not responding:

```bash
meshly doctor              # end-to-end check; use --skip-probe to skip Solari probes
```
