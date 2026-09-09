# @meshly/solari

Meshly `ExecutionFabric` adapter for Solari browsers, sandboxes, and desktops.

```ts
import { Meshly } from "@meshly/sdk"
import { SolariExecutionFabric } from "@meshly/solari"

const mesh = new Meshly({
  execution: new SolariExecutionFabric({ apiKey: process.env.SOLARI_API_KEY }),
})
```
