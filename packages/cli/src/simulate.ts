import { Meshly, AuthorityManager } from "@meshly/sdk"

/** Scheduler simulation. Not a live Solari concurrency test. */
export async function runSimulation(mesh: Meshly, workerCount: number = 100) {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(78))
  console.log(` MESHLY: WORKER SCHEDULER SIMULATION (${workerCount} WORKERS)`)
  console.log(" Simulated environment pool — not live Solari capacity.")
  console.log("=".repeat(78) + "\n")

  const initialPoolSpecs: Array<{ type: "browser" | "sandbox" | "desktop"; profile?: string }> = [
    { type: "browser", profile: "salesforce-crm" },
    { type: "browser", profile: "stripe-portal" },
    { type: "browser" },
    { type: "browser" },
    { type: "browser" },
    { type: "sandbox" },
    { type: "sandbox" },
    { type: "sandbox" },
    { type: "desktop" },
    { type: "desktop" },
  ]

  console.log(`[Simulator] Pre-warming ${initialPoolSpecs.length} environments...`)
  const dummyAuth = AuthorityManager.issue({ tools: ["*"] })
  for (const spec of initialPoolSpecs) {
    const lease = await mesh.broker.acquire({
      workerId: "prewarm_bootstrap",
      type: spec.type,
      authority: dummyAuth,
      budget: 1.0,
      affinity: { profile: spec.profile },
    })
    await mesh.broker.release(lease.leaseId)
  }

  const tasks = [
    { task: "Scrape pricing from competitor SaaS", caps: ["browser"], profile: "stripe-portal", priority: 7 },
    { task: "Execute Python anomaly detection script", caps: ["sandbox"], priority: 5 },
    { task: "Post journal entries in legacy desktop ERP", caps: ["desktop"], priority: 9 },
    { task: "Verify billing dispute in CRM", caps: ["browser"], profile: "salesforce-crm", priority: 8 },
    { task: "Run nightly database integrity batch", caps: ["sandbox"], priority: 4 },
  ]

  for (let i = 0; i < workerCount; i++) {
    const template = tasks[i % tasks.length]
    await mesh.spawn({
      task: `[Job #${i + 1}] ${template.task}`,
      capabilities: template.caps as any,
      priority: template.priority + (i % 3 === 0 ? 1 : 0),
      deadline: i % 5 === 0 ? new Date(Date.now() + 30_000) : undefined,
      budget: 0.5,
      metadata: { profile: template.profile },
    })
  }

  const maxQueue = mesh.scheduler.getQueueLength()
  let completed = 0
  let totalReuses = 0

  while (mesh.scheduler.getQueueLength() > 0 || mesh.scheduler.getActiveCount() > 0) {
    const next = await mesh.scheduleNext()
    if (next.worker && next.lease) {
      next.worker.deductSpend(0.01)
      const env = mesh.broker.inspect(next.lease.environmentId)
      if (env?.lastActiveAt) totalReuses += 1
      mesh.runtime.complete(next.worker.id)
      completed += 1
    } else {
      break
    }
  }

  const stats = mesh.stats()
  console.log("\n" + "=".repeat(78))
  console.log(" SCHEDULER SIMULATION COMPLETE")
  console.log("=".repeat(78))
  console.log(` Workers processed:       ${completed}`)
  console.log(` Max queue depth:         ${maxQueue}`)
  console.log(` Warm reuses:             ${totalReuses}`)
  console.log(` Duration:                ${Date.now() - startTime}ms`)
  console.log(` Environments in pool:    ${stats.environments.total}`)
  console.log("=".repeat(78) + "\n")
}
