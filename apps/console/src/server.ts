/**
 * @meshly/console - Operator Console & Control Plane
 * Minimalist, Vercel/Linear-inspired dark UI with REST endpoints.
 * Operates on pure Node.js HTTP with zero external dependencies.
 */
import http from "node:http"
import { URL } from "node:url"
import { Meshly } from "@meshly/sdk"

const meshly = new Meshly({ preferSimulator: true })
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3400

// Initialize sample worker pool for demonstration
async function seedDemoData() {
  const w1 = await meshly.spawn({
    task: "Reconcile Q3 multi-tenant billing & verify Stripe webhook deliveries",
    capabilities: ["browser", "sandbox"],
    priority: 9,
    budget: 2.5,
    authority: {
      tools: ["stripe_api", "postgres_query", "browser_verify"],
      capabilities: ["browser", "sandbox"],
      domains: ["stripe.com", "billing.internal"],
      maxSpend: 2.5,
      expiresAt: new Date(Date.now() + 3600_000),
    },
    initialMemory: [
      { key: "tenant_id", value: "org_enterprise_99", tier: "hot" },
      { key: "expected_discrepancy", value: 142.5, tier: "warm" },
    ],
  })

  await meshly.spawn({
    task: "Extract dynamic SaaS pricing tables across 10 competitors",
    capabilities: ["browser"],
    priority: 6,
    budget: 1.0,
    metadata: { profile: "competitor-scout" },
  })

  await meshly.spawn({
    task: "Update legacy desktop SAP ledger amortization schedules",
    capabilities: ["desktop"],
    priority: 8,
    budget: 3.0,
  })

  // Schedule first worker to allocate environment
  await meshly.scheduleNext()
}

seedDemoData().catch(console.error)

