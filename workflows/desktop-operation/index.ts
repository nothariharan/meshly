/**
 * Operations worker: Browser lookup → Sandbox processing → Desktop GUI ticket.
 * Same Meshly kernel as reconciliation. No new architecture.
 */
import { Meshly } from "@meshly/sdk"

export async function runDesktopWorkflow(mesh?: Meshly) {
  const client = mesh || new Meshly({ preferSimulator: true })
  const worker = await client.spawn({
    name: "operations",
    kind: "operations",
    task: "Operations worker: system lookup and desktop ticket",
    capabilities: ["browser", "sandbox", "desktop"],
    budget: 2,
  })
  const run = await worker.run({ destroyAfter: true })
  console.log(`\nMESHLY  operations worker  ${run.status}  ${run.runId}\n`)
  return { worker, run, success: run.status === "COMPLETED" }
}

const isDirect = process.argv[1]?.includes("desktop-operation")
if (isDirect) {
  runDesktopWorkflow().then((res) => process.exit(res.success ? 0 : 1))
}
