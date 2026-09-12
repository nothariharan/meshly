/**
 * Canonical Meshly worker.
 *
 * Worker → Capabilities → Policy → Execution → Verification → Commit
 *
 * Copy this folder. Change the task, policy, and contract.
 * Do not import Meshly recipes or the kernel.
 */
import { Meshly, explainDecision, formatDecision, isUnknownStatus } from "@meshly/sdk"
import { issueReconcilePolicy, POLICY_NAME } from "../policy/finance.reconcile.ts"
import { describeContract } from "../verification/contract.ts"

const diverge = process.argv.includes("--diverge")
const timeout = process.argv.includes("--unknown")

async function main() {
  const mesh = new Meshly(
    process.env.SOLARI_API_KEY
      ? { solariApiKey: process.env.SOLARI_API_KEY, fallbackToSimulator: false }
      : { preferSimulator: true },
  )

  const worker = await mesh.workers.spawn({
    name: "invoice-reconciler",
    kind: "reconciliation",
    task: "Reconcile today's payment records with the ERP",
    capabilities: ["browser", "sandbox", "desktop"],
    budget: 2,
    authority: issueReconcilePolicy(2),
  })

  console.log(`\nWorker        ${worker.name} (${worker.id})`)
  console.log(`Capabilities  ${worker.capabilities.join(" · ")}`)
  console.log(`Policy        ${POLICY_NAME}`)
  console.log(`Contract\n${describeContract().split("\n").map((l) => `  ${l}`).join("\n")}`)
  console.log(`Mode          ${mesh.mode}\n`)

  const run = await worker.run({
    destroyAfter: true,
    scenario: timeout ? "ambiguous-timeout" : diverge ? "reality-divergence" : "default",
  })

  console.log(`Run           ${run.runId}`)
  console.log(`Status        ${run.status}`)
  if (isUnknownStatus(run.status)) {
    const check = await run.verify()
    console.log(`Verified      ${check.matched}${check.error ? ` — ${check.error}` : ""}`)
    console.log("UNKNOWN does not mean FAILED. Meshly did not retry the side effect.")
  }
  console.log("")
  console.log(formatDecision(explainDecision(run, { policy: POLICY_NAME, authority: worker.id })))
  console.log("")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
