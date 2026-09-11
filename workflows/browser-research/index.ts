/**
 * Research worker: Browser collect → Sandbox analysis → verified report.
 * Same Meshly kernel as reconciliation. No new architecture.
 */
import { Meshly } from "@meshly/sdk"

export async function runResearchWorkflow(mesh?: Meshly) {
  const client = mesh || new Meshly({ preferSimulator: true })
  const worker = await client.spawn({
    name: "research",
    kind: "research",
    task: "Collect information and write a verified report",
    capabilities: ["browser", "sandbox"],
    budget: 2,
  })
  const run = await worker.run({ destroyAfter: true })
  console.log(`\nMESHLY  research worker  ${run.status}  ${run.runId}\n`)
  return { worker, run, success: run.status === "COMPLETED" }
}

const isDirect = process.argv[1]?.includes("browser-research")
if (isDirect) {
  runResearchWorkflow().then((res) => process.exit(res.success ? 0 : 1))
}
