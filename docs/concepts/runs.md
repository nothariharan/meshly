# First-Class Runs & The Universal Execution Graph

In Meshly, a **`Run`** is the fundamental unit of autonomous work. 

A Run models a complete attempt by an autonomous worker to accomplish an objective across one or more heterogeneous environments (Browser, Sandbox, Desktop).

---

## 1. Why Runs are First-Class

In naive agent implementations, tasks are treated as transient model chat threads. If a process dies, an API times out, or a browser crashes, the execution history is lost, and the system cannot reliably know whether intermediate actions took place in the physical world.

Meshly replaces ephemeral chat loops with explicit, stateful **`Run`** instances:

```typescript
import { Meshly } from "@meshly/sdk"

const mesh = new Meshly()

// 1. Spawning a run with an agent adapter
const run = await mesh.runWithAgent({
  adapter: myAgentAdapter,
  task: "Reconcile vendor invoices and submit settlement in portal",
  capabilities: ["browser", "sandbox"],
  maxSteps: 10,
})

// 2. Or explicit step execution
const worker = await mesh.spawn({ task: "Audit billing anomalies" })
const manualRun = mesh.runs.create(worker)
```

Every `Run` records:
- **`runId`**: Globally unique, timestamp-prefixed identifier.
- **`workerId`**: Associated worker with budget and authority constraints.
- **`status`**: State machine (`PENDING` → `RUNNING` → `PAUSED` → `COMPLETED` | `FAILED` | `CANCELLED` | `VERIFICATION_FAILED`).
- **`environments`**: Array of leased Solari environment IDs utilized during the run.
- **`steps`**: Chronological sequence of `ExecutionStep` items forming the execution graph.
- **`checkpoints`**: Snapshot references allowing instant resumption from any prior step.
- **`events`**: Sequence of monotonic audit event IDs.

---

## 2. The 5-Stage Universal Execution Graph

Every action taken by any model—whether OpenAI function calling, Claude computer-use desktop clicking, an MCP client, or a deterministic TypeScript script—is decomposed into an explicit 5-stage pipeline:

```
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
│ 1. INTENT │ ───► │ 2. ACTION │ ───► │ 3. OBSERVE│ ───► │ 4. VERIFY │ ───► │ 5. COMMIT │
└───────────┘      └───────────┘      └───────────┘      └───────────┘      └───────────┘
 Declared goal      Tool execution      Raw physical       Independent        Side-effect
 by model           under authority     DOM / stdout       world check        persisted or
                    guardrails          capture            vs model claim     quarantined
```

### Stage 1: Intent
The model declares what it intends to achieve with this specific step before taking action.
```json
{
  "stepIndex": 2,
  "intent": "Submit invoice #INV-9821 for $4,850.00 via internal settlement portal"
}
```

### Stage 2: Action
The tool invocation requested by the model. **Meshly intercepts this action before execution**:
- Validates tool against the worker's `Authority.tools` allowlist.
- Validates target domain/URL against `Authority.domains`.
- Validates spend against `Budget.maxSpend`.
- If unauthorized, the step is immediately `rejected` with a security violation without dispatching to the environment.

### Stage 3: Observation
The raw environmental feedback captured from Solari (DOM snapshot, console logs, HTTP status codes, X11 screenshot).

### Stage 4: Verification (The Reality Engine)
Meshly independently checks physical world state against the contract:
- Did the HTTP endpoint return 200?
- Did the database balance change by expected amount?
- Does the browser DOM show the success confirmation text?

Crucially, **Meshly decouples the Agent Claim from Physical Reality**:
- If Agent Claim = `SUCCESS`, but World State = `MISMATCH`, the step fails verification!

### Stage 5: Commit
- **Matched**: The step state is committed, memory is updated, and execution proceeds to the next step.
- **Mismatch**: The commit is **BLOCKED**. The side-effect is quarantined to prevent silent ledger/database corruption.

---

## 3. The Signature Verification Failure State

When physical verification fails, the Run transitions to `VERIFICATION_FAILED`. 

The Operator Console displays the exact divergence:

```
⚠️ REALITY DIVERGENCE DETECTED — UNVERIFIED COMMIT BLOCKED
Agent Claim:     ✓ SUCCESS (Model reported invoice $4,850.00 marked settled)
Tool Execution:  ✓ SUCCESS (HTTP 200 OK returned by checkout gateway)
World State:     ✗ MISMATCH (Ledger query returned status: UNPAID, balance: $4,850.00)
Commit Status:   BLOCKED (Side-effect quarantined to prevent silent corruption)
Evidence Digest: SHA-256 [047ce0a8d5ca0ee83f6...]
```

From this state, operators can take four deterministic actions:
1. **`Inspect`**: View the cryptographic SHA-256 evidence bundle and pre/post observations.
2. **`Take Over`**: Attach an interactive terminal/browser session directly to the live Solari environment without dropping state.
3. **`Retry`**: Re-evaluate or re-attempt the step with clean context.
4. **`Compensate`**: Dispatch SAGA compensating actions in reverse order to undo prior committed mutations.

---

## 4. Tamper-Evident Evidence Export

Every completed or failed run can be exported to disk via the CLI or REST API:

```bash
meshly export <runId>
```

This generates a content-addressed directory containing:
- `run.json`: Complete run state, steps, and timestamps.
- `events.jsonl`: Monotonically sequenced audit events with causal parent IDs.
- `state-diff.json`: Initial vs final observation diff.
- `authority.json`: Complete authority lease bounds under which the run executed.
- `evidence.json`: Tamper-evident evidence with SHA-256 canonical digest.

```typescript
const bundle = run.exportBundle()
console.log(`SHA-256 Digest: ${bundle.sha256Digest}`)
```
