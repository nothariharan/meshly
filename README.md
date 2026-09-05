# Meshly

### **The Execution Control Layer for Autonomous Workers**

> **Agents are probabilistic. Execution is stateful. Meshly makes the boundary between them explicit.**
>
> Meshly controls authority, environment allocation, lifecycle, context, verification, recovery, and commit semantics around autonomous workers.  
> Solari provides the actual browser, sandbox, and desktop execution environments.  
> Meshly ensures an agent cannot turn “the model said it worked” into “the world actually changed.”

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Verified Runtime Kernel](https://img.shields.io/badge/Kernel-Tested%20Safety%20Invariants-emerald.svg)]()
[![Solari Execution Fabric](https://img.shields.io/badge/Substrate-Solari%20Cloud-indigo.svg)](https://getsolari.com)

---

## The Signature Reality Check: Decoupling Claim from State

The defining moment of Meshly happens when the model claims success, the tool returns HTTP 200, the external world disagrees, and Meshly visibly **halts and quarantines the commit**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️  REALITY DIVERGENCE DETECTED — UNVERIFIED COMMIT BLOCKED                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Agent Claim:     ✓ SUCCESS (Model reported invoice #INV-9821 settled)        │
│ Solari / Tool:   ✓ SUCCESS (HTTP 200 OK returned by checkout gateway)        │
│ Physical World:  ✗ MISMATCH (Ledger database status check returned UNPAID)   │
│ Commit Status:   BLOCKED (Side effect quarantined; ledger uncorrupted)      │
│ Tamper Digest:   SHA-256 047ce0a8d5ca0ee83f6d7a1b...                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ 🎮 Take Over Session ] [ 🔄 Retry Verification ] [ ⏪ SAGA Compensate ]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

This single guarantee solves the #1 reason enterprises hesitate to deploy autonomous agents: **preventing unverified side effects from silently corrupting databases, ledgers, and external services.**

Operators can:
- **`Take Over`**: Attach an interactive terminal or VNC session directly to the active Solari lease without dropping context.
- **`Retry`**: Re-evaluate or re-attempt the step with clean context.
- **`Compensate`**: Dispatches compensating SAGA rollback actions in reverse order to undo prior committed mutations.
- **`Inspect`**: View the cryptographic SHA-256 content-addressed evidence bundle.

---

## What is Meshly?

Every team attempting to run autonomous agents on consequential production tasks hits the same wall: **models can reason, but current agent frameworks lack infrastructure-grade execution control.**

When an autonomous agent operates in the wild:
- **It can execute actions, but doesn't reliably know whether the world changed**: An agent calls a payment endpoint, times out on the return trip, and either retries blindly (causing a double charge) or falsely claims success (*Agent Delusion*).
- **It can spawn sub-agents, but authority and delegation become dangerous**: Child agents escalate privileges, make unauthorized API calls, or exceed budgets (*Privilege Creep*).
- **It can run long tasks, but environment state evaporates**: Network partitions, container churn, or modal popups cause hours of multi-step context to vanish (*State Amnesia*).
- **Enterprises hesitate not because the model is too dumb, but because they cannot trust unverified side effects.**

### The Core Architectural Principle

> **Agents reason. Solari executes. Meshly governs the gap between the two.**

Meshly models every task as a first-class **`Run`** governed by an explicit 5-stage Execution Graph:

$$\text{Intent} \longrightarrow \text{Action} \longrightarrow \text{Observation} \longrightarrow \text{Verification} \longrightarrow \text{Commit}$$

If the physical world does not match the model's claim, **the commit is BLOCKED and quarantined**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             AGENT REASONING LAYER                           │
│        OpenAI GPT-4o  •  Anthropic Claude  •  Custom MCP  •  Scripts        │
│                (Plans intent, chooses tools, interprets state)              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ AgentActionRequest
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MESHLY EXECUTION CONTROL LAYER                      │
│                                                                             │
│   SCHEDULE       PERSIST        AUTHORIZE        VERIFY          RESUME     │
│  Multi-factor   State-preserving Monotonic      Decoupled       Sub-second   │
│   priority &   context handoff  privilege      physical        microVM &    │
│  warm pooling   & 3-tier memory bounds (⊆)   world contracts   VNC freeze   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Scoped Environment Leases
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOLARI EXECUTION FABRIC                            │
│                                                                             │
│      CLOUD BROWSERS          MICROVM SANDBOXES            GUI DESKTOPS      │
│   (Stealth, Profiles,      (Python, File I/O,         (VNC Streams, SAP/ERP,│
│     Session Replays)         Shell Execution)             Pause/Resume)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10 Runtime Invariants Enforced and Covered by the Test Suite

Meshly is architected as a **runtime kernel enforcing formally defined execution invariants**. The test suite explicitly exercises and verifies these 10 invariants across real failure scenarios:

| Invariant | System Guarantee | Production Failure Prevented |
| :--- | :--- | :--- |
| **I1: Monotonic Sequence** | Every system event has a strictly increasing sequence number $S_{n+1} > S_n$ with causal parent linking. | Race conditions, out-of-order delivery, untraceable agent audit trails. |
| **I2: Monotonic Authority** | Sub-agent authority envelope is strictly bounded: $A_{child} \subseteq A_{parent}$. | Privilege escalation, rogue child agents accessing unapproved tools or budgets. |
| **I3: Pre-Execution Interception** | Policy validation occurs *before* any tool or environment dispatch. | Unauthorized database writes, unapproved domain network egress. |
| **I4: Reality Decoupling** | Step commit requires independent physical verification ($Claim \land Match$). | Delusional agents reporting success while the underlying task silently failed. |
| **I5: Quarantine on Divergence** | If world state mismatches claimed completion, commit is halted and quarantined. | Cascading corruption of databases and ledgers from unverified agent steps. |
| **I6: Re-Verification on Timeout** | After network/transport timeouts, re-verify physical state before attempting any retry. | **Duplicate payments, duplicate orders, double-spend vulnerabilities.** |
| **I7: Stale State Interception** | Re-observing environment state after pause/resume catches external screen mutation. | Blind execution continuation on corrupted, altered, or logged-out screens. |
| **I8: Hard Spend Ceilings** | Financial spend caps are enforced synchronously at the execution barrier. | Runaway loops burning hundreds of dollars in API/compute fees. |
| **I9: Exclusive Leases** | Environments are bound to exactly one worker lease at any point in time. | Cross-tenant data contamination, concurrent agent session collisions. |
| **I10: Atomic Rollback** | Step failure dispatches compensating SAGA rollback actions in reverse order. | Partial database mutations and dirty environment states. |

---

## Agent-Agnostic Model Independence

Meshly does not care how your agent reasons. Models interact through clean contracts without knowing about the scheduler, leases, checkpoints, authority, or Solari APIs:

```typescript
import { Meshly, OpenAIAgentAdapter, AnthropicAgentAdapter, MCPAgentAdapter } from "@meshly/sdk"

const mesh = new Meshly()

// 1. Run an OpenAI Function-Calling loop under Meshly governance
const run1 = await mesh.runWithAgent({
  adapter: new OpenAIAgentAdapter({ model: "gpt-4o" }),
  task: "Scrape monthly invoice from billing portal",
  capabilities: ["browser"],
  maxSteps: 5,
})

// 2. Run an Anthropic Computer-Use Desktop agent under Meshly governance
const run2 = await mesh.runWithAgent({
  adapter: new AnthropicAgentAdapter({ model: "claude-3-7-sonnet-20250219" }),
  task: "Reconcile legacy SAP GUI ledger amortization schedules",
  capabilities: ["desktop"],
  maxSteps: 10,
})

// 3. State-preserving model handoff (Claude Reasoning -> GPT Execution)
const claudeWorker = await mesh.spawn({ task: "Multi-model orchestration" })
claudeWorker.checkpointState(1)

// Tested Claude -> GPT-4o handoff preserving run state, step index, authority context, and hot memory
const gptWorker = await mesh.handoff(claudeWorker.id, "Execute posted entries")
```

---

## 1,000-Worker Scheduler & Failure Simulation

Meshly includes a built-in stress benchmark evaluating scheduler queueing, multi-factor scoring, authority checks, and recovery from injected failures across 1,000 workers:

> **Note on Concurrency**: 1,000 logical workers were dispatched through Meshly's runtime scheduler with injected failures (5% environment drops, 3% timeouts, 2% verification mismatches, 1% policy attacks). Physical Solari concurrency was intentionally simulated to avoid conflating scheduler scalability with infrastructure capacity. Live infrastructure concurrency benchmarking is run separately against provisioned Solari account limits.

```bash
npm run cli -- benchmark 1000
```

### Systems Scorecard Output:

```text
==============================================================================
 SIMULATION COMPLETE: SCHEDULER & RECOVERY SCORECARD
==============================================================================
 logical workers dispatched:  1000
 dispatch mode:               Sequential scheduler loop (peak queue: 1000)
 environment pool size:       35 (20 browsers, 10 sandboxes, 5 desktops)
 warm reuse rate:             100%
 mean scheduling latency:     1ms
 verification failures:       13
 recovered SAGA rollbacks:    13
 orphan environments:         0
 unverified commits:          0
 total duration:              390ms
==============================================================================
```

---

## Meshly × Solari: Real Execution Validation

Meshly is built directly above Solari's unified cloud infrastructure. Solari provides:
- **Unified API Surface**: One API key controls Cloud Browsers, MicroVM Sandboxes, and GUI Desktops.
- **Session Replay & Live VNC**: Built-in video replays for browsers and live WebRTC/VNC streams for desktop sessions.
- **Sub-Second Pause & Resume**: Sandboxes and desktops can pause, snapshot, and reconnect.
- **Concurrency Management**: Real infrastructure limits and session lifecycle quotas enforced by Solari.

### Real Execution Pipeline:

$$\text{Worker} \xrightarrow{\text{Authority}} \text{Scheduler} \xrightarrow{\text{Lease}} \text{Solari Environment} \xrightarrow{\text{Action}} \text{Observation} \xrightarrow{\text{Verify}} \text{Commit}$$

Capturing:

$$\text{Run ID} \longrightarrow \text{Environment IDs} \longrightarrow \text{Timestamps} \longrightarrow \text{DOM/Stdout/Screenshots} \longrightarrow \text{State Diff} \longrightarrow \text{Verification Decision} \longrightarrow \text{Replay URL}$$

---

## Monorepo Architecture

```text
packages/
  ├── core/               @meshly/core — Universal types, RunManager, EventStore, Scheduler,
  │                       Authority Engine, Reality Verifier, SAGA Coordinator, Broker, Simulator
  ├── solari/             @meshly/solari — Solari ExecutionFabric adapter integrating
  │                       @solarisdk/browser and @solarisdk/sdk
  ├── sdk/                @meshly/sdk — High-level developer SDK and agent adapters
  └── cli/                @meshly/cli — Control plane CLI (`meshly runs`, `export`, `benchmark`)
apps/
  └── console/            Operator console with REST API, dark UI, warm pool breakdown & graph
workflows/
  ├── reconciliation/     Reference Workflow C: Multi-primitive financial reconciliation
  │                       (Browser -> MicroVM -> GUI Desktop with reality divergence recovery)
  ├── browser-research/   Reference Workflow A: Stealth browser scraping & Python matrix
  └── desktop-operation/  Reference Workflow B: Legacy ERP accounting automation via VNC
tests/
  ├── invariants/         14 tested runtime invariants + distributed edge case proofs
  ├── failure/            Chaos engineering (crashes, timeouts, spend exhaustion)
  ├── security/           Red-team attacks (privilege escalation, egress bypass, unauthorized writes)
  ├── verification/       Reality engine tests (lying agent detection, SHA-256 digest validation)
  ├── agent-agnostic/     Model independence (OpenAI, Claude, MCP, state-preserving handoffs)
  └── run-all.ts          Master test runner (8/8 test suites)
cookbook/
  └── solari/             Upstream Solari Cookbook reference implementations
```

---

## Quickstart

### 1. Installation

```bash
git clone https://github.com/nothariharan/meshly.git
cd meshly
npm install
```

### 2. Run All 8 Test Suites

```bash
npm test
```

Verifies all tested safety invariants, failure chaos, malicious agent escapes, stupid agent safety, distributed edge cases, and agent-agnostic adapters:

```text
================================================================================
  TEST SUMMARY MATRIX (8/8 SUITES)
================================================================================
  1. Invariant Tests:        ✓ PASSED (14/14 Invariants)
  2. Distributed Edge Cases: ✓ PASSED (3/3 Scenarios: Re-verification, State Detection, Causal Events)
  3. Failure Chaos:          ✓ PASSED (3/3 Scenarios)
  4. Security Red-Team:      ✓ PASSED (5/5 Attacks Intercepted)
  5. Malicious Agent Escapes: ✓ PASSED (6/6 Escalation & Egress Attempts Blocked)
  6. Reality Verifier:       ✓ PASSED (3/3 Proofs Validated)
  7. Stupid Agent Safety:    ✓ PASSED (4/4 Delusion, Loop & Hallucination Defenses)
  8. Agent-Agnostic Adapters: ✓ PASSED (4/4 OpenAI, Claude, MCP & Model Handoffs)
--------------------------------------------------------------------------------
  TOTAL STATUS:              100% GREEN • VERIFIED RUNTIME KERNEL (TESTED SAFETY INVARIANTS)
================================================================================
```

### 3. Launch the Operator Console

```bash
npm run console
```

Open `http://localhost:3400` to inspect:
- **Execution Graph**: `Intent → Action → Observation → Verification → Commit`.
- **Signature Verification Screen**: Reality divergence alert with interactive takeover and compensation controls.
- **Warm Pools**: Live breakdown across Browser, Sandbox MicroVM, and GUI Desktop pools.
- **Scheduler Decisions**: Real-time placement scoring with human-readable rationale arrays.

### 4. Run the Flagship Multi-Primitive Workflow

```bash
npm run workflow:reconciliation
# or: npm start
```

Harmonizes all three Solari primitives (Cloud Browser, MicroVM Sandbox, GUI Desktop), catches a lying agent claim on a locked ERP, executes SAGA compensating rollback, resumes from snapshot, and produces a tamper-evident SHA-256 audit digest.

### 5. Export a Tamper-Evident Run Bundle

```bash
npm run cli -- export run_stripe_recon_01
```

Generates a content-addressed directory containing `run.json`, `events.jsonl`, `state-diff.json`, `authority.json`, and `evidence.json` with canonical SHA-256 integrity.

---

## Solari Configuration

Meshly operates seamlessly with or without a live Solari API key:
- **With `SOLARI_API_KEY`**: Leases real Cloud Browsers, MicroVM Sandboxes, and GUI Desktops via `@solarisdk/browser` and `@solarisdk/sdk`.
- **Without `SOLARI_API_KEY`** (or in CI): Automatically uses the built-in `SimulatorExecutionFabric`, delivering high-fidelity simulation with zero external dependencies.

```bash
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
```

---

## Upstream Cookbook Reference

The original Solari Cookbook examples are preserved in:
[`cookbook/solari/`](cookbook/solari/)

They provide atomic, runnable snippets demonstrating raw Solari SDK capabilities (launch, profiles, recordings, port preview, computer use).

---

## Documentation

- [Why Meshly? Architecture & Philosophy](docs/why-meshly.md)
- [First-Class Runs & The Execution Graph](docs/concepts/runs.md)
- [Concepts & Architecture](docs/concepts.md)
- [Runtime Specification](docs/runtime.md)
- [SDK Guide](docs/sdk.md)

---

## License

MIT © [Meshly Contributors](https://github.com/nothariharan/meshly)
