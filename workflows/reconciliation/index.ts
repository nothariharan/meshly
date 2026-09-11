/**
 * Flagship worker: reconcile today's payments with the ERP.
 * Browser observation → sandbox computation → desktop mutation → independent verify.
 */
import { Meshly } from "@meshly/sdk"

export async function runReconciliationWorkflow(mesh?: Meshly) {
  const client = mesh || new Meshly({ preferSimulator: true })
  console.log("\nMESHLY  reconciliation worker")
  console.log(`  mode  ${client.mode}\n`)

  const worker = await client.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    budget: 2,
  })

  const run = await worker.run({ destroyAfter: true })
  console.log(`  run     ${run.runId}`)
  console.log(`  status  ${run.status}`)
  for (const step of run.steps) {
    console.log(`  ${step.stepIndex}. ${step.status.padEnd(11)} ${step.intent}`)
    if (step.observation?.payment_status) console.log(`     payment ${step.observation.payment_status}`)
    if (step.observation?.ledger) console.log(`     ledger  ${step.observation.ledger}`)
    if (step.observation?.erp_status) console.log(`     erp     ${step.observation.erp_status}`)
  }
  if (run.error) console.log(`  error   ${run.error}`)
  return { worker, run, success: run.status === "COMPLETED" || run.status === "COMMITTED" }
}

const isDirect = process.argv[1]?.includes("reconciliation")
if (isDirect) {
  runReconciliationWorkflow().then((res) => {
    process.exit(res.success ? 0 : 1)
  })
}
