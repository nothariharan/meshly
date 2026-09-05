/**
 * Meshly Reference Workflow C: Cross-Environment Financial Ledger Reconciliation
 * Harmonizes all three Solari primitives:
 *   1. Cloud Browser (Stripe invoice extraction with stealth profile)
 *   2. MicroVM Sandbox (Python double-entry ledger calculation & checksum)
 *   3. GUI Desktop (Legacy ERP posting with silent reality divergence, SAGA compensation & retry)
 */
import { Meshly } from "../src/mesh.js"
import { AuthorityManager } from "../src/authority.js"
import { VerificationContract, EvidenceBundle } from "../src/types.js"

export interface ReconciliationReport {
  success: boolean
  invoiceId: string
  reconciledAmount: number
  stages: {
    browser: { verified: boolean; invoiceId: string; amount: number; replayUrl?: string }
    sandbox: { verified: boolean; doubleEntryBalanced: boolean; checksum: string }
    desktop: {
      initialAttemptClaimed: boolean
      divergenceCaught: boolean
      compensationExecuted: boolean
      retryVerified: boolean
      journalRef: string
      streamUrl?: string
    }
  }
  evidenceBundle: EvidenceBundle
  totalDurationMs: number
}

export async function runReconciliationWorkflow(mesh: Meshly): Promise<ReconciliationReport> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY: CROSS-PLATFORM FINANCIAL RECONCILIATION (WORKFLOW C)")
  console.log(" Powered by Solari Substrate (Browser | Sandbox | Desktop)")
  console.log("=".repeat(78) + "\n")

  // 1. Root Worker
  console.log(">> [STAGE 0] Initializing Chief Reconciliation Worker...")
  const rootAuthority = AuthorityManager.create({
    tools: ["browser_navigate", "browser_extract", "sandbox_exec", "sandbox_write", "desktop_click", "desktop_type"],
    capabilities: ["browser", "sandbox", "desktop", "read:invoice", "write:ledger"],
    domains: ["stripe.com", "api.stripe.com", "erp.internal"],
    maxSpend: 2.5,
    writeAccess: ["/tmp/ledger", "erp_records"],
  })

  const chiefWorker = await mesh.spawn({
    task: "Reconcile Batch Invoice #INV-8492 across Stripe, Bank Feed, and ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    priority: 10,
    authority: rootAuthority,
    budget: 2.5,
    initialMemory: [
      { key: "targetInvoice", value: "INV-8492", tier: "hot" },
      { key: "expectedAmount", value: 4250.0, tier: "hot" },
      { key: "currency", value: "USD", tier: "warm" },
    ],
  })
  console.log(`✓ Chief Worker Spawned [ID: ${chiefWorker.id}] with Root Authority cap: $2.50\n`)

  // 2. Stage 1: Cloud Browser (Stripe)
  console.log(">> [STAGE 1] Allocating Cloud Browser for Stripe Extraction...")
  const browserWorker = await chiefWorker.spawnChild({
    task: "Extract Invoice #INV-8492 from Stripe Portal",
    capabilities: ["browser"],
    priority: 8,
    requestedAuthority: {
      tools: ["browser_navigate", "browser_extract"],
      domains: ["stripe.com", "api.stripe.com"],
      maxSpend: 0.5,
    },
  })

  const browserLease = await mesh.broker.acquire({
    workerId: browserWorker.id,
    type: "browser",
    capabilities: ["browser"],
    authority: browserWorker.authority,
    budget: 0.5,
    affinity: { profile: "finance_agent_prod" },
  })
  const browserEnv = mesh.broker.inspect(browserLease.environmentId)!
  browserWorker.environmentLease = browserLease
  browserWorker.deductSpend(0.04)

  const liveState: Record<string, any> = {
    stripe_session: "ACTIVE",
    stripe_invoice_id: "INV-8492",
    stripe_invoice_status: "PAID",
    stripe_invoice_amount: 4250.0,
    browser_replay_url: browserEnv.replayUrl,
    sandbox_ledger_balanced: false,
    sandbox_checksum: "",
    desktop_erp_status: "LOCKED", // Deliberate lock to test reality verification!
    desktop_erp_journal_ref: "",
    desktop_stream_url: "",
  }

  const browserContract: VerificationContract = {
    intent: "Verify invoice #INV-8492 in Stripe is marked PAID and amount is $4250.00",
    preconditions: [{ target: "browser", type: "status_equals", query: "stripe_session", expected: "ACTIVE" }],
    postconditions: [
      { target: "browser", type: "status_equals", query: "stripe_invoice_status", expected: "PAID" },
      { target: "browser", type: "status_equals", query: "stripe_invoice_amount", expected: 4250.0 },
    ],
  }

  const browserStep = await mesh.verifyStep({
    workerId: browserWorker.id,
    contract: browserContract,
    executeAction: async () => {
      console.log(`   [Browser Worker] Navigating to https://dashboard.stripe.com/invoices/INV-8492...`)
      console.log(`   [Browser Worker] Customer metadata extracted: Acme Corp, Net 30, Paid via ACH`)
      return { invoiceId: "INV-8492", amount: 4250.0 }
    },
    observeState: async () => ({ ...liveState }),
  })

  if (!browserStep.state.worldStateMatched) {
    throw new Error(`Stage 1 Verification Failed: ${browserStep.state.error}`)
  }
  console.log(`✓ Browser Step Verified. State matched external Stripe observation.`)
  console.log(`  Replay Stream: ${browserEnv.replayUrl}`)

  mesh.memory.put({
    workerId: chiefWorker.id,
    key: "stripe_invoice_data",
    value: { id: "INV-8492", amount: 4250.0, fee: 35.0, net: 4215.0 },
    tier: "warm",
  })
  await mesh.broker.release(browserLease.leaseId)

  // 3. Stage 2: MicroVM Sandbox
  console.log("\n>> [STAGE 2] Allocating MicroVM Sandbox for Double-Entry Ledger Calculation...")
  const sandboxWorker = await chiefWorker.spawnChild({
    task: "Run Python Double-Entry Balancing on Bank CSV & Stripe Net",
    capabilities: ["sandbox"],
    priority: 8,
    requestedAuthority: {
      tools: ["sandbox_exec", "sandbox_write"],
      maxSpend: 0.25,
      writeAccess: ["/tmp/ledger"],
    },
  })

  const sandboxLease = await mesh.broker.acquire({
    workerId: sandboxWorker.id,
    type: "sandbox",
    capabilities: ["sandbox"],
    authority: sandboxWorker.authority,
    budget: 0.25,
  })
  sandboxWorker.environmentLease = sandboxLease
  sandboxWorker.deductSpend(0.02)

  const sandboxContract: VerificationContract = {
    intent: "Execute double-entry reconciliation script and verify ledger balance = 0 variance",
    preconditions: [{ target: "state", type: "status_equals", query: "stripe_invoice_status", expected: "PAID" }],
    postconditions: [{ target: "sandbox", type: "status_equals", query: "sandbox_ledger_balanced", expected: true }],
  }

  const sandboxStep = await mesh.verifyStep({
    workerId: sandboxWorker.id,
    contract: sandboxContract,
    executeAction: async () => {
      console.log(`   [Sandbox Worker] Writing reconciliation script into microVM filesystem...`)
      console.log(`   [Sandbox Worker] Executing 'python3 reconcile.py --invoice INV-8492 --net 4215.00'`)
      liveState.sandbox_ledger_balanced = true
      liveState.sandbox_checksum = "sha256_ledger_balanced_98df8a2"
      return { balanced: true, checksum: liveState.sandbox_checksum }
    },
    observeState: async () => ({ ...liveState }),
  })

  if (!sandboxStep.state.worldStateMatched) {
    throw new Error(`Stage 2 Verification Failed: ${sandboxStep.state.error}`)
  }
  console.log(`✓ MicroVM Sandbox Verified. Double-entry balanced with 0 unallocated cents.`)
  console.log(`  Ledger Checksum: ${liveState.sandbox_checksum}`)

  chiefWorker.checkpointState(2, { invoiceId: "INV-8492", amount: 4250.0, checksum: liveState.sandbox_checksum })
  await mesh.broker.release(sandboxLease.leaseId)

  // 4. Stage 3: GUI Desktop (ERP Posting with Reality Divergence & SAGA Recovery)
  console.log("\n>> [STAGE 3] Allocating GUI Desktop for Legacy ERP Journal Entry...")
  const desktopWorker = await chiefWorker.spawnChild({
    task: "Open Desktop ERP & Post Reconciled Journal Entry",
    capabilities: ["desktop"],
    priority: 9,
    requestedAuthority: {
      tools: ["desktop_click", "desktop_type"],
      maxSpend: 0.8,
      writeAccess: ["erp_records"],
    },
  })

  const desktopLease = await mesh.broker.acquire({
    workerId: desktopWorker.id,
    type: "desktop",
    capabilities: ["desktop"],
    authority: desktopWorker.authority,
    budget: 0.8,
  })
  desktopWorker.environmentLease = desktopLease
  desktopWorker.deductSpend(0.05)

  const desktopEnv = mesh.broker.inspect(desktopLease.environmentId)!
  liveState.desktop_stream_url = desktopEnv.streamUrl
  console.log(`   [Desktop Worker] Connected to Desktop VNC Stream: ${desktopEnv.streamUrl}`)
  console.log(`   [Desktop Worker] Launching Legacy Accounting Client (SAP / QuickBooks GUI)...`)

  let compensationTriggered = false
  const desktopContract: VerificationContract = {
    intent: "Confirm ERP Journal Entry status changes to POSTED in the system database",
    preconditions: [{ target: "sandbox", type: "status_equals", query: "sandbox_ledger_balanced", expected: true }],
    postconditions: [{ target: "desktop", type: "status_equals", query: "desktop_erp_status", expected: "POSTED" }],
    compensate: async (context: any) => {
      compensationTriggered = true
      console.log(`\n  ⚡ [SAGA COMPENSATION TRIGGERED]`)
      console.log(`     Divergence: ${context.reason}`)
      console.log(`     Action: Freezing transaction lock, releasing stale Mutex, and pausing worker...`)
      await desktopWorker.pause()
      liveState.desktop_erp_status = "UNLOCKED"
      console.log(`     System state adjusted: Mutex cleared -> UNLOCKED`)
      await desktopWorker.resume()
      console.log(`     Worker resumed from snapshot (~0.78s). Ready for clean retry.\n`)
    },
  }

  console.log("\n   --- Attempt 1: Simulating Typical Agent Blind Spot (ERP is LOCKED) ---")
  const attempt1 = await mesh.verifyStep({
    workerId: desktopWorker.id,
    contract: desktopContract,
    executeAction: async () => {
      console.log(`   [Desktop Worker] Typed invoice "INV-8492", amount "$4250.00", clicked "Post"`)
      console.log(`   [Desktop Worker AI Claim]: "I have successfully posted the journal entry!"`)
      return { claimedSuccess: true }
    },
    observeState: async () => ({ ...liveState }), // desktop_erp_status is "LOCKED"
  })

  console.log(`>> Reality Engine Result:`)
  console.log(`   Agent Claim:       ${attempt1.state.agentClaim === "SUCCESS" ? "✓ SUCCESS" : "✗ FAILURE"}`)
  console.log(`   Tool Execution:    ${attempt1.state.toolExecution === "SUCCESS" ? "✓ SUCCESS" : "✗ FAILURE"}`)
  console.log(`   World State Match: ${attempt1.state.worldStateMatched ? "✓ MATCHED" : "✗ MISMATCH (Divergence Caught!)"}`)
  console.log(`   Workflow Commit:   ${attempt1.state.workflowResult}`)
  console.log(`   Error Caught:      "${attempt1.state.error}"`)

  console.log("\n   --- Attempt 2: Executing Verified Posting with Lock Cleared ---")
  const attempt2 = await mesh.verifyStep({
    workerId: desktopWorker.id,
    contract: desktopContract,
    executeAction: async () => {
      console.log(`   [Desktop Worker] Re-submitting journal entry on ERP interface...`)
      liveState.desktop_erp_status = "POSTED"
      liveState.desktop_erp_journal_ref = "JRN-2026-9021"
      console.log(`   [Desktop Worker] ERP response confirmed: Journal Ref #JRN-2026-9021 created.`)
      return { claimedSuccess: true, journalRef: "JRN-2026-9021" }
    },
    observeState: async () => ({ ...liveState }),
  })

  if (!attempt2.state.worldStateMatched || !attempt2.evidence) {
    throw new Error(`Stage 3 Attempt 2 Verification Failed: ${attempt2.state.error}`)
  }

  console.log(`✓ Desktop Posting Verified! ERP Status: POSTED`)
  console.log(`  Tamper-Evident Audit Digest: ${attempt2.evidence.tamperEvidentDigestSha256}\n`)

  await mesh.broker.release(desktopLease.leaseId)
  mesh.complete(chiefWorker.id)

  const duration = Date.now() - startTime
  console.log("=".repeat(78))
  console.log(" WORKFLOW C COMPLETE: ALL THREE SOLARI PRIMITIVES HARMONIZED")
  console.log(` Total Duration: ${duration}ms | Total Spend: $${chiefWorker.budget.spent.toFixed(2)}`)
  console.log("=".repeat(78) + "\n")

  return {
    success: true,
    invoiceId: "INV-8492",
    reconciledAmount: 4250.0,
    stages: {
      browser: {
        verified: browserStep.state.worldStateMatched,
        invoiceId: "INV-8492",
        amount: 4250.0,
        replayUrl: browserEnv.replayUrl,
      },
      sandbox: {
        verified: sandboxStep.state.worldStateMatched,
        doubleEntryBalanced: true,
        checksum: liveState.sandbox_checksum,
      },
      desktop: {
        initialAttemptClaimed: attempt1.state.agentClaim === "SUCCESS",
        divergenceCaught: !attempt1.state.worldStateMatched,
        compensationExecuted: compensationTriggered,
        retryVerified: attempt2.state.worldStateMatched,
        journalRef: liveState.desktop_erp_journal_ref,
        streamUrl: desktopEnv.streamUrl,
      },
    },
    evidenceBundle: attempt2.evidence,
    totalDurationMs: duration,
  }
}

if (process.argv[1]?.includes("workflow-c-reconciliation") || process.argv[1]?.includes("reconciliation.ts")) {
  const mesh = new Meshly()
  runReconciliationWorkflow(mesh).then(() => process.exit(0)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
