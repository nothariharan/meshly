/**
 * Public worker API only. Do not import recipes or the kernel.
 *
 * Coding Worker: Sandbox → Browser QA → Artifact
 */
import { Meshly, type RunInstance } from "@meshly/sdk"

export async function runCodingWorker(mesh = new Meshly({ preferSimulator: true })): Promise<RunInstance> {
  const worker = await mesh.workers.spawn({
    name: "coding",
    kind: "coding",
    task: "Modify a repository, run tests, and browser-QA the artifact",
    capabilities: ["sandbox", "browser"],
  })
  return worker.run({ destroyAfter: true })
}
