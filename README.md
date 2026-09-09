# Meshly

The operating system for autonomous workers.

**wsp** manages where an agent works. **Meshly** manages how autonomous work executes safely.

Agents reason. Solari executes. Meshly makes sure what the agent intended is actually what happened.

Locked definition: [docs/product.md](docs/product.md)

## Product loop

From this repo (packages are not on npm yet):

```bash
npm install
npm run build
cp .env.example .env          # add SOLARI_API_KEY for live Solari
npm run meshly -- init
npm run meshly -- worker create --name invoice-reconciler --task "Reconcile today's payments with the ERP" --capabilities browser,sandbox,desktop
npm run meshly -- run invoice-reconciler
npm run meshly -- dev         # http://localhost:3400
```

`meshly init` writes `.meshly/`. `meshly dev` is the operator console. It reads that directory. There is no seeded demo data.

Without credits:

```bash
npm run meshly -- init --yes --provider simulator
npm run meshly -- live --simulator
npm run meshly -- fail --simulator   # claim succeeds, world mismatches, commit BLOCKED
```

With `SOLARI_API_KEY`, omit `--simulator`. Live Solari is the default. Failures surface. Meshly will not silently fall back to the simulator.

## Console

Workers · Runs · Environments · Policies

The run page is the product:

```
INTENT → ACTION → OBSERVATION → VERIFICATION → COMMIT
```

An agent claim is not equivalent to reality. If verification fails, commit stays **BLOCKED**. Re-verify, take over, and SAGA compensate are real operations on persisted run state.

Keyboard: `1–4` switches sections, `c` creates a worker.

## SDK

```ts
import { Meshly, Solari } from "@meshly/sdk"

const mesh = new Meshly({
  execution: new Solari({ apiKey: process.env.SOLARI_API_KEY }),
})

const worker = await mesh.spawn({
  task: "Reconcile today's payments with the ERP",
  capabilities: ["browser", "sandbox", "desktop"],
})

const run = await worker.run()
```

You should not have to manage Solari sessions yourself.

## Packages

| Package | Role |
|---|---|
| `@meshly/core` | Kernel: workers, runs, authority, verify, recover |
| `@meshly/solari` | ExecutionFabric → Solari browsers, sandboxes, desktops |
| `@meshly/sdk` | `new Meshly`, `workers.spawn`, `worker.run()` |
| `@meshly/cli` | `meshly` human CLI |
| `@meshly/console` | Operator app (`meshly dev`) |
| `meshly` | Unscoped bin so `npx meshly` works after publish |

Not published. Do not publish `.env`, `.meshly/`, cookbook, or this private workspace root.

## Honesty

- `meshly simulate` / `meshly benchmark` are **scheduler simulations**, not live Solari capacity tests.
- SHA-256 on a run is tamper-evident execution evidence. It does not prove the observation is true.
- Kernel tests (`npm test`) prove invariants. A live Solari run proves the product exists.

## Tests

```bash
npm test
npm run dry-test    # pack tarballs → empty dir → SDK + CLI
```

## License

MIT
