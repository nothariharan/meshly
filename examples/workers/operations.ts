/**
 * Public worker API only. Do not import recipes or the kernel.
 *
 * Operations Worker: Browser → Desktop → Verification
 */
import { Meshly, type RunInstance } from "@meshly/sdk"

export async function runOperationsWorker(mesh = new Meshly({ preferSimulator: true })): Promise<RunInstance> {
  const worker = await mesh.workers.spawn({
    name: "operations",
    kind: "operations",
    task: "Look up system status, process the incident, and file a desktop ops ticket",
    capabilities: ["browser", "sandbox", "desktop"],
  })
  return worker.run({ destroyAfter: true })
}
