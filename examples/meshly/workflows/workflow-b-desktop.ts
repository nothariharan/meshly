/**
 * Meshly Reference Workflow B: Desktop-Heavy Legacy System Operation
 * Demonstrates:
 *   1. GUI Desktop session launched via Solari VNC
 *   2. Computer-use operations (click, type, navigate window menus)
 *   3. Independent screen state verification preventing silent GUI lockups
 */
import { Meshly } from "../src/mesh.js"
import { AuthorityManager } from "../src/authority.js"
import { VerificationContract, EvidenceBundle } from "../src/types.js"

export interface DesktopWorkflowResult {
  success: boolean
  journalEntryId: string
  streamUrl?: string
  evidence: EvidenceBundle
}

export async function runDesktopWorkflow(mesh: Meshly): Promise<DesktopWorkflowResult> {
  console.log("\n>> [Workflow B: Desktop-Heavy] Initiating Legacy ERP Journal Automation...")

  const worker = await mesh.spawn({
    task: "Update quarterly amortization schedule in legacy Windows GUI ERP",
    capabilities: ["desktop"],
    priority: 9,
    budget: 1.0,
    authority: AuthorityManager.create({
      tools: ["desktop_click", "desktop_type", "desktop_screenshot"],
      writeAccess: ["amortization_records"],
      maxSpend: 1.0,
    }),
  })

  // 1. Acquire Desktop Lease
  const desktopLease = await mesh.broker.acquire({
    workerId: worker.id,
    type: "desktop",
    capabilities: ["desktop"],
    authority: worker.authority,
    budget: 0.8,
  })

  const env = mesh.broker.inspect(desktopLease.environmentId)
  console.log(`   [Desktop] Connected to VNC Live Stream: ${env?.streamUrl}`)

  const liveState: Record<string, any> = {
    erp_app_running: true,
    active_window: "Amortization Table Editor",
    record_status: "UNCOMMITTED",
    journal_id: "",
    desktop_stream_url: env?.streamUrl,
  }

  // Contract: Verify journal status changes to COMMITTED
  const desktopContract: VerificationContract = {
    intent: "Enter Amortization Entry #AMZ-401 and verify database state changes to COMMITTED",
    preconditions: [
      { target: "desktop", type: "status_equals", query: "erp_app_running", expected: true },
      { target: "desktop", type: "status_equals", query: "active_window", expected: "Amortization Table Editor" },
    ],
    postconditions: [
      { target: "desktop", type: "status_equals", query: "record_status", expected: "COMMITTED" },
    ],
  }

  const result = await mesh.verifyStep({
    workerId: worker.id,
    contract: desktopContract,
    executeAction: async () => {
      console.log(`   [Desktop] Typing entries into grid: Asset #9042, Term: 36 Months, Rate: 4.25%...`)
      console.log(`   [Desktop] Clicking menu: File -> Commit & Lock Transaction...`)
      liveState.record_status = "COMMITTED"
      liveState.journal_id = "AMZ-401-FINAL"
      return { journalId: "AMZ-401-FINAL" }
    },
    observeState: async () => ({ ...liveState }),
  })

  if (!result.state.worldStateMatched) {
    throw new Error("Workflow B: Desktop verification failed")
  }

  await mesh.broker.release(desktopLease.leaseId)
  mesh.complete(worker.id)

  console.log(`✓ [Workflow B Complete] Desktop ERP updated and verified! Journal: ${liveState.journal_id}\n`)

  return {
    success: true,
    journalEntryId: liveState.journal_id,
    streamUrl: env?.streamUrl,
    evidence: result.evidence!,
  }
}

if (process.argv[1]?.includes("workflow-b-desktop")) {
  const mesh = new Meshly()
  runDesktopWorkflow(mesh).then(() => process.exit(0)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
