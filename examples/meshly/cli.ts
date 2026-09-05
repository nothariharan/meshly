#!/usr/bin/env node
/**
 * Meshly Minimalist CLI
 * Vercel + Kubernetes-style command line interface for inspecting and controlling autonomous workers.
 */
import { Meshly } from "./src/mesh.js"
import { runContractTests } from "./tests/invariants.test.js"
import { runHighDensitySimulation } from "./src/simulator.js"

const mesh = new Meshly()

async function cli() {
  const args = process.argv.slice(2)
  const command = args[0] || "help"
  const subcommand = args[1]
  const targetId = args[2]

  switch (command) {
    case "workers": {
      console.log("\n  ID            STATUS      TASK                                            SPENT")
      console.log("  " + "-".repeat(72))
      const workers = mesh.listWorkers()
      if (workers.length === 0) {
        console.log("  (no workers currently spawned — run 'meshly simulate' or 'meshly demo')\n")
        return
      }
      for (const w of workers) {
        const idCol = w.id.padEnd(13)
        const statusCol = w.status.padEnd(11)
        const taskCol = (w.task.length > 44 ? w.task.slice(0, 41) + "..." : w.task).padEnd(47)
        const spendCol = `$${w.budget.spent.toFixed(2)}`
        console.log(`  ${idCol} ${statusCol} ${taskCol} ${spendCol}`)
      }
      console.log("")
      break
    }

    case "worker": {
      if (subcommand === "get" && targetId) {
        const w = mesh.getWorker(targetId)
        if (!w) {
          console.error(`Worker '${targetId}' not found.`)
          return
        }
        console.log(`\nWorker ${w.id}`)
        console.log(`  Task:         ${w.task}`)
        console.log(`  Status:       ${w.status}`)
        console.log(`  Priority:     ${w.priority}`)
        console.log(`  Budget:       $${w.budget.spent.toFixed(2)} / $${w.budget.maxSpend.toFixed(2)} ${w.budget.currency}`)
        console.log(`  Capabilities: ${w.capabilities.join(", ")}`)
        console.log(`  Current Step: ${w.context.currentStep}`)
        console.log(`  Lease ID:     ${w.environmentLease?.leaseId || "none"}\n`)
      } else if (subcommand === "pause" && targetId) {
        await mesh.pause(targetId)
        console.log(`✓ Worker ${targetId} paused (environment compute frozen).`)
      } else if (subcommand === "resume" && targetId) {
        await mesh.resume(targetId)
        console.log(`✓ Worker ${targetId} resumed from snapshot.`)
      } else if (subcommand === "cancel" && targetId) {
        await mesh.cancel(targetId, "CLI command")
        console.log(`✓ Worker ${targetId} cancelled (all descendants terminated).`)
      } else {
        console.log("Usage: meshly worker <get|pause|resume|cancel> <workerId>")
      }
      break
    }

    case "environments": {
      console.log("\n  ID                  TYPE      STATUS    PROFILE             LEASE ID")
      console.log("  " + "-".repeat(72))
      const envs = mesh.broker.list()
      if (envs.length === 0) {
        console.log("  (no environments currently allocated in pool)\n")
        return
      }
      for (const e of envs) {
        const idCol = e.id.padEnd(20)
        const typeCol = e.type.padEnd(9)
        const statusCol = e.status.padEnd(9)
        const profileCol = (e.profile || "-").padEnd(19)
        const leaseCol = e.currentLeaseId || "-"
        console.log(`  ${idCol} ${typeCol} ${statusCol} ${profileCol} ${leaseCol}`)
      }
      console.log("")
      break
    }

    case "simulate": {
      const count = parseInt(subcommand || "100", 10)
      await runHighDensitySimulation(mesh, count)
      break
    }

    case "test": {
      await runContractTests()
      break
    }

    case "runs":
    case "events": {
      console.log("\n  EVENT ID            TYPE                     WORKER ID")
      console.log("  " + "-".repeat(60))
      const events = mesh.events.query({ limit: 15 })
      for (const evt of events) {
        const idCol = evt.id.padEnd(19)
        const typeCol = evt.type.padEnd(24)
        const workerCol = evt.workerId || "-"
        console.log(`  ${idCol} ${typeCol} ${workerCol}`)
      }
      console.log("")
      break
    }

    case "help":
    default: {
      console.log(`
Meshly CLI — The Operating Layer for Autonomous Workers

Usage:
  meshly workers                     List all workers and statuses
  meshly worker get <id>             Inspect worker state and context
  meshly worker pause <id>           Freeze worker and leased environment
  meshly worker resume <id>          Resume worker compute from snapshot
  meshly worker cancel <id>          Cancel worker and cascade to children
  meshly environments                List pooled Cloud Browsers, Sandboxes, Desktops
  meshly events                      View immutable system audit events
  meshly simulate [count]            Run high-density scheduling simulation (default: 100)
  meshly test                        Run contract invariant verification test suite
`)
      break
    }
  }
}

cli().catch((err) => {
  console.error("Meshly CLI error:", err)
  process.exit(1)
})