function renderHtml(title: string, bodyContent: string, currentPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meshly Console — ${title}</title>
  <style>
    :root {
      --bg: #09090b;
      --surface: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(18, 18, 21, 0.8);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      font-family: var(--mono);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.1);
      color: var(--accent);
      border: 1px solid rgba(59, 130, 246, 0.2);
    }
    nav {
      display: flex;
      gap: 16px;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    nav a:hover, nav a.active {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    nav a.active {
      border-bottom: 2px solid var(--accent);
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    .grid-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: 26px;
      font-weight: 700;
      font-family: var(--mono);
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .panel-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 10px 20px;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      font-weight: 500;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.2);
    }
    td {
      padding: 12px 20px;
      border-bottom: 1px solid rgba(39, 39, 42, 0.5);
    }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: var(--mono); font-size: 13px; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--mono);
      font-weight: 600;
    }
    .status-RUNNING, .status-BUSY, .status-READY { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-QUEUED, .status-WAITING, .status-STARTING { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .status-PAUSED, .status-IDLE { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .status-FAILED, .status-LOST { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: rgba(255, 255, 255, 0.14); }
    .btn-danger { color: #f87171; }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); }
    .digest-box {
      background: #000;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--mono);
      font-size: 12px;
      color: #38bdf8;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <strong style="font-size: 16px; letter-spacing: -0.02em;">Meshly</strong>
      <span class="badge">Operating Layer</span>
    </div>
    <nav>
      <a href="/" class="${currentPath === "/" ? "active" : ""}">Overview</a>
      <a href="/workers" class="${currentPath === "/workers" ? "active" : ""}">Workers</a>
      <a href="/environments" class="${currentPath === "/environments" ? "active" : ""}">Environments</a>
      <a href="/runs" class="${currentPath === "/runs" ? "active" : ""}">Evidence & Runs</a>
      <a href="/policies" class="${currentPath === "/policies" ? "active" : ""}">Policies</a>
    </nav>
    <div>
      <a href="/api/stats" target="_blank" class="btn">REST API</a>
    </div>
  </header>
  <main>
    ${bodyContent}
  </main>
</body>
</html>`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  const pathname = url.pathname

  // REST API Routes
  if (pathname === "/api/stats") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.stats(), null, 2))
  }

  if (pathname === "/api/workers") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.workers.list(), null, 2))
  }

  if (pathname === "/api/environments") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.broker.list(), null, 2))
  }

  if (pathname === "/api/events") {
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.events.query({ limit }), null, 2))
  }

  // Worker Control Actions
  if (req.method === "POST" && pathname.startsWith("/api/worker/")) {
    const parts = pathname.split("/")
    const workerId = parts[3]
    const action = parts[4]

    try {
      if (action === "pause") await meshly.runtime.pause(workerId)
      else if (action === "resume") await meshly.runtime.resume(workerId)
      else if (action === "cancel") await meshly.runtime.cancel(workerId, "Operator action")

      res.writeHead(302, { Location: "/workers" })
      return res.end()
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ error: err.message }))
    }
  }

  // HTML Web Views
  const stats = meshly.stats()

  if (pathname === "/") {
    const workers = meshly.workers.list()
    const envs = meshly.broker.list()
    const recentEvents = meshly.events.query({ limit: 8 })

    const html = `
      <div class="grid-metrics">
        <div class="metric-card">
          <div class="metric-label">Total Workers</div>
          <div class="metric-value">${stats.totalWorkers}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Active Workers</div>
          <div class="metric-value" style="color: #34d399;">${stats.activeWorkers}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Scheduler Queue</div>
          <div class="metric-value">${stats.queueLength}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pooled Environments</div>
          <div class="metric-value">${stats.environments.total}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Audit Events</div>
          <div class="metric-value" style="color: #60a5fa;">${stats.totalEvents}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>Active Autonomous Workers</span>
          <a href="/workers" class="btn">View All</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Budget Spend</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${workers.slice(0, 5).map(w => `
              <tr>
                <td class="mono">${w.id}</td>
                <td>${w.task}</td>
                <td><span class="status-pill status-${w.status}">${w.status}</span></td>
                <td class="mono">${w.priority}</td>
                <td class="mono">$${w.budget.spent.toFixed(2)} / $${w.budget.maxSpend.toFixed(2)}</td>
                <td>
                  <form method="POST" action="/api/worker/${w.id}/${w.status === "PAUSED" ? "resume" : "pause"}" style="display:inline;">
                    <button class="btn">${w.status === "PAUSED" ? "Resume" : "Pause"}</button>
                  </form>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>Execution Environments (Solari Fabric)</span>
          <a href="/environments" class="btn">Manage Pool</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Environment ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Current Lease</th>
              <th>Replay / Stream</th>
            </tr>
          </thead>
          <tbody>
            ${envs.length === 0 ? `<tr><td colspan="5" style="color: var(--muted); text-align:center;">No environments currently allocated.</td></tr>` : envs.map(e => `
              <tr>
                <td class="mono">${e.id}</td>
                <td><span class="badge">${e.type}</span></td>
                <td><span class="status-pill status-${e.status}">${e.status}</span></td>
                <td class="mono">${e.currentLeaseId || "—"}</td>
                <td>${e.replayUrl ? `<a href="${e.replayUrl}" target="_blank" class="btn">Browser Replay</a>` : (e.streamUrl ? `<a href="${e.streamUrl}" target="_blank" class="btn">VNC Stream</a>` : "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Overview", html, "/"))
  }

  if (pathname === "/workers") {
    const workers = meshly.workers.list()
    const html = `
      <div class="panel">
        <div class="panel-header">
          <span>All Autonomous Workers (${workers.length})</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Worker ID</th>
              <th>Task</th>
              <th>Status</th>
              <th>Step</th>
              <th>Budget</th>
              <th>Tiered Memory</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            ${workers.map(w => `
              <tr>
                <td class="mono"><strong>${w.id}</strong></td>
                <td>
                  <div>${w.task}</div>
                  <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Caps: ${w.capabilities.join(", ")}</div>
                </td>
                <td><span class="status-pill status-${w.status}">${w.status}</span></td>
                <td class="mono">${w.context.currentStep}</td>
                <td class="mono">$${w.budget.spent.toFixed(2)}</td>
                <td>
                  <span class="badge" style="font-size: 10px;">${w.memory.filter(m => m.tier === "hot").length} Hot</span>
                  <span class="badge" style="font-size: 10px; color: var(--muted); border-color: var(--border);">${w.memory.filter(m => m.tier === "warm").length} Warm</span>
                </td>
                <td>
                  <form method="POST" action="/api/worker/${w.id}/${w.status === "PAUSED" ? "resume" : "pause"}" style="display:inline;">
                    <button class="btn">${w.status === "PAUSED" ? "Resume" : "Pause"}</button>
                  </form>
                  <form method="POST" action="/api/worker/${w.id}/cancel" style="display:inline; margin-left: 6px;">
                    <button class="btn btn-danger">Cancel</button>
                  </form>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Workers", html, "/workers"))
  }

  if (pathname === "/environments") {
    const envs = meshly.broker.list()
    const html = `
      <div class="panel">
        <div class="panel-header">
          <span>Execution Fabric Pool (${envs.length} active/warm environments)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Profile</th>
              <th>Accumulated Cost</th>
              <th>Observability</th>
            </tr>
          </thead>
          <tbody>
            ${envs.length === 0 ? `<tr><td colspan="6" style="text-align:center; color: var(--muted);">Pool is currently cold. Spawn workers to warm environments.</td></tr>` : envs.map(e => `
              <tr>
                <td class="mono"><strong>${e.id}</strong></td>
                <td><span class="badge">${e.type}</span></td>
                <td><span class="status-pill status-${e.status}">${e.status}</span></td>
                <td class="mono">${e.profile || "none"}</td>
                <td class="mono">$${e.cost.toFixed(2)}</td>
                <td>
                  ${e.replayUrl ? `<a href="${e.replayUrl}" target="_blank" class="btn">View Replay</a>` : ""}
                  ${e.streamUrl ? `<a href="${e.streamUrl}" target="_blank" class="btn">Live VNC</a>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Environments", html, "/environments"))
  }

  if (pathname === "/runs") {
    const events = meshly.events.query({ limit: 30 })
    const html = `
      <div class="panel">
        <div class="panel-header">
          <span>Tamper-Evident Evidence & Audit Stream</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Event ID</th>
              <th>Type</th>
              <th>Worker</th>
              <th>Details & Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(evt => `
              <tr>
                <td class="mono">${evt.id}</td>
                <td><span class="status-pill status-IDLE">${evt.type}</span></td>
                <td class="mono">${evt.workerId || "—"}</td>
                <td>
                  ${evt.data?.digest ? `<div class="digest-box">SHA-256: ${evt.data.digest}</div>` : `<pre style="font-size: 11px; color: var(--muted);">${JSON.stringify(evt.data)}</pre>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Evidence & Runs", html, "/runs"))
  }

  if (pathname === "/policies") {
    const html = `
      <div class="panel">
        <div class="panel-header">
          <span>Authority Policies & Security Invariants</span>
        </div>
        <div style="padding: 24px;">
          <h3 style="margin-bottom: 12px;">Monotonic Authority Narrowing ($A_{child} \\subseteq A_{parent}$)</h3>
          <p style="color: var(--muted); margin-bottom: 20px;">
            Meshly intercepts all agent actions before execution. Child sub-agents cannot widen parent tool permissions, exceed parent spend caps, or expand domain allowlists.
          </p>
          <div class="digest-box" style="padding: 16px;">
// Example Intercepted Policy Rule
{
  "maxSpend": 2.50,
  "allowedDomains": ["stripe.com", "internal.corp"],
  "allowedTools": ["stripe_api", "postgres_query", "browser_verify"],
  "monotonicDelegation": true,
  "preExecutionInterception": true
}
          </div>
        </div>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Policies", html, "/policies"))
  }

  res.writeHead(404, { "Content-Type": "text/plain" })
  res.end("Not Found")
})

server.listen(PORT, () => {
  console.log(`[Meshly Console] Control plane web dashboard listening at http://localhost:${PORT}`)
})
