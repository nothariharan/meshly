# @meshly/sdk

Developer API for Meshly.

```ts
import { Meshly } from "@meshly/sdk"
import { SolariExecutionFabric } from "@meshly/solari"

const mesh = new Meshly({
  execution: new SolariExecutionFabric({ apiKey: process.env.SOLARI_API_KEY }),
})

const worker = await mesh.workers.spawn({
  name: "invoice-reconciler",
  task: "Reconcile today's payments with the ERP",
  capabilities: ["browser", "sandbox", "desktop"],
})

const run = await worker.run()
console.log(run.status)
```
