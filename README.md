# Meshly

### **The Operating Layer for Autonomous Workers**

> *Run agents like infrastructure. Schedule their compute. Preserve their state. Control their authority. Verify their work.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen.svg)]()
[![Solari](https://img.shields.io/badge/Substrate-Solari%20Cloud-indigo.svg)](https://getsolari.com)

---

## What is Meshly?

Every team deploying AI agents at scale encounters the same brutal reality: **models are capable of reasoning, but current agent runtimes lack operational infrastructure.**

- Agents claim tasks succeeded when the external world failed to change (*Agent Delusion*).
- Spawning sub-agents leads to unchecked privilege escalation and runaway spend (*Privilege Creep*).
- Cold-booting cloud browsers or microVMs for every tool call wastes seconds and budgets (*Compute Thrashing*).
- Network disconnections and crashed processes destroy hours of multi-step context (*State Evaporation*).
- Enterprises hesitate to automate consequential work because they lack tamper-evident proof of execution (*Trust Deficit*).

**Meshly solves this by decoupling the agent from the execution environment:**

> **Meshly** decides which agent should run, what compute it needs, what it is allowed to do, what it should remember, and whether the work actually succeeded; **Solari** provides the unified execution substrate (Cloud Browsers, MicroVM Sandboxes, and GUI Desktops).

---

## The 5 Core Verbs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   MESHLY                                    │
│                                                                             │
│   SCHEDULE       PERSIST        AUTHORIZE        VERIFY          RESUME     │
│  Multi-factor   Zero-loss       Monotonic      Decoupled       Sub-second   │
│   priority &   context handoff  privilege      physical        microVM &    │
│  warm pooling   & 3-tier memory bounds (⊆)   world contracts   VNC freeze   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ First-Class Leases
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SOLARI INFRASTRUCTURE                            │
│                                                                             │
│      CLOUD BROWSERS          MICROVM SANDBOXES            GUI DESKTOPS      │
│   (Stealth, Profiles,      (Python, File I/O,         (VNC Streams, SAP/ERP,│
│     Session Replays)         Shell Execution)             Pause/Resume)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **`SCHEDULE`** — Multi-factor scoring ($(\text{priority} \times 20) + \text{urgency} + \text{poolBonus} + \text{affinityBonus} - \text{budgetPenalty}$) dispatches workers to warm, pre-profiled environments. Eliminates 5–30s cold boots.
2. **`PERSIST`** — Model-independent context with zero-loss transfers and a 3-tier budgeted memory engine (`HOT` context window, `WARM` structured scratchpad, `COLD` archival logs).
3. **`AUTHORIZE`** — Mathematical monotonic authority narrowing ($A_{\text{child}} \subseteq A_{\text{parent}}$). Intercepts all actions *before* execution; blocks unauthorized tools, disallowed domains, and spend overruns.
4. **`VERIFY`** — Decouples the agent's claim (`claimedSuccess: true`) from physical reality. Validates preconditions and postconditions against external DOM, filesystem, or database state. Emits tamper-evident, content-addressed SHA-256 evidence bundles. Triggers automatic SAGA compensating rollbacks on divergence.
5. **`RESUME`** — Suspends virtual machines and desktops in <800ms during human review or lease expiration, then resumes instantly from exact memory snapshots.

---

## Monorepo Architecture

```text
packages/
  ├── core/               @meshly/core — Universal types, EventStore, Scheduler,
  │                       Authority Engine, Verifier, SAGA Coordinator, Broker, Simulator
  ├── solari/             @meshly/solari — Solari ExecutionFabric adapter integrating
  │                       @solarisdk/browser and @solarisdk/sdk
  ├── sdk/                @meshly/sdk — High-level developer SDK and Meshly runtime client
  └── cli/                @meshly/cli — Control plane CLI (`meshly simulate`, `workers`, etc.)
apps/
  └── console/            Linear/Vercel-inspired operator console with REST API & dark UI
workflows/
  ├── reconciliation/     Reference Workflow C: Multi-primitive financial reconciliation
  │                       (Browser -> MicroVM -> GUI Desktop with reality divergence recovery)
  ├── browser-research/   Reference Workflow A: Stealth browser scraping & Python matrix
  └── desktop-operation/  Reference Workflow B: Legacy ERP accounting automation via VNC
tests/
  ├── invariants/         14 hard mathematical & operational invariants
  ├── failure/            Chaos engineering (crashes, timeouts, spend exhaustion)
  ├── security/           Red-team attacks (privilege escalation, egress bypass, unauthorized writes)
  ├── verification/       Reality engine tests (lying agent detection, SHA-256 digest validation)
  └── run-all.ts          Master test runner
cookbook/
  └── solari/             Upstream Solari Cookbook reference implementations
```

---

## Quickstart

### Installation

```bash
git clone https://github.com/nothariharan/meshly.git
cd meshly
npm install
```

### Run the Flagship Multi-Primitive Workflow

Harmonizes all three Solari primitives (Cloud Browser, MicroVM Sandbox, GUI Desktop), catches a lying agent claim on a locked ERP, executes SAGA compensating rollback, resumes from snapshot, and produces a tamper-evident SHA-256 audit digest:

```bash
npm run workflow:reconciliation
# or: npm start / npm run demo
```

### Run the High-Density Scheduling Simulation (100 Workers)

Demonstrates queue backpressure, multi-factor scoring, warm-pool recycling, and zero orphan environments:

```bash
npm run simulate
```

### Launch the Operator Console & Web Dashboard

Starts the lightweight, zero-dependency control plane on `http://localhost:3400`:

```bash
npm run console
```

### Run the Complete Test Suite

Executes all 14 invariants, failure injection, security red-team attacks, and verification proofs:

```bash
npm test
```

---

## The Reference Implementation: Workflow C

`workflows/reconciliation/index.ts` is the definitive demonstration of why Meshly and Solari belong together:

```
[Chief Worker] Priority 10, Authority Cap $2.50
      │
      ├──> [Stage 1: Cloud Browser]
      │    • Leases stealth browser with authenticated finance profile
      │    • Navigates to Stripe portal and extracts Invoice #INV-8492 ($4250.00)
      │    • Verified against external Stripe observation
      │    • Captures session replay URL; releases browser to warm pool
      │
      ├──> [Stage 2: MicroVM Sandbox]
      │    • Leases Linux microVM; writes Python double-entry balancing script
      │    • Executes reconciliation between bank CSV net and Stripe invoice
      │    • Verified: 0 variance, balanced ledger checksum generated
      │    • Semantic Checkpoint #2 created; releases sandbox
      │
      └──> [Stage 3: GUI Desktop (ERP Posting with Reality Divergence)]
           • Leases desktop environment with live VNC stream
           • Attempt 1: Agent clicks "Post" in GUI and claims "Success!", but ERP is LOCKED
           • Meshly catches divergence: Agent Claim=✓, Physical Reality=✗
           • SAGA Compensation: Freezes transaction lock, pauses desktop VM (<800ms),
             clears stale Mutex, resumes worker from snapshot
           • Attempt 2: Re-submits journal entry; verified ERP Status = POSTED
           • Emits Content-Addressed Evidence Bundle with SHA-256 Digest
```

---

## Invariants & Operational Guarantees

Meshly programmatically guarantees 14 runtime invariants:

| Category | Invariant Guarantee | Enforcement Mechanism |
|---|---|---|
| **Authority** | Monotonic Narrowing ($A_{\text{child}} \subseteq A_{\text{parent}}$) | `AuthorityManager.delegate()` mathematical intersection |
| **Authority** | Pre-Execution Interception | Policy engine evaluates tool, domain, write target before execution |
| **Authority** | Lease Expiration Rejection | Actions with expired authority leases return `LEASE_EXPIRED` |
| **Resource** | Strict Budget Ceiling | Spend deduction returns `false` when exceeding `maxSpend` |
| **Resource** | Zero Orphan Environments | All environments bound to leases; automatically recycled on exit |
| **Resource** | Warm-Pool Affinity Matching | Prioritizes idle environments retaining matching profiles |
| **Lifecycle** | Cascade Cancellation | Cancelling parent worker recursively cancels all descendant workers |
| **State** | Zero-Loss Context Transfer | Worker handoff preserves step index, metadata, and artifacts |
| **State** | 3-Tier Budgeted Memory | Automatically tracks token pressure to prevent context window blowup |
| **Verification** | Decoupled Agent vs Reality | Agent claims of success never bypass external state verification |
| **Verification** | Automatic SAGA Rollback | Postcondition failures trigger reverse compensation handlers |
| **Verification** | Tamper-Evident Evidence | Canonical state diff hashed with SHA-256 into immutable evidence bundle |
| **Audit** | Append-Only Event Stream | All state transitions emitted as deeply frozen `MeshlyEvent` objects |
| **Compute** | Sub-Second Pause/Resume | MicroVM and desktop environments suspended and resumed in <800ms |

---

## Solari Configuration

Meshly operates seamlessly with or without a live Solari API key:
- **With `SOLARI_API_KEY`**: Allocates real Cloud Browsers, MicroVM Sandboxes, and GUI Desktops via `@solarisdk/browser` and `@solarisdk/sdk`.
- **Without `SOLARI_API_KEY`** (or in CI): Automatically falls back to the deterministic `SimulatorExecutionFabric`, delivering high-fidelity simulation with zero configuration.

```bash
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
```

---

## Upstream Cookbook Reference

The original Solari Cookbook examples are preserved in:
[`cookbook/solari/`](cookbook/solari/)

They provide atomic, runnable snippets for raw Solari SDK capabilities (launch, profiles, recordings, port preview, computer use).

---

## License

MIT © [Meshly Contributors](https://github.com/nothariharan/meshly)
