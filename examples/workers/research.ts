/**
 * Public worker API only. Do not import recipes or the kernel.
 *
 * Research Worker: Browser → Sandbox → Report
 */
import { Meshly, type RunInstance } from "@meshly/sdk"

export async function runResearchWorker(mesh = new Meshly({ preferSimulator: true })): Promise<RunInstance> {
  const worker = await mesh.workers.spawn({
    name: "research",
    kind: "research",
    task: "Collect information, analyze it, and produce a verified report",
    capabilities: ["browser", "sandbox"],
  })
  return worker.run({ destroyAfter: true })
}
