# Solari Infrastructure Substrate Integration

Meshly uses **Solari** as its underlying execution substrate. Solari provides unified cloud compute across three distinct primitives behind a single API key:
1. **Cloud Browsers** (`@solarisdk/browser`)
2. **MicroVM Sandboxes** (`@solarisdk/sdk`)
3. **GUI Desktops** (`@solarisdk/sdk`)

---

## 1. How Meshly Bridges to Solari

Meshly implements the `ExecutionFabric` abstraction via `@meshly/solari`:

```typescript
import { SolariExecutionFabric } from "@meshly/solari"
import { Meshly } from "@meshly/sdk"

const fabric = new SolariExecutionFabric({
  apiKey: process.env.SOLARI_API_KEY,
  fallbackToSimulator: true, // Gracefully simulate if key is unset
})

const mesh = new Meshly({ executionFabric: fabric })
```

### Cloud Browsers
- **Stealth Profiles:** Launches anti-detect Chromium sessions configured with persistent user profiles so workers avoid repeated login challenges and bot-detection blocks.
- **Session Recordings:** Solari captures session video replays, which Meshly automatically embeds into its tamper-evident evidence bundles (`evidence.replays.browser`).

### MicroVM Sandboxes
- **Ephemeral Linux microVMs:** Provisions hardware-isolated sandboxes in seconds.
- **File System & Execution:** Workers upload input datasets, run Python scripts or shell pipelines, and extract generated outputs.
- **Timeouts & Termination:** Leases strictly govern sandbox lifespan; idle sandboxes are safely recycled.

### GUI Desktops
- **Interactive Windows/Linux Desktops:** Supports legacy enterprise ERPs (SAP, QuickBooks), thick desktop clients, and GUI software lacking public APIs.
- **Live VNC Streaming:** Desktops expose a low-latency VNC stream (`streamUrl`) that Meshly surfaces in the Operator Console for human-in-the-loop takeover.
- **Sub-second VM Pause/Resume:** Meshly leverages Solari's virtual machine suspend/resume capabilities to freeze compute during human review, saving costs and preserving memory.

---

## 2. High-Fidelity Simulator Fabric

For continuous integration, unit testing, and local development without cloud consumption, Meshly includes a **Simulator Execution Fabric** (`SimulatorExecutionFabric`).

- Deterministic execution without network latency.
- Full fidelity mock handles for browsers (navigation, DOM inspection), sandboxes (filesystem, shell commands), and desktops (mouse, keyboard, VNC mock).
- Simulates 100+ concurrent workers in milliseconds.

Enable simulator mode anytime:
```typescript
const mesh = new Meshly({ preferSimulator: true })
```

---

## 3. Upstream Cookbook Reference

The original Solari Cookbook examples remain available in the repository under:
`cookbook/solari/`

They serve as reference implementations for basic Solari SDK capabilities:
- `cookbook/solari/browser-launch`
- `cookbook/solari/browser-profile`
- `cookbook/solari/browser-recording`
- `cookbook/solari/sandbox-code`
- `cookbook/solari/sandbox-files`
- `cookbook/solari/sandbox-preview`
- `cookbook/solari/desktop-click`
- `cookbook/solari/desktop-type`
- `cookbook/solari/desktop-screenshot`
