# Reconciliation worker

This is the thing Meshly is for.

An agent can claim a payment posted. Meshly will not commit that claim until an independent check of the world agrees.

```text
Worker
  ↓
Capabilities
  ↓
Policy
  ↓
Execution
  ↓
Verification
  ↓
Commit
```

```text
Browser        payment = PAID
Sandbox        ledger = UNPAID
Desktop        ERP = POSTED | UNPAID
                 ↓
            VERIFY
           ┌─────┴─────┐
           ▼           ▼
       VERIFIED     BLOCKED
```

## Run

From the Meshly repo, after `npm install`:

```bash
npx tsx examples/reconciliation-worker/src/index.ts
npx tsx examples/reconciliation-worker/src/index.ts --diverge
npx tsx examples/reconciliation-worker/src/index.ts --unknown
```

From a Meshly install:

```bash
meshly init --api-key <key>
meshly run
meshly demo blocked
meshly demo unknown
```

## What each file is

| Path | Role |
|---|---|
| `src/index.ts` | Spawn the worker and run it. Public SDK only. |
| `policy/finance.reconcile.ts` | Tools, capabilities, spend cap. Issued before execution. |
| `verification/contract.ts` | What must be true in the world before commit. |

Copy this folder to start a new worker. Change the task, the policy, and the contract. You should not need to change Meshly core.

## The two decisions that matter

Agent claim SUCCESS + world MISMATCH:

```text
COMMIT BLOCKED
```

Side effect may have occurred, result never returned:

```text
UNKNOWN
```

UNKNOWN does not mean FAILED. Verify. Do not blindly retry.

```ts
if (run.status === "UNKNOWN") {
  await run.verify()
}
```
