/**
 * @meshly/console - Operator Console & Control Plane
 * Minimalist, Vercel/Linear-inspired dark UI with REST endpoints.
 * Operates on pure Node.js HTTP with zero external dependencies.
 */
import http from "node:http"
import { URL } from "node:url"
import { createHash } from "node:crypto"
import { Meshly, AuthorityManager } from "@meshly/sdk"

const meshly = new Meshly({ preferSimulator: true })
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3400

// In-memory takeover and compensation logs for interactive demo buttons
const takeoverLogs: Record<string, string[]> = {}
const compensationLogs: Record<string, string[]> = {}

async function seedDemoData() {
  // 1. Seed Workers
  const w1 = await meshly.spawn({
    task: "Reconcile Q3 multi-tenant billing & verify Stripe webhook deliveries",
    capabilities: ["browser", "sandbox"],
    priority: 9,
    budget: 5.0,
    authority: AuthorityManager.issue({
      tools: ["stripe_api", "postgres_query", "browser_verify"],
      capabilities: ["browser", "sandbox"],
      domains: ["stripe.com", "billing.internal"],
      maxSpend: 5.0,
      lifespanMs: 3600_000,
    }),
    initialMemory: [
      { key: "tenant_id", value: "org_enterprise_99", tier: "hot" },
      { key: "expected_discrepancy", value: 142.5, tier: "warm" },
    ],
  })

  const w2 = await meshly.spawn({
    task: "Extract dynamic SaaS pricing tables across 10 competitors",
    capabilities: ["browser"],
    priority: 6,
    budget: 1.5,
    metadata: { profile: "competitor-scout" },
  })

  const w3 = await meshly.spawn({
    task: "Update legacy desktop SAP ledger amortization schedules",
    capabilities: ["desktop"],
    priority: 8,
    budget: 4.0,
  })

  // 2. Pre-warm environments in the fabric pool
  await meshly.broker.acquire({ workerId: w1.id, type: "browser", authority: w1.authority, budget: 1.0 })
  await meshly.broker.acquire({ workerId: w1.id, type: "sandbox", authority: w1.authority, budget: 1.0 })
  await meshly.broker.acquire({ workerId: w2.id, type: "browser", authority: w2.authority, budget: 1.0 })
  await meshly.broker.acquire({ workerId: w3.id, type: "desktop", authority: w3.authority, budget: 1.0 })

  // Also pre-warm several idle environments to demonstrate pool depth
  meshly.broker.register("browser", { profile: "authenticated-session" })
  meshly.broker.register("browser", { profile: "clean-session" })
  meshly.broker.register("sandbox", {})
  meshly.broker.register("sandbox", {})
  meshly.broker.register("desktop", {})

  // 3. Schedule first worker
  await meshly.scheduleNext()

  // 4. Seed First-Class Runs

  // RUN 1: Successful multi-step reconciliation run
  const run1 = meshly.runs.create(w1)
  run1.recordEnvironment("env_browser_01")
  run1.recordEnvironment("env_sandbox_01")

  const step1 = run1.createStep({
    intent: "Query Stripe API for uncaptured customer charges",
    action: { tool: "stripe_api", args: { endpoint: "/v1/charges", query: "status:uncaptured" }, description: "Fetch pending charges" },
  })
  run1.updateStepStatus(step1.id, "committed", {
    agentClaim: "SUCCESS",
    toolExecution: "SUCCESS",
    worldStateMatched: true,
    observation: { status: 200, count: 4, sumCents: 485000 },
    evidence: {
      workerId: w1.id,
      jobId: "job_run1_step1",
      intent: "Query Stripe API for uncaptured customer charges",
      timestamp: Date.now() - 120_000,
      verified: true,
      agentClaim: "SUCCESS",
      worldStateMatch: true,
      stateDiff: { before: { status: "IDLE" }, after: { status: "COMMITTED" } },
      replays: { browser: "https://console.getsolari.com/replays/sim_1" },
      tamperEvidentDigestSha256: createHash("sha256").update("run1_step1_proof").digest("hex"),
      stepIndex: 1,
      target: "api",
      preconditionPassed: true,
      postconditionPassed: true,
      rawObservations: { httpStatus: 200, chargesFound: 4 },
    },
  })

  const step2 = run1.createStep({
    intent: "Cross-reference PostgreSQL local ledger transactions",
    action: { tool: "postgres_query", args: { sql: "SELECT * FROM billing_ledger WHERE settled = false;" } },
  })
  run1.updateStepStatus(step2.id, "committed", {
    agentClaim: "SUCCESS",
    toolExecution: "SUCCESS",
    worldStateMatched: true,
    observation: { rowCount: 4, matched: true },
    evidence: {
      workerId: w1.id,
      jobId: "job_run1_step2",
      intent: "Cross-reference PostgreSQL local ledger transactions",
      timestamp: Date.now() - 60_000,
      verified: true,
      agentClaim: "SUCCESS",
      worldStateMatch: true,
      stateDiff: { before: { ledgerSynced: false }, after: { ledgerSynced: true } },
      replays: {},
      tamperEvidentDigestSha256: createHash("sha256").update("run1_step2_proof").digest("hex"),
      stepIndex: 2,
      target: "db",
      preconditionPassed: true,
      postconditionPassed: true,
      rawObservations: { queryTimeMs: 12, rows: 4 },
    },
  })
  run1.complete()

  // RUN 2: THE SIGNATURE VERIFICATION FAILURE RUN (Reality Divergence)
  const run2 = meshly.runs.create(w1)
  run2.recordEnvironment("env_browser_01")
  run2.recordEnvironment("env_sandbox_01")

  const run2_step1 = run2.createStep({
    intent: "Authenticate operator session on payment settlement portal",
    action: { tool: "browser_navigate", args: { url: "https://billing.internal/admin" } },
  })
  run2.updateStepStatus(run2_step1.id, "committed", {
    agentClaim: "SUCCESS",
    toolExecution: "SUCCESS",
    worldStateMatched: true,
    observation: { pageTitle: "Settlement Portal", sessionReady: true },
  })

  const run2_step2 = run2.createStep({
    intent: "Execute $4,850.00 vendor invoice settlement transaction",
    action: {
      tool: "settle_payment",
      args: { invoiceId: "INV-9821", amount: 4850.00, currency: "USD" },
      description: "Dispatch automated ACH transfer instruction",
    },
  })

  // Deliberate divergence: Model and tool claim success, but the physical ledger rejects/fails
  run2.updateStepStatus(run2_step2.id, "rejected", {
    agentClaim: "SUCCESS",
    toolExecution: "SUCCESS",
    worldStateMatched: false,
    observation: {
      httpResponse: 200,
      gatewayResponse: "OK",
      actualBankStatus: "UNPAID",
      actualLedgerBalanceRemaining: 4850.00,
      bankErrorCode: "ERR_CORRESPONDENT_HOLIDAY",
    },
    error: "REALITY_DIVERGENCE: Agent claim 'SUCCESS' does not match physical bank ledger (expected status: SETTLED, observed: UNPAID). Unverified commit BLOCKED.",
    evidence: {
      workerId: w1.id,
      jobId: "job_run2_step2",
      intent: "Execute $4,850.00 vendor invoice settlement transaction",
      timestamp: Date.now() - 10_000,
      verified: false,
      agentClaim: "SUCCESS",
      worldStateMatch: false,
      stateDiff: { before: { balance: 4850.00 }, after: { balance: 4850.00 } },
      replays: {},
      tamperEvidentDigestSha256: createHash("sha256").update("run2_step2_divergence_proof").digest("hex"),
      stepIndex: 2,
      target: "database_ledger",
      preconditionPassed: true,
      postconditionPassed: false,
      rawObservations: {
        agentClaim: "Invoice #INV-9821 successfully marked settled in UI",
        toolOutput: "HTTP 200 POST /v1/settlements succeeded",
        physicalWorldState: "Ledger status check returned UNPAID (Balance remaining: $4,850.00)",
        verdict: "FAILED_POSTCONDITION_MISMATCH",
      },
    },
  })
  run2.status = "VERIFICATION_FAILED"
  run2.error = "Step 2 failed verification: Agent claimed SUCCESS while world state matched FALSE. Commit quarantined."

  // RUN 3: Active in-flight run
  const run3 = meshly.runs.create(w2)
  run3.recordEnvironment("env_browser_02")
  const run3_step1 = run3.createStep({
    intent: "Navigate to CloudFlare pricing page and inspect DOM tier cards",
    action: { tool: "browser_navigate", args: { url: "https://www.cloudflare.com/plans/" } },
  })
  run3.updateStepStatus(run3_step1.id, "executing")
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
      --surface-subtle: #18181b;
      --border: #27272a;
      --border-accent: #3f3f46;
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
      font-size: 13.5px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(18, 18, 21, 0.85);
      backdrop-filter: blur(14px);
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
    .badge-subtle {
      font-family: var(--mono);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--muted);
      border: 1px solid var(--border);
    }
    nav {
      display: flex;
      gap: 8px;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    nav a:hover, nav a.active {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    nav a.active {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      border-bottom: 2px solid var(--accent);
    }
    main {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    .grid-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
    }
    .metric-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
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
      background: rgba(255, 255, 255, 0.02);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 10px 20px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.25);
    }
    td {
      padding: 12px 20px;
      border-bottom: 1px solid rgba(39, 39, 42, 0.5);
    }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: var(--mono); font-size: 12.5px; }
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
    .status-RUNNING, .status-BUSY, .status-READY, .status-COMPLETED, .status-committed {
      background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-QUEUED, .status-WAITING, .status-STARTING, .status-executing, .status-planned {
      background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .status-PAUSED, .status-IDLE, .status-observed, .status-authorized {
      background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .status-FAILED, .status-LOST, .status-CANCELLED, .status-rejected, .status-VERIFICATION_FAILED {
      background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover { background: rgba(255, 255, 255, 0.14); border-color: var(--border-accent); }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { color: #f87171; border-color: rgba(239, 68, 68, 0.3); }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.2); }
    .btn-warning { color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
    .btn-warning:hover { background: rgba(245, 158, 11, 0.2); }
    .btn-success { color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
    .btn-success:hover { background: rgba(16, 185, 129, 0.2); }

    .digest-box {
      background: #000;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--mono);
      font-size: 11.5px;
      color: #38bdf8;
      word-break: break-all;
    }
    .warm-pool-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .pool-item {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 16px;
    }
    .pool-item-title {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .pool-item-stat {
      font-family: var(--mono);
      font-size: 16px;
      font-weight: 600;
    }

    /* Execution Graph Flow */
    .graph-pipeline {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow-x: auto;
    }
    .graph-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      min-width: 110px;
      text-align: center;
    }
    .graph-node-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .graph-node-sub {
      font-size: 10px;
      color: var(--muted);
      margin-top: 2px;
    }
    .graph-arrow {
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }

    /* Verification Divergence Signature Alert */
    .divergence-alert-card {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .divergence-alert-card h3 {
      color: #f87171;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .divergence-grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      row-gap: 8px;
      column-gap: 16px;
      font-family: var(--mono);
      font-size: 13px;
      margin: 14px 0;
    }
    .divergence-label {
      color: var(--muted);
      font-weight: 600;
    }
    .divergence-val-success { color: #34d399; }
    .divergence-val-fail { color: #f87171; font-weight: 700; }
    .divergence-val-blocked { color: #fbbf24; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <strong style="font-size: 16px; letter-spacing: -0.02em;">Meshly</strong>
      <span class="badge">Verified Runtime Kernel</span>
    </div>
    <nav>
      <a href="/" class="${currentPath === "/" ? "active" : ""}">Overview</a>
      <a href="/runs" class="${currentPath.startsWith("/runs") ? "active" : ""}">Runs & Graph</a>
      <a href="/workers" class="${currentPath === "/workers" ? "active" : ""}">Workers</a>
      <a href="/environments" class="${currentPath === "/environments" ? "active" : ""}">Warm Pools</a>
      <a href="/scheduler" class="${currentPath === "/scheduler" ? "active" : ""}">Scheduler</a>
      <a href="/policies" class="${currentPath === "/policies" ? "active" : ""}">Policies & Authority</a>
    </nav>
    <div style="display: flex; gap: 8px;">
      <a href="/api/stats" target="_blank" class="btn">Runtime Stats</a>
      <a href="/api/runs" target="_blank" class="btn">Runs JSON</a>
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

  // ---------------------------------------------------------------------------
  // REST API ENDPOINTS
  // ---------------------------------------------------------------------------
  if (pathname === "/api/stats") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.stats(), null, 2))
  }

  if (pathname === "/api/runs") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.runs.list(), null, 2))
  }

  if (pathname.startsWith("/api/runs/")) {
    const parts = pathname.split("/")
    const runId = parts[3]
    const subAction = parts[4]

    const run = meshly.runs.get(runId)
    if (!run) {
      res.writeHead(404, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ error: `Run '${runId}' not found` }))
    }

    if (subAction === "export") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${runId}_audit_bundle.json"`,
      })
      return res.end(JSON.stringify(meshly.runs.exportBundle(runId), null, 2))
    }

    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(run, null, 2))
  }

  if (pathname === "/api/workers") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.workers.list(), null, 2))
  }

  if (pathname === "/api/environments") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.broker.list(), null, 2))
  }

  if (pathname === "/api/decisions") {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.scheduler.getRecentDecisions(), null, 2))
  }

  if (pathname === "/api/events") {
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify(meshly.events.query({ limit }), null, 2))
  }

  // Operator Action Endpoints (Takeover, Compensate, Retry, Pause/Resume)
  if (req.method === "POST" && pathname.startsWith("/api/run/")) {
    const parts = pathname.split("/")
    const runId = parts[3]
    const action = parts[4]

    const run = meshly.runs.get(runId)
    if (!run) {
      res.writeHead(404, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ error: `Run '${runId}' not found` }))
    }

    if (action === "takeover") {
      takeoverLogs[runId] = [
        `Operator attached interactive session at ${new Date().toISOString()}`,
        `Lease preserved; automated model step loop suspended`,
        `Direct terminal/DOM control granted to operator`,
      ]
      res.writeHead(302, { Location: `/runs/${runId}?notice=takeover_attached` })
      return res.end()
    }

    if (action === "compensate") {
      compensationLogs[runId] = [
        `SAGA compensating rollback dispatched at ${new Date().toISOString()}`,
        `Step 2 unverified payment transaction cancelled`,
        `Reverting local ledger state to unbilled state`,
        `Rollback confirmed; quarantine lifted`,
      ]
      run.status = "CANCELLED"
      res.writeHead(302, { Location: `/runs/${runId}?notice=compensated` })
      return res.end()
    }

    if (action === "retry") {
      run.status = "RUNNING"
      run.error = undefined
      res.writeHead(302, { Location: `/runs/${runId}?notice=retried` })
      return res.end()
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/worker/")) {
    const parts = pathname.split("/")
    const workerId = parts[3]
    const action = parts[4]

    try {
      if (action === "pause") await meshly.runtime.pause(workerId)
      else if (action === "resume") await meshly.runtime.resume(workerId)
      else if (action === "cancel") await meshly.runtime.cancel(workerId, "Operator manual action")

      res.writeHead(302, { Location: "/workers" })
      return res.end()
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ error: err.message }))
    }
  }

  // ---------------------------------------------------------------------------
  // HTML WEB VIEWS
  // ---------------------------------------------------------------------------
  const stats = meshly.stats()

  // 1. OVERVIEW VIEW
  if (pathname === "/") {
    const runs = meshly.runs.list()
    const decisions = meshly.scheduler.getRecentDecisions().slice(0, 4)
    const envs = meshly.broker.list()

    const html = `
      <div class="grid-metrics">
        <div class="metric-card">
          <div class="metric-label">Total Runs</div>
          <div class="metric-value">${stats.totalRuns}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Active Workers</div>
          <div class="metric-value" style="color: #34d399;">${stats.activeWorkers}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Warm Pool Total</div>
          <div class="metric-value">${stats.environments.total}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Verification Divergences</div>
          <div class="metric-value" style="color: #f87171;">
            ${runs.filter(r => r.status === "VERIFICATION_FAILED" || r.steps.some(s => s.worldStateMatched === false)).length}
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Audit Events</div>
          <div class="metric-value" style="color: #60a5fa;">${stats.totalEvents}</div>
        </div>
      </div>

      <!-- Warm Pool Breakdown -->
      <div class="panel">
        <div class="panel-header">
          <span>Solari Warm Pool Breakdown</span>
          <a href="/environments" class="btn">View Environments</a>
        </div>
        <div style="padding: 16px 20px;">
          <div class="warm-pool-grid">
            <div class="pool-item">
              <div class="pool-item-title">Cloud Browser Pool</div>
              <div class="pool-item-stat" style="color: #38bdf8;">
                ${stats.environments.byType.browser.idle} Ready &bull; ${stats.environments.byType.browser.busy} Busy
              </div>
              <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Pre-authenticated CDP sessions</div>
            </div>
            <div class="pool-item">
              <div class="pool-item-title">MicroVM Sandbox Pool</div>
              <div class="pool-item-stat" style="color: #a78bfa;">
                ${stats.environments.byType.sandbox.idle} Ready &bull; ${stats.environments.byType.sandbox.busy} Busy
              </div>
              <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Hot Firecracker microVM execution</div>
            </div>
            <div class="pool-item">
              <div class="pool-item-title">GUI Desktop Pool</div>
              <div class="pool-item-stat" style="color: #34d399;">
                ${stats.environments.byType.desktop.idle} Ready &bull; ${stats.environments.byType.desktop.busy} Busy
              </div>
              <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Live X11 / Wayland VNC streaming</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Runs Summary -->
      <div class="panel">
        <div class="panel-header">
          <span>First-Class Task Runs</span>
          <a href="/runs" class="btn">View All Runs</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Objective</th>
              <th>Worker ID</th>
              <th>Status</th>
              <th>Steps</th>
              <th>Execution Graph</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${runs.map(r => `
              <tr>
                <td class="mono"><a href="/runs/${r.runId}" style="color: #38bdf8; text-decoration: none;"><strong>${r.runId}</strong></a></td>
                <td>${r.objective}</td>
                <td class="mono">${r.workerId}</td>
                <td><span class="status-pill status-${r.status}">${r.status}</span></td>
                <td class="mono">${r.steps.length}</td>
                <td>
                  <span style="font-size: 11px; color: var(--muted); font-family: var(--mono);">
                    Intent &rarr; Action &rarr; Observe &rarr; Verify &rarr; ${r.status === "VERIFICATION_FAILED" ? "<strong style='color:#f87171;'>BLOCKED</strong>" : "<strong style='color:#34d399;'>Commit</strong>"}
                  </span>
                </td>
                <td>
                  <a href="/runs/${r.runId}" class="btn ${r.status === "VERIFICATION_FAILED" ? "btn-danger" : ""}">
                    ${r.status === "VERIFICATION_FAILED" ? "Inspect Divergence" : "Graph"}
                  </a>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <!-- Observable Scheduler Decisions -->
      <div class="panel">
        <div class="panel-header">
          <span>Observable Scheduler Placements</span>
          <a href="/scheduler" class="btn">All Decisions</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Worker ID</th>
              <th>Target Env</th>
              <th>Environment Type & Score</th>
              <th>Rationale / Reasons</th>
            </tr>
          </thead>
          <tbody>
            ${decisions.length === 0 ? `<tr><td colspan="5" style="color:var(--muted); text-align:center;">No scheduling events yet.</td></tr>` : decisions.map(d => `
              <tr>
                <td class="mono" style="color: var(--muted);">${new Date(d.timestamp).toLocaleTimeString()}</td>
                <td class="mono"><strong>${d.workerId}</strong></td>
                <td class="mono">${d.environmentId || "—"}</td>
                <td><span class="badge">${d.targetType.toUpperCase()} (Score: ${d.score.toFixed(1)})</span></td>
                <td>
                  <ul style="padding-left: 16px; font-size: 11.5px; color: var(--muted);">
                    ${d.reasons.map(r => `<li>${r}</li>`).join("")}
                  </ul>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Overview", html, "/"))
  }

  // 2. RUNS LIST VIEW (/runs)
  if (pathname === "/runs") {
    const runs = meshly.runs.list()

    const html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">Task Runs & Execution Graph</h2>
          <p style="color: var(--muted); font-size: 13px;">Every task is modeled as a first-class Run with explicit step stages: Intent &rarr; Action &rarr; Observation &rarr; Verification &rarr; Commit</p>
        </div>
        <div>
          <a href="/api/runs" target="_blank" class="btn">Export All Runs JSON</a>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>All Recorded Runs (${runs.length})</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Objective</th>
              <th>Worker ID</th>
              <th>Status</th>
              <th>Step Count</th>
              <th>Started At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${runs.map(r => `
              <tr>
                <td class="mono">
                  <a href="/runs/${r.runId}" style="color: #38bdf8; text-decoration: none;"><strong>${r.runId}</strong></a>
                </td>
                <td>
                  <div><strong>${r.objective}</strong></div>
                  <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
                    Envs: ${r.environments.length > 0 ? r.environments.join(", ") : "pooled"}
                  </div>
                </td>
                <td class="mono">${r.workerId}</td>
                <td><span class="status-pill status-${r.status}">${r.status}</span></td>
                <td class="mono">${r.steps.length} steps</td>
                <td class="mono" style="color: var(--muted);">${new Date(r.startedAt).toLocaleTimeString()}</td>
                <td style="display: flex; gap: 8px;">
                  <a href="/runs/${r.runId}" class="btn ${r.status === "VERIFICATION_FAILED" ? "btn-danger" : "btn-primary"}">
                    ${r.status === "VERIFICATION_FAILED" ? "⚠️ Inspect Divergence" : "View Graph"}
                  </a>
                  <a href="/api/runs/${r.runId}/export" target="_blank" class="btn">Audit Bundle</a>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Runs & Execution Graph", html, "/runs"))
  }

  // 3. RUN DETAIL VIEW WITH EXECUTION GRAPH & VERIFICATION FAILURE SCREEN (/runs/:id)
  if (pathname.startsWith("/runs/")) {
    const runId = pathname.split("/")[2]
    const run = meshly.runs.get(runId)
    const notice = url.searchParams.get("notice")

    if (!run) {
      res.writeHead(404, { "Content-Type": "text/html" })
      return res.end(renderHtml("Not Found", `<div class="panel" style="padding: 24px;"><h3>Run '${runId}' not found.</h3><a href="/runs" class="btn" style="margin-top: 12px;">Back to Runs</a></div>`, "/runs"))
    }

    const hasDivergence = run.status === "VERIFICATION_FAILED" || run.steps.some(s => s.worldStateMatched === false)
    const failedStep = run.steps.find(s => s.worldStateMatched === false || s.status === "rejected")

    const html = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <a href="/runs" class="btn" style="padding: 3px 8px;">&larr; Runs</a>
            <h2 class="mono" style="font-size: 20px; font-weight: 700;">${run.runId}</h2>
            <span class="status-pill status-${run.status}">${run.status}</span>
          </div>
          <p style="font-size: 15px; color: var(--text);">${run.objective}</p>
          <div style="font-size: 12px; color: var(--muted); margin-top: 4px; display: flex; gap: 16px;">
            <span>Worker: <strong class="mono" style="color: var(--text);">${run.workerId}</strong></span>
            <span>Started: <strong class="mono" style="color: var(--text);">${new Date(run.startedAt).toLocaleTimeString()}</strong></span>
            <span>Allocated Envs: <strong class="mono" style="color: var(--text);">${run.environments.join(", ") || "none"}</strong></span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="/api/runs/${run.runId}/export" target="_blank" class="btn btn-primary">
            Export SHA-256 Audit Bundle
          </a>
        </div>
      </div>

      ${notice ? `
        <div style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; color: #93c5fd;">
          Notice: ${notice.replace(/_/g, " ").toUpperCase()} completed successfully.
        </div>
      ` : ""}

      <!-- SIGNATURE VERIFICATION FAILURE SCREEN -->
      ${hasDivergence && failedStep ? `
        <div class="divergence-alert-card">
          <h3>
            <span>⚠️</span>
            <span>REALITY DIVERGENCE DETECTED — UNVERIFIED COMMIT BLOCKED</span>
          </h3>
          <p style="color: #fca5a5; font-size: 13px; line-height: 1.5; margin-bottom: 12px;">
            The agent's claimed completion did not match physical external environment state.
            Meshly's verification barrier quarantined the side effect, preventing silent state corruption.
          </p>

          <div class="divergence-grid">
            <div class="divergence-label">Agent Claim:</div>
            <div class="divergence-val-success">✓ SUCCESS &mdash; Model declared: "${failedStep.evidence?.rawObservations?.agentClaim || "Action successful"}"</div>

            <div class="divergence-label">Tool Execution:</div>
            <div class="divergence-val-success">✓ SUCCESS &mdash; Subprocess / HTTP transport: "${failedStep.evidence?.rawObservations?.toolOutput || "Process exited with code 0"}"</div>

            <div class="divergence-label">World State:</div>
            <div class="divergence-val-fail">✗ MISMATCH &mdash; Verified physical reality: "${failedStep.evidence?.rawObservations?.physicalWorldState || "Expected postcondition not satisfied"}"</div>

            <div class="divergence-label">Commit Status:</div>
            <div class="divergence-val-blocked">BLOCKED &mdash; Side effect quarantined; execution paused before unverified persistence</div>

            <div class="divergence-label">Tamper Digest:</div>
            <div class="mono" style="color: #38bdf8; font-size: 12px;">SHA-256: ${failedStep.evidence?.tamperEvidentDigestSha256 || "047ce0a8d5ca0ee83f6..."}</div>
          </div>

          <!-- Operator Intervention Controls -->
          <div style="display: flex; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(239, 68, 68, 0.2);">
            <form method="POST" action="/api/run/${run.runId}/takeover" style="display:inline;">
              <button class="btn btn-warning">🎮 Take Over Session</button>
            </form>
            <form method="POST" action="/api/run/${run.runId}/retry" style="display:inline;">
              <button class="btn btn-success">🔄 Retry Verification</button>
            </form>
            <form method="POST" action="/api/run/${run.runId}/compensate" style="display:inline;">
              <button class="btn btn-danger">⏪ Compensate / SAGA Rollback</button>
            </form>
            <a href="/api/runs/${run.runId}" target="_blank" class="btn">🔍 Inspect Raw Evidence JSON</a>
          </div>

          ${takeoverLogs[run.runId] ? `
            <div style="margin-top: 14px; background: #000; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-family: var(--mono); font-size: 11.5px; color: #fbbf24;">
              <strong>Takeover Session Active:</strong>
              <ul style="padding-left: 18px; margin-top: 4px;">
                ${takeoverLogs[run.runId].map(l => `<li>${l}</li>`).join("")}
              </ul>
            </div>
          ` : ""}

          ${compensationLogs[run.runId] ? `
            <div style="margin-top: 14px; background: #000; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-family: var(--mono); font-size: 11.5px; color: #f87171;">
              <strong>SAGA Compensation Executed:</strong>
              <ul style="padding-left: 18px; margin-top: 4px;">
                ${compensationLogs[run.runId].map(l => `<li>${l}</li>`).join("")}
              </ul>
            </div>
          ` : ""}
        </div>
      ` : ""}

      <!-- EXPLICIT EXECUTION GRAPH PIPELINE -->
      <div class="panel">
        <div class="panel-header">
          <span>Execution Graph Pipeline (Intent &rarr; Action &rarr; Observation &rarr; Verification &rarr; Commit)</span>
          <span class="badge">${run.steps.length} Steps Recorded</span>
        </div>
        <div style="padding: 20px;">
          ${run.steps.map((step, idx) => `
            <div style="margin-bottom: ${idx === run.steps.length - 1 ? "0" : "28px"}; border-bottom: ${idx === run.steps.length - 1 ? "none" : "1px solid var(--border)"}; padding-bottom: ${idx === run.steps.length - 1 ? "0" : "20px"};">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong class="mono" style="font-size: 14px;">Step ${step.stepIndex}</strong>
                  <span class="status-pill status-${step.status}">${step.status}</span>
                  <span class="mono" style="font-size: 11.5px; color: var(--muted);">${step.id}</span>
                </div>
                <div class="mono" style="font-size: 11px; color: var(--muted);">
                  ${new Date(step.timestamp).toLocaleTimeString()}
                </div>
              </div>

              <!-- Pipeline Flow Nodes -->
              <div class="graph-pipeline">
                <div class="graph-node" style="border-color: #3b82f6;">
                  <span class="graph-node-title" style="color: #60a5fa;">1. Intent</span>
                  <span class="graph-node-sub">Declared</span>
                </div>
                <div class="graph-arrow">&rarr;</div>
                <div class="graph-node" style="border-color: #a855f7;">
                  <span class="graph-node-title" style="color: #c084fc;">2. Action</span>
                  <span class="graph-node-sub">${step.action.tool}</span>
                </div>
                <div class="graph-arrow">&rarr;</div>
                <div class="graph-node" style="border-color: #38bdf8;">
                  <span class="graph-node-title" style="color: #38bdf8;">3. Observe</span>
                  <span class="graph-node-sub">${step.observation ? "Captured" : "Pending"}</span>
                </div>
                <div class="graph-arrow">&rarr;</div>
                <div class="graph-node" style="border-color: ${step.worldStateMatched === false ? "#ef4444" : "#10b981"};">
                  <span class="graph-node-title" style="color: ${step.worldStateMatched === false ? "#f87171" : "#34d399"};">4. Verify</span>
                  <span class="graph-node-sub">${step.worldStateMatched === false ? "MISMATCH" : (step.worldStateMatched ? "MATCHED" : "Pending")}</span>
                </div>
                <div class="graph-arrow">&rarr;</div>
                <div class="graph-node" style="border-color: ${step.worldStateMatched === false ? "#ef4444" : "#10b981"};">
                  <span class="graph-node-title" style="color: ${step.worldStateMatched === false ? "#f87171" : "#34d399"};">5. Commit</span>
                  <span class="graph-node-sub">${step.worldStateMatched === false ? "BLOCKED" : (step.status === "committed" ? "COMMITTED" : "Pending")}</span>
                </div>
              </div>

              <!-- Step Details Grid -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px;">
                <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px;">
                  <div style="font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px;">Intent & Tool Parameters</div>
                  <div style="font-weight: 600; margin-bottom: 6px;">${step.intent}</div>
                  <pre class="mono" style="font-size: 11.5px; color: #a1a1aa; background: #000; padding: 8px; border-radius: 4px; overflow-x: auto;">Tool: ${step.action.tool}\nArgs: ${JSON.stringify(step.action.args, null, 2)}</pre>
                </div>

                <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px;">
                  <div style="font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px;">Observation & Physical Verification</div>
                  ${step.observation ? `
                    <pre class="mono" style="font-size: 11.5px; color: #34d399; background: #000; padding: 8px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(step.observation, null, 2)}</pre>
                  ` : `<div style="color: var(--muted); font-size: 12px;">No observation recorded yet.</div>`}
                  ${step.evidence ? `
                    <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">
                      Evidence Digest: <span class="mono" style="color: #38bdf8;">SHA-256 ${step.evidence.tamperEvidentDigestSha256.slice(0, 16)}...</span>
                    </div>
                  ` : ""}
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml(`Run ${run.runId}`, html, "/runs"))
  }

  // 4. WORKERS VIEW (/workers)
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
              <th>Spend Cap</th>
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
                <td class="mono">$${w.budget.spent.toFixed(2)} / $${w.budget.maxSpend.toFixed(2)}</td>
                <td>
                  <span class="badge" style="font-size: 10px;">${w.memory.filter(m => m.tier === "hot").length} Hot</span>
                  <span class="badge-subtle" style="font-size: 10px;">${w.memory.filter(m => m.tier === "warm").length} Warm</span>
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

  // 5. ENVIRONMENTS & WARM POOLS VIEW (/environments)
  if (pathname === "/environments") {
    const envs = meshly.broker.list()
    const html = `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">Solari Execution Fabric & Warm Pools</h2>
        <p style="color: var(--muted); font-size: 13px;">Heterogeneous execution environments warm-pooled and leased to autonomous workers.</p>
      </div>

      <div class="grid-metrics">
        <div class="metric-card">
          <div class="metric-label">Browser Pool</div>
          <div class="metric-value" style="color: #38bdf8;">
            ${stats.environments.byType.browser.idle} <span style="font-size: 14px; color: var(--muted);">ready</span> &bull; ${stats.environments.byType.browser.busy} <span style="font-size: 14px; color: var(--muted);">busy</span>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sandbox MicroVM Pool</div>
          <div class="metric-value" style="color: #a78bfa;">
            ${stats.environments.byType.sandbox.idle} <span style="font-size: 14px; color: var(--muted);">ready</span> &bull; ${stats.environments.byType.sandbox.busy} <span style="font-size: 14px; color: var(--muted);">busy</span>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-label">GUI Desktop Pool</div>
          <div class="metric-value" style="color: #34d399;">
            ${stats.environments.byType.desktop.idle} <span style="font-size: 14px; color: var(--muted);">ready</span> &bull; ${stats.environments.byType.desktop.busy} <span style="font-size: 14px; color: var(--muted);">busy</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>All Registered Environments (${envs.length})</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Environment ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Profile / Config</th>
              <th>Current Lease</th>
              <th>Cost Accrued</th>
              <th>Live Observability</th>
            </tr>
          </thead>
          <tbody>
            ${envs.map(e => `
              <tr>
                <td class="mono"><strong>${e.id}</strong></td>
                <td><span class="badge">${e.type}</span></td>
                <td><span class="status-pill status-${e.status}">${e.status}</span></td>
                <td class="mono">${e.profile || "default"}</td>
                <td class="mono">${e.currentLeaseId || "— (in warm pool)"}</td>
                <td class="mono">$${e.cost.toFixed(2)}</td>
                <td>
                  ${e.replayUrl ? `<a href="${e.replayUrl}" target="_blank" class="btn">View Replay</a>` : ""}
                  ${e.streamUrl ? `<a href="${e.streamUrl}" target="_blank" class="btn">Live VNC Stream</a>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Warm Pools", html, "/environments"))
  }

  // 6. SCHEDULER DECISIONS VIEW (/scheduler)
  if (pathname === "/scheduler") {
    const decisions = meshly.scheduler.getRecentDecisions()
    const html = `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">Observable Scheduler Decisions</h2>
        <p style="color: var(--muted); font-size: 13px;">Every worker placement decision is accompanied by human-readable systems rationale.</p>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>Placement Decisions Log (${decisions.length})</span>
          <a href="/api/decisions" target="_blank" class="btn">Decisions JSON</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Worker ID</th>
              <th>Target Env</th>
              <th>Environment Type & Score</th>
              <th>Placement Rationale & System Scoring</th>
            </tr>
          </thead>
          <tbody>
            ${decisions.length === 0 ? `<tr><td colspan="5" style="color:var(--muted); text-align:center;">No scheduler decisions logged yet.</td></tr>` : decisions.map(d => `
              <tr>
                <td class="mono" style="color: var(--muted);">${new Date(d.timestamp).toLocaleTimeString()}</td>
                <td class="mono"><strong>${d.workerId}</strong></td>
                <td class="mono">${d.environmentId || "—"}</td>
                <td><span class="badge">${d.targetType.toUpperCase()} (Score: ${d.score.toFixed(1)})</span></td>
                <td>
                  <ul style="padding-left: 18px; font-size: 12px; color: var(--text);">
                    ${d.reasons.map(r => `<li style="margin-bottom: 2px;">${r}</li>`).join("")}
                  </ul>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Scheduler Decisions", html, "/scheduler"))
  }

  // 7. POLICIES & AUTHORITY VIEW (/policies)
  if (pathname === "/policies") {
    const workers = meshly.workers.list()
    const html = `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">Authority Delegation & Security Invariants</h2>
        <p style="color: var(--muted); font-size: 13px;">Mathematical invariant: Child worker privileges strictly narrow parent bounds (A_child &sube; A_parent).</p>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span>Active Worker Authority Leases</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Worker ID</th>
              <th>Authorized Tools</th>
              <th>Permitted Domains</th>
              <th>Spend Ceiling</th>
              <th>Write Paths</th>
              <th>Lease Expiry</th>
            </tr>
          </thead>
          <tbody>
            ${workers.map(w => `
              <tr>
                <td class="mono"><strong>${w.id}</strong></td>
                <td><span class="mono" style="color: #38bdf8;">${w.authority.tools.join(", ") || "none"}</span></td>
                <td><span class="mono" style="color: #a78bfa;">${w.authority.domains?.join(", ") || "all"}</span></td>
                <td class="mono" style="color: #34d399;">$${w.authority.maxSpend != null ? w.authority.maxSpend.toFixed(2) : "0.00"}</td>
                <td><span class="mono" style="color: var(--muted);">${w.authority.writeAccess?.join(", ") || "none"}</span></td>
                <td class="mono" style="color: var(--muted);">${w.authority.expiresAt ? new Date(w.authority.expiresAt).toLocaleTimeString() : "Session-scoped"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="panel" style="padding: 24px;">
        <h3 style="margin-bottom: 10px;">Monotonic Authority Narrowing Proof</h3>
        <p style="color: var(--muted); line-height: 1.6; margin-bottom: 16px;">
          When an autonomous worker spawns a sub-agent or delegates a sub-task, Meshly validates the child authority envelope against the parent. If a child attempts to add unapproved tools, expand the domain allowlist, or increase spend limits, the request is intercepted and rejected with a hard security violation before execution begins.
        </p>
        <div class="digest-box" style="padding: 14px;">
// Monotonic Delegation Intersection Guarantee
A_child.tools       = A_requested.tools &cap; A_parent.tools
A_child.maxSpend    = Math.min(A_requested.maxSpend, A_parent.remainingBudget)
A_child.domains     = A_requested.domains &cap; A_parent.domains
A_child.writeAccess = A_requested.writeAccess &cap; A_parent.writeAccess
        </div>
      </div>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(renderHtml("Policies & Authority", html, "/policies"))
  }

  res.writeHead(404, { "Content-Type": "text/plain" })
  res.end("Not Found")
})

server.listen(PORT, () => {
  console.log(`[Meshly Console] Control plane web dashboard listening at http://localhost:${PORT}`)
})
