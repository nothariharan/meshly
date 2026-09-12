# UNKNOWN

Meshly treats three action outcomes as first-class:

```text
SUCCESS
FAILURE
UNKNOWN
```

**UNKNOWN does not mean FAILED.**

FAILED means the action did not happen, or Meshly can prove it did not take effect.

UNKNOWN means a side effect may have occurred and the result never came back. Retrying can double-charge, double-write, or double-submit.

```text
dispatch
   ↓
network disappears / timeout / control channel dies
   ↓
UNKNOWN
   ↓
independent verification of the world
   ↓
┌──────────────┬─────────────────────┐
│ world present│ world absent        │
│ VERIFIED     │ UNKNOWN (still)     │
│ no retry     │ retry is allowed    │
│              │ but not automatic   │
└──────────────┴─────────────────────┘
```

## SDK

Status is uppercase. That is the public API.

```ts
if (run.status === "UNKNOWN") {
  const check = await run.verify()
  // verify reads world state. It does not retry the side effect.
}

if (run.unknown) {
  await run.verify()
}
```

`meshly verify <runId>` is the same operation from the CLI.

## What Meshly will not do

- Pretend UNKNOWN is FAILURE
- Automatically retry a write whose result is UNKNOWN
- Commit because the agent claimed SUCCESS
