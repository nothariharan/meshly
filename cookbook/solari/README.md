# Solari Reference Examples

These are the upstream reference examples for [Solari](https://getsolari.com) — cloud browsers, sandboxes, and desktops behind one API key.

Meshly is built on top of Solari as its execution substrate. The examples here represent the foundational primitives that informed Meshly's `SolariExecutionFabric` adapter.

## Available Reference Implementations

### Cloud Browser
* [`browser-quickstart-ts`](browser-quickstart-ts) — TypeScript: Launch a browser, open a page, read DOM
* [`browser-quickstart-py`](browser-quickstart-py) — Python: Launch a browser, open a page, read DOM
* [`browser-stealth-proxy-ts`](browser-stealth-proxy-ts) — TypeScript: Stealth mode + residential proxy egress
* [`browser-profiles-ts`](browser-profiles-ts) — TypeScript: Log in once, reuse the session forever
* [`browser-session-recording-py`](browser-session-recording-py) — Python: Record a session, download replay

### Sandbox
* [`sandbox-quickstart-ts`](sandbox-quickstart-ts) — TypeScript: Run commands, write and read files in microVM
* [`sandbox-code-interpreter-py`](sandbox-code-interpreter-py) — Python: Stateful Python kernel for agent loops
* [`sandbox-port-preview-ts`](sandbox-port-preview-ts) — TypeScript: Expose a server in the VM on a public URL

### Desktop
* [`desktop-computer-use-py`](desktop-computer-use-py) — Python: Screenshot, click, and type on a Linux GUI
