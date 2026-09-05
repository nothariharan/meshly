# Why Meshly?

> **"Agents reason. Solari executes. Meshly governs the gap between the two."**

---

## 1. The Core Problem: The Autonomous Execution Gap

The industry has achieved unprecedented reasoning density in frontier foundation models (GPT-4o, Claude 3.5 Sonnet, reasoning models). Simultaneously, cloud execution primitives have matured: **Solari** provides pristine Cloud Browsers, ephemeral Firecracker MicroVM Sandboxes, and interactive GUI Desktops accessible over unified APIs.

Yet, despite intelligent models and capable environments, **autonomous worker systems in enterprise production fail repeatedly**.

When an engineering team attempts to transition from an interactive chatbot to an autonomous agent executing consequential multi-step tasks, failures emerge not from model intelligence, but from **governance and distributed systems failures**:

1. **Delusion & Verification Gap**: An agent calls a payment tool, receives a network timeout, and either hallucinates that the payment failed (triggering a duplicate charge) or hallucinates that the payment succeeded (leaving invoices unpaid). The agent *claims* success, but the physical reality of the world diverged.
2. **Authority & Privilege Escalation**: An agent tasked with reconciling invoices decides to delegate work to a sub-agent. Without mathematical isolation, the sub-agent inherits unconstrained toolsets, writes to unauthorized paths, or exfiltrates data to external endpoints.
3. **Environment Volatility & State Loss**: An agent executing a 45-minute workflow across a browser and desktop loses connection when an underlying container cycles. The agent has no checkpointed state, no causal event lineage, and no warm-resume capability. The entire run must either restart from step zero or thrash indefinitely.
4. **Thrashing Loops & Runaway Budgets**: A model encounters an unexpected modal dialogue or DOM variation and retries the identical tool call 40 times in a tight loop, exhausting budget ceilings and locking compute resources.

These are not model flaws. These are **classic distributed systems failure modes** operating with nondeterministic actors.

---

## 2. The Architectural Boundary

Meshly enforces a strict separation of concerns across the modern agentic stack:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT REASONING                      │
│       OpenAI GPT-4o • Anthropic Claude • Custom MCP     │
│   (Plans steps, chooses tools, interprets observations)  │
└────────────────────────────┬────────────────────────────┘
                             │  AgentActionRequest
                             ▼
┌─────────────────────────────────────────────────────────┐
│              MESHLY RUNTIME GOVERNANCE LAYER            │
│  • First-Class Run Lifecycle & Monotonic Event Timeline │
│  • Monotonic Authority Narrowing (A_child ⊆ A_parent)   │
│  • Reality Engine (Agent Claim vs Physical World State) │
│  • State Checkpointing, SAGA Rollback & Pre-warming     │
└────────────────────────────┬────────────────────────────┘
                             │  Scoped Environment Lease
                             ▼
┌─────────────────────────────────────────────────────────┐
│                SOLARI EXECUTION FABRIC                  │
│       Cloud Browsers • MicroVM Sandboxes • Desktops     │
│   (Provides compute, network, OS primitives & streaming)│
└─────────────────────────────────────────────────────────┘
```

Meshly **does not generate tokens**. Meshly **does not execute OS syscalls**. 
Meshly governs the contract, state, authority, verification, and causal timeline between reasoning models and execution environments.

---

## 3. The 10 Invariants of Meshly

Meshly guarantees 10 operational and mathematical invariants across every run:

| Invariant | System Guarantee | Production Failure Prevented |
| :--- | :--- | :--- |
| **I1: Monotonic Sequence** | Every system event has a strictly increasing sequence number $S_{n+1} > S_n$ with causal parent linking. | Race conditions, out-of-order event delivery, un-traceable audit logs. |
| **I2: Monotonic Authority** | Sub-agent authority envelope is strictly bounded: $A_{child} \subseteq A_{parent}$. | Privilege escalation, rogue child agents accessing unapproved tools or budgets. |
| **I3: Pre-Execution Interception** | Policy validation occurs *before* any tool or environment dispatch. | Unauthorized database writes, unapproved domain network egress. |
| **I4: Reality Decoupling** | Step commit requires independent physical verification ($Claim \land Match$). | Delusional agents reporting success while the underlying task silently failed. |
| **I5: Quarantine on Divergence** | If world state mismatches claimed completion, commit is halted and side effects quarantined. | Cascading corruption of databases and ledgers from unverified agent steps. |
| **I6: Re-Verification on Timeout** | After network/transport timeouts, re-verify physical state before attempting any retry. | Duplicate payments, duplicate orders, double-spend vulnerabilities. |
| **I7: Stale State Interception** | Re-observing environment state after pause/resume catches external screen mutation. | Blind execution continuation on corrupted, altered, or logged-out screens. |
| **I8: Hard Spend Ceilings** | Financial spend caps are enforced synchronously at the execution barrier. | Runaway loops burning hundreds of dollars in API/compute fees. |
| **I9: Exclusive Leases** | Environments are bound to exactly one worker lease at any point in time. | Cross-tenant data contamination, concurrent agent session collisions. |
| **I10: Atomic Rollback** | Step failure dispatches compensating SAGA rollback actions in reverse order. | Partial database mutations and dirty environment states. |

---

## 4. Why Solari is the Execution Star

Solari is built for high-performance agent execution. It replaces fragile self-hosted headless Chrome nodes and slow Docker startup times with:
- **Instant Browser Sessions**: Cloud browsers with persistent authenticated profiles, anti-bot handling, and high-fidelity video replay.
- **Firecracker MicroVMs**: Sub-second ephemeral sandboxes with isolated filesystem sandboxing and network isolation.
- **Interactive Desktops**: Full GUI X11/Wayland desktop environments with live WebRTC/VNC streaming and low-latency mouse/keyboard dispatch.

Meshly treats Solari as a **first-class execution fabric**:
- Warm pools of Solari browsers, sandboxes, and desktops are maintained ready-to-run.
- The Meshly Scheduler scores workers against warm environments, reusing profiles and loaded files to eliminate cold starts.
- Every Solari replay URL and VNC stream is attached directly to the immutable Meshly Run timeline.

---

## 5. Summary

Enterprises cannot adopt autonomous agents if they cannot trust their side effects. 

By treating agents like untrusted distributed workers and governing them through mathematically bounded authority, independent reality verification, and content-addressed evidence bundles, **Meshly transforms fragile agent scripts into reliable enterprise infrastructure.**
