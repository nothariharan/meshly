# Meshly: The Operating Layer for Autonomous Workers

> **Run agents like infrastructure.**  
> *Schedule their compute. Preserve their state. Control their authority. Verify their work.*

Meshly is an operating layer and control plane built on top of [Solari](https://getsolari.com). While Solari provides the execution substrate—**Cloud Browsers**, **MicroVM Sandboxes**, and **GUI Desktops**—Meshly provides the runtime contracts required to run autonomous agents safely, deterministically, and reliably in production.

```text
                 ANY AGENT (Claude • GPT • Gemini • LangGraph • Local)
                                      │
                                      ▼
                                  MESHLY
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                                                                         │
 │  Identity & Leases       Multi-Factor Scheduler    Model-Agnostic Ctx   │
 │  Three-Tier Memory       Monotonic Authority       Reality Verifier     │
 │  SAGA Compensation       Semantic Checkpoints      Operator Takeover    │
 │  Failure Injection       Resource Governance       Immutable Audit Log  │
 │                                                                         │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
                                SOLARI FABRIC
                       ┌──────────────┼──────────────┐
                       ▼              ▼              ▼
                 Cloud Browser     MicroVM      GUI Desktop
                    (Stealth)     (Sandbox)      (X11/VNC)
```

---

## The 5 Core Verbs

Everything in Meshly revolves around five foundational operations:

1. **`SCHEDULE`**: Multi-factor dispatch scoring based on priority, deadline urgency, warm environment reuse, profile affinity, and budget constraints.
2. **`PERSIST`**: Semantic checkpoints capturing verified physical world state, active leases, memory snapshots, and recent actions—enabling model-agnostic handoff.
3. **`AUTHORIZE`**: Fine-grained capabilities (`read:invoice`, `refund:max500`) with monotonic privilege narrowing ($A_{child} \subseteq A_{parent}$) and pre-execution policy interception.
4. **`VERIFY`**: Decouples agent claims from physical reality. Every consequential action evaluates preconditions and postconditions, triggers automated SAGA compensation on divergence, and emits tamper-evident evidence bundles.
5. **`RESUME`**: Freezes compute into snapshot states (`broker.pause()`) and resumes warm environments in ~0.78s without losing task progress.

---

## Universal Worker Contract

Meshly treats the **Worker** as a first-class infrastructure primitive:

```ts
interface Worker {
  id: string
  task: string
  status: WorkerStatus // CREATED | QUEUED | RUNNING | WAITING | PAUSED | HANDOFF | COMPLETED | FAILED | CANCELLED
  priority: number
  deadline?: Date
  budget: Budget
  capabilities: Capability[]
  authority: Authority
  context: ContextRef
  memory: MemoryRef[]
  environmentLease?: EnvironmentLease
  checkpoint?: CheckpointRef
  verificationState?: VerificationState
  parentId?: string
  children: string[]
}
```

A worker can be a web researcher, a Python code interpreter, a desktop accounting operator, or a sub-agent. **Meshly manages the execution world; it does not dictate how the model reasons.**

---

## Core Subsystems

### 1. Environment Leases & Warm Pooling (`src/environment.ts`, `src/lease.ts`)
- **First-Class Leases**: Every allocated environment carries a cryptographic `leaseId`, `workerId`, `expiresAt`, `capabilities`, and `authority`. When a lease expires, Meshly automatically checkpoints the worker, pauses compute, revokes permissions, and recycles the resource.
- **Affinity Scheduling**: Workers declare required state (e.g. `profile: "salesforce-crm"`, `files: ["dataset.csv"]`). The broker prioritizes matching warm-idle environments before cold-provisioning.
- **Separation of Concerns**: Logical worker state (`RUNNING`, `PAUSED`, `HANDOFF`) is strictly decoupled from physical environment state (`READY`, `BUSY`, `LOST`).

### 2. Monotonic Authority & Policy Interception (`src/authority.ts`)
- **Mathematical Narrowing**: Sub-workers derive permissions strictly via set intersection ($A_{child} = A_{parent} \cap A_{requested}$). Child workers can never expand tools, capabilities, domains, or spend ceilings beyond their parent.
- **Policy Interception**: Every action passes through `authorize(action)` before reaching Solari. Unauthorized writes, unlisted domains, or spend overages are blocked prior to network or disk I/O.

### 3. Model-Agnostic Context & Agent Handoff (`src/context.ts`)
- Decouples cognitive working state (`objective`, `currentStep`, `recentActions`, `artifacts`, `lastObservation`) from chat history strings.
- **Instant Handoff**: If a model times out or faults, its operational context can be transferred to a replacement agent (e.g., Claude $\rightarrow$ GPT $\rightarrow$ local model) without conversation replay bloat.

### 4. Three-Tier Budgeted Memory (`src/memory.ts`)
- **HOT**: Immediate execution scratchpad and active action buffer.
- **WARM**: Structured artifacts, parsed schemas, and cross-worker handoff state.
- **COLD**: Archived snapshots and long-term audit trail.
- Enforces token ceilings (`maxHotTokens: 4000`) and tracks memory pressure % to prevent prompt degradation.

### 5. Reality Engine & SAGA Compensation (`src/verifier.ts`, `src/transaction.ts`)
- **Separation of Claims vs Reality**:
  ```text
  Agent claim:       ✓ SUCCESS  ("I have posted the invoice!")
  Tool execution:    ✓ SUCCESS
  World state:       ✗ MISMATCH (ERP database was LOCKED)
  Workflow result:   FAILURE    (Commit blocked)
  ```
- **SAGA Transactions**: Manages multi-step operations. When step $N$ fails, executes compensating actions for steps $N-1$ down to $1$ in reverse order.
- **Verifiable Evidence Bundles**: Generates SHA-256 digests of before/after physical state diffs and links Solari session replays (`replays.browser` and `replays.desktop`).

### 6. Immutable Append-Only Event Store (`src/events.ts`)
- Every consequential action emits a frozen, tamper-evident event (`worker.created`, `environment.acquired`, `action.authorized`, `verification.passed`, `checkpoint.created`, `human.intervention`).
- The entire dashboard and audit trail are projected directly from this append-only stream.

---

## 3 Reference Workflows

Meshly is completely workflow-agnostic. It includes three distinct production workflows:

### Workflow A: Browser-Heavy Market Pricing Research
Extracts subscription tiers from competitor portals via Solari stealth sessions, normalizes data in a Python MicroVM sandbox, and verifies output matrix integrity.
```bash
npm run workflow:a
```

### Workflow B: Desktop-Heavy Legacy System Amortization
Launches a legacy accounting desktop GUI over Solari VNC, enters amortization schedules via computer-use actions, and independently verifies database commit state.
```bash
npm run workflow:b
```

### Workflow C: Cross-Environment Financial Ledger Reconciliation
Harmonizes all three Solari primitives:
1. **Cloud Browser**: Extracts pending invoice `#INV-8492` from Stripe billing portal.
2. **MicroVM Sandbox**: Runs double-entry balancing script and computes ledger checksum.
3. **GUI Desktop**: Posts journal entry to legacy ERP. Catches a simulated reality divergence (ERP database locked), triggers SAGA compensation to release the mutex, resumes from snapshot, and verifies `POSTED` status.
```bash
npm run workflow:c
```

---

## High-Density 100-Worker Simulation

Simulate 100 heterogeneous workers competing for a constrained pool of Solari environments (5 Browsers, 3 Sandboxes, 2 Desktops):

```bash
npm run simulate
```

Demonstrates multi-factor scheduling scores, warm reuse (zero cold-boot penalties), queue backpressure, and automatic environment recycling with zero resource leaks.

---

## Contract Invariants Test Suite

Meshly ships with a dedicated invariant test suite enforcing 14 core mathematical guarantees:

```bash
npm test
```

```text
MESHLY CONTRACT INVARIANTS & GUARANTEES TEST SUITE
==================================================

[AUTHORITY]
  ✓ Child authority is strictly subset of parent (tools)
  ✓ Child spend cap never exceeds parent spend cap
  ✓ Child domains cannot expand beyond parent whitelist
  ✓ Expired authority lease rejects action intent

[RESOURCE]
  ✓ Acquired environment is marked BUSY and owned exclusively
  ✓ Worker cannot exceed configured budget cap
  ✓ Released environment returns to warm pool in IDLE state

[LIFECYCLE]
  ✓ Worker cancellation cascades to all descendants

[STATE]
  ✓ Semantic checkpoint preserves verified world state
  ✓ Model-agnostic handoff preserves cognitive context and memories

[VERIFICATION]
  ✓ Agent claim of success does not bypass physical reality check
  ✓ Reality divergence triggers automatic SAGA compensation

[AUDIT]
  ✓ Every consequential action emits an immutable event
  ✓ Worker lifecycle events form a chronological audit timeline

------------------------------------------------------------------------------
 Results: 14/14 Invariants Verified (100% INVARIANTS SATISFIED)
```

---

## Developer CLI

Inspect and control autonomous workers from the command line:

```bash
npx tsx cli.ts workers               # List active and queued workers
npx tsx cli.ts worker get <id>       # Inspect worker state and context
npx tsx cli.ts worker pause <id>     # Freeze worker compute and environment
npx tsx cli.ts worker resume <id>    # Resume worker from snapshot
npx tsx cli.ts worker cancel <id>    # Cancel worker and cascade to children
npx tsx cli.ts environments          # Inspect pooled Solari environments
npx tsx cli.ts events                # Inspect immutable audit log
npx tsx cli.ts simulate 100          # Run 100-worker high-density simulation
npx tsx cli.ts test                  # Run invariant test suite
```

---

## Quickstart

```bash
cd examples/meshly
npm install

# Run Flagship Command Center (works out-of-the-box with high-fidelity simulator):
npm start

# Run with live Solari Cloud:
export SOLARI_API_KEY=slr_live_...
npm start
```

---

## License

MIT
