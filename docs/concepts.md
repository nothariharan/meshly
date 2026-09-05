# Meshly Core Concepts & Theory of Operation

### 1. Workers vs. Environments

In legacy agent systems, an "agent" and its "sandbox" are tightly coupled inside one container. If the agent crashes, the sandbox is destroyed; if the sandbox terminates, the agent dies.

In Meshly:
- A **Worker** is a logical entity with an objective, a task queue, an authority envelope, and a memory store.
- An **Environment** is physical compute provisioned in the cloud (a Solari Cloud Browser, MicroVM Sandbox, or GUI Desktop).
- The bridge between them is a **First-Class Lease** (`EnvironmentLease`).

A Worker can hold a lease, release it to the warm pool, acquire a different environment type (e.g. pivoting from Browser to Sandbox), or freeze its environment into a snapshot while waiting for human input.

---

### 2. Monotonic Authority Narrowing

$$A_{\text{child}} \subseteq A_{\text{parent}}$$

Autonomous workers frequently spawn sub-agents to parallelize work. If sub-agents could request arbitrary capabilities, a compromised or hallucinating sub-agent could access unauthorized internal tools, exceed financial spend, or exfiltrate data.

Meshly enforces mathematical narrowing on delegation:
1. **Tools:** Child tools $\subseteq$ Parent tools.
2. **Capabilities:** Child capabilities $\subseteq$ Parent capabilities.
3. **Domains:** Child domain allowlist $\subseteq$ Parent domain allowlist.
4. **Max Spend:** $\min(\text{ParentMaxSpend}, \text{RequestedSpend})$.
5. **Write Access:** Child write targets $\subseteq$ Parent write targets.
6. **Lifespan:** Child expiration $\le$ Parent expiration.

Pre-execution policy checks intercept any attempt by a worker or model to execute an unauthorized tool or access a disallowed network host before the payload reaches the environment.

---

### 3. Reality Verification Engine

An LLM generating tool calls cannot be trusted to verify its own consequences. Models regularly produce output such as:
> *"I have clicked 'Confirm Payment' and the invoice has been successfully marked as paid."*

When in reality:
- A CAPTCHA modal was blocking the button.
- The DOM element was disabled.
- The API returned a silent HTTP 409 Conflict.
- The database connection had timed out.

Meshly's Reality Engine introduces formal verification contracts:
```typescript
interface VerificationContract {
  intent: string
  preconditions: VerificationCondition[]   // Checked before tool executes
  postconditions: VerificationCondition[]  // Checked independently after tool executes
  compensate?: (context: any) => Promise<void> // SAGA rollback on divergence
}
```

Meshly decouples the result into four distinct fields:
- **`agentClaim`**: What the model believed happened (`"SUCCESS"`).
- **`toolExecution`**: Whether the process exited with code 0 (`"SUCCESS"`).
- **`worldStateMatched`**: Whether external physical state satisfies the postconditions (`false`!).
- **`workflowResult`**: The final commit status (`"FAILURE"`).

When `agentClaim` is `"SUCCESS"` but `worldStateMatched` is `false`, Meshly catches the divergence, triggers compensating rollback, and halts invalid downstream writes.

---

### 4. Content-Addressed Evidence Bundles

When high-stakes agents take financial, compliance, or infrastructure actions, enterprises require proof of what actually occurred.

Meshly generates a **tamper-evident evidence bundle** for every verified action:
- Initial observed state (before)
- Post-action observed state (after)
- Replay URLs (Solari browser session recordings, VNC desktop stream captures)
- MicroVM exit logs
- **SHA-256 Digest**: A cryptographic hash computed over the canonical state diff, worker ID, and intent.

Any post-hoc modification to the audit trail invalidates the digest.

---

### 5. SAGA Distributed Transactions

Agent workflows spanning heterogeneous systems (e.g. Browser + MicroVM + Desktop) cannot use ACID two-phase commits. If Step 3 fails after Step 1 and Step 2 have already made real-world mutations, the system must compensate in reverse.

Meshly implements the **SAGA Pattern**:
- Each step defines both a forward action and a reverse `compensate` handler.
- If Step $N$ fails or diverges, Meshly aborts the transaction and executes compensation handlers in reverse order ($N-1, \dots, 1$).
- Workers are automatically paused during compensation and can be resumed cleanly once the underlying condition is addressed.
