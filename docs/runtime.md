# Meshly Runtime Engine & Subsystems Reference

The central engine for Meshly is `MeshlyRuntime`. It orchestrates all runtime modules into a unified control plane.

```typescript
import { MeshlyRuntime } from "@meshly/core"

const runtime = new MeshlyRuntime({
  maxConcurrency: 20,
  maxHotTokens: 4000,
})
```

---

## 1. EventStore (`runtime.events`)

An append-only, immutable event log capturing all state transitions across workers, leases, authority gates, and physical environments.

- **Immutability:** Every emitted event object and its data payload are deeply frozen via `Object.freeze()`.
- **Querying:** Filter events by type, worker ID, environment ID, or timestamp window:
  ```typescript
  const recentEvents = runtime.events.query({
    workerId: "wrk_12345",
    type: ["action.authorized", "verification.failed"],
    limit: 25,
  })
  ```
- **Live Subscriptions:** Hook into real-time operational streams:
  ```typescript
  const unsubscribe = runtime.events.subscribe((event) => {
    console.log(`[EVENT ${event.type}]`, event.data)
  })
  ```

---

## 2. EnvironmentBroker (`runtime.broker`)

The broker manages pools of ephemeral cloud resources (Browsers, Sandboxes, Desktops) backed by the `ExecutionFabric`:

- **Warm-Pool Affinity:** Idle environments retaining specific authenticated profiles (e.g. `salesforce-crm`, `stripe-portal`) or pre-loaded files are prioritized to eliminate initialization delays.
- **First-Class Leases:** All compute allocations are bound to an explicit `EnvironmentLease` with an expiration timestamp and authority scope.
- **Lifecycle Guarantees:** When a lease expires, the broker automatically pauses the worker, captures a checkpoint, and recycles or suspends the environment. No unmanaged orphans.

---

## 3. Multi-Factor Intelligent Scheduler (`runtime.scheduler`)

Dispatches queued workers onto available environments using multi-factor scoring:

```typescript
score = (worker.priority * 20)
  + deadlineUrgencyBoost   // +50 to +150 for near or overdue deadlines
  + warmPoolAvailableBoost // +40 if matching idle environment is ready
  + affinityMatchBoost     // +40 for exact profile match
  - budgetPenalty          // -30 for low budget, -200 if exhausted
```

- **Backpressure Protection:** Concurrency is strictly bounded (`maxConcurrency`). Excess workers are enqueued in priority order.
- **Pre-dispatch Budget Defense:** Workers whose budget cap has been reached are disqualified before allocating cloud compute.

---

## 4. Context & Tiered Memory Engine

### Context Management (`runtime.contexts`)
Maintains an authoritative, model-independent representation of what the worker is doing:
- Objective and active plan
- Step index and recent action history
- Verified artifacts and world observations

**Zero-Loss Handoff:**
```typescript
// Replace a worker with a specialized model while preserving full context
const replacement = await runtime.handoff(sourceWorker.id, "Execute code generation")
```

### 3-Tier Budgeted Memory (`runtime.memory`)
- **HOT:** Directly inserted into LLM prompt prompts. Automatically evicts to WARM when token estimates exceed configured thresholds (`maxHotTokens`).
- **WARM:** Fast structured scratchpad key-value storage.
- **COLD:** Persistent archival storage for large files and logs.

---

## 5. Operator Takeover Subsystem (`runtime.operator`)

Allows human operators to observe live agent execution and intervene safely:
- Obtains live WebSocket VNC stream URLs or browser replay links.
- Pauses the autonomous worker while the human completes manual steps (e.g. 2FA verification).
- Re-captures external world state, records the human action in the immutable audit log, and resumes the worker.
