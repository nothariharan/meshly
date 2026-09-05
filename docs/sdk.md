# Meshly SDK Developer Guide

`@meshly/sdk` is the unified developer kit for building and operating autonomous workers.

```bash
npm install @meshly/sdk @meshly/core @meshly/solari
```

---

## 1. Quickstart

```typescript
import { Meshly, AuthorityManager } from "@meshly/sdk"

// Initialize client (auto-detects SOLARI_API_KEY, falls back to simulator)
const mesh = new Meshly()

// 1. SCHEDULE: Spawn an autonomous worker
const worker = await mesh.spawn({
  task: "Reconcile daily Stripe charges with Postgres database",
  capabilities: ["browser", "sandbox"],
  priority: 9,
  budget: 2.0,
  authority: AuthorityManager.issue({
    tools: ["stripe_api", "sql_query"],
    domains: ["stripe.com", "billing.internal"],
    maxSpend: 2.0,
  }),
  initialMemory: [
    { key: "batch_date", value: "2026-09-05", tier: "hot" },
  ],
})

// 2. DISPATCH: Allocate compute via intelligent scheduler
const dispatch = await mesh.scheduleNext()
console.log(`Worker ${worker.id} scheduled on lease ${dispatch.lease?.leaseId}`)

// 3. VERIFY: Execute step with physical reality contract
const verification = await mesh.verifyStep({
  workerId: worker.id,
  contract: {
    intent: "Confirm database ledger batch balance has zero variance",
    preconditions: [{ target: "state", type: "status_equals", query: "db_connected", expected: true }],
    postconditions: [{ target: "state", type: "status_equals", query: "variance", expected: 0.0 }],
  },
  executeAction: async () => {
    // Model / Tool execution
    return { claimedSuccess: true }
  },
  observeState: async () => {
    // Independent external query
    return { db_connected: true, variance: 0.0 }
  },
})

console.log("Verified:", verification.state.worldStateMatched)
console.log("Tamper-evident Digest:", verification.evidence?.tamperEvidentDigestSha256)
```

---

## 2. API Reference

### `mesh.spawn(options)`
Spawns a new autonomous worker instance and enqueues it for scheduling:
- `task`: High-level description of work.
- `capabilities`: Array of required environment types (`browser`, `sandbox`, `desktop`) or custom labels.
- `priority`: Priority integer (1–10).
- `deadline`: Optional `Date` for urgency scoring.
- `budget`: Maximum dollar spend allowed.
- `authority`: Authority token produced via `AuthorityManager.issue()`.
- `initialMemory`: Array of `{ key, value, tier: "hot" | "warm" | "cold" }`.

### `mesh.verifyStep(params)`
Executes an action intent within an independent verification contract:
- `contract`:
  - `intent`: Human-readable goal of the step.
  - `preconditions`: Verification conditions checked before running the action.
  - `postconditions`: Verification conditions checked against external state after the action.
  - `compensate`: Optional compensating function invoked automatically if reality diverges.
- Returns `{ state: VerificationState, evidence?: EvidenceBundle }`.

### `mesh.transaction(workerId)`
Creates a multi-step SAGA distributed transaction:
```typescript
const saga = mesh.transaction(worker.id)

saga
  .addStep({
    name: "Step 1: Charge customer",
    contract: step1Contract,
    action: chargeAction,
    observeState: observeCharge,
    compensate: refundAction, // Rolled back if Step 2 fails
  })
  .addStep({
    name: "Step 2: Provision cloud license",
    contract: step2Contract,
    action: provisionAction,
    observeState: observeLicense,
  })

const result = await saga.execute()
```

### `mesh.handoff(fromWorkerId, newTask)`
Performs a zero-loss context and memory handoff from one worker to another.

### `mesh.operator.takeover(workerId, environmentId)`
Initiates human operator takeover, freezing worker automation while presenting live interactive VNC or browser replay URLs.
