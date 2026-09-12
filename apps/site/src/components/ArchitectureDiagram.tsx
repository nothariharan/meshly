import { Browser, CheckCircle, Cube, Desktop, Database, Lightning, Shield } from "@phosphor-icons/react"

const CHIPS = [
  { label: "Policy enforced", Icon: Shield },
  { label: "Stateful execution", Icon: Database },
  { label: "Independent verification", Icon: CheckCircle },
  { label: "Built on Solari", Icon: Lightning },
]

const PIPELINE = ["Intent", "Authorize", "Browser", "Sandbox", "Desktop", "Verify", "Commit"]
const PIPELINE_ACTIVE = 2

const EVENTS = [
  { t: "12:03:14", tag: "worker", text: "Starting run run_mty1a8zl_ri7a" },
  { t: "12:03:15", tag: "policy", text: "Authorization approved (finance.reconcile)" },
  { t: "12:03:17", tag: "browser", text: "Launching browser environment…" },
  { t: "12:03:19", tag: "browser", text: "Navigating to payments.example.com" },
  { t: "12:03:21", tag: "browser", text: "Payment data extracted: Invoice #4421 (PAID)" },
]

/**
 * The architecture diagram. One worker, every environment it needs.
 * Values mirror the canonical run (invoice 4421, finance.reconcile,
 * run_mty1a8zl_ri7a) so the diagram stays honest to the product.
 */
export function ArchitectureDiagram() {
  return (
    <div className="arch2">
      <header className="arch2-head">
        <div className="eyebrow">Architecture</div>
        <h2>One worker. Every environment it needs.</h2>
        <p className="lead">
          Meshly moves autonomous work between browsers, sandboxes, and desktops while controlling permissions, state,
          and verification.
        </p>
        <div className="arch2-chips">
          {CHIPS.map((chip) => (
            <span className="arch2-chip" key={chip.label}>
              <chip.Icon size={15} weight="regular" />
              {chip.label}
            </span>
          ))}
        </div>
      </header>

      <div className="arch2-pipeline window">
        {PIPELINE.map((stage, i) => {
          const state = i < PIPELINE_ACTIVE ? "done" : i === PIPELINE_ACTIVE ? "active" : "todo"
          return (
            <div className={`arch2-stage ${state}`} key={stage}>
              <span className="arch2-stage-dot">
                {state === "done" ? "✓" : state === "active" ? <span className="arch2-ring" /> : ""}
              </span>
              <span className="arch2-stage-label">{stage}</span>
              {i < PIPELINE.length - 1 && <span className="arch2-stage-line" aria-hidden />}
            </div>
          )
        })}
      </div>

      <div className="arch2-diagram">
        <div className="arch2-worker panel">
          <div className="arch2-worker-top">
            <span className="arch2-worker-glyph">
              <img src="/logo.png" alt="" />
            </span>
            <div className="arch2-worker-title">
              <span className="arch2-worker-name mono">invoice-reconciler</span>
              <span className="arch2-worker-task">Reconcile incoming invoices with ERP</span>
            </div>
            <span className="pill running">
              <span className="dot run pulse" /> running
            </span>
          </div>
          <div className="arch2-worker-meta">
            <span className="arch2-meta">
              <Database size={14} /> Budget <b>$2.00</b>
            </span>
            <span className="arch2-meta">
              <Shield size={14} /> Policy <b>finance.reconcile</b>
            </span>
            <span className="arch2-meta">
              <Cube size={14} /> Tools <b>Browser · Sandbox · Desktop</b>
            </span>
          </div>
        </div>

        <svg className="arch2-connectors" viewBox="0 0 1200 90" preserveAspectRatio="none" aria-hidden>
          <path d="M600 6 C600 40 120 46 120 90" />
          <path d="M600 6 C600 40 440 46 440 90" />
          <path d="M600 6 C600 40 760 46 760 90" />
          <path d="M600 6 C600 40 1080 46 1080 90" />
        </svg>

        <div className="arch2-cards">
          {/* Browser */}
          <div className="arch2-card panel active">
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Browser size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Browser</span>
                <span className="arch2-card-sub">Read payment information</span>
              </div>
              <span className="pill verified">active</span>
            </div>
            <div className="arch2-browser">
              <div className="arch2-browser-bar">
                <span className="arch2-dot" />
                <span className="arch2-dot" />
                <span className="arch2-dot" />
                <span className="arch2-url mono">https://payments.example.com</span>
              </div>
              <div className="arch2-invoice">
                <div className="arch2-invoice-top">
                  <span className="arch2-invoice-id">Invoice #4421</span>
                  <span className="pill verified">paid</span>
                </div>
                <dl className="arch2-invoice-rows">
                  <div>
                    <dt>Vendor</dt>
                    <dd>Acme Corp</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>$1,200.00</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>Jan 14, 2024</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd className="ok">Paid</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Sandbox */}
          <div className="arch2-card panel">
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Cube size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Sandbox</span>
                <span className="arch2-card-sub">Reconcile and validate</span>
              </div>
              <span className="pill muted">waiting</span>
            </div>
            <div className="arch2-code mono">
              <div className="arch2-code-path">/workspace/reconcile.py</div>
              {[
                "# Reconcile invoice with ERP",
                "import pandas as pd",
                "",
                'invoices = pd.read_csv("ledger.csv")',
                "result = reconcile(invoices)",
                'print(f"Matched: {result.matched}")',
                'print(f"Unpaid:  {result.unpaid}")',
              ].map((line, i) => (
                <div className="arch2-code-line" key={i}>
                  <span className="arch2-ln">{i + 1}</span>
                  <span className="arch2-code-text">{line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop */}
          <div className="arch2-card panel">
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Desktop size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Desktop</span>
                <span className="arch2-card-sub">Update ERP system</span>
              </div>
              <span className="pill muted">waiting</span>
            </div>
            <div className="arch2-erp">
              <div className="arch2-erp-menu">
                <div className="arch2-erp-item on">ERP</div>
                <div className="arch2-erp-item">Invoices</div>
                <div className="arch2-erp-item">Vendors</div>
                <div className="arch2-erp-item">Payments</div>
                <div className="arch2-erp-item">Reports</div>
              </div>
              <div className="arch2-erp-form">
                <div className="arch2-erp-title">Post Payment</div>
                <div className="arch2-erp-row">
                  <span>Invoice #</span>
                  <b>4421</b>
                </div>
                <div className="arch2-erp-row">
                  <span>Amount</span>
                  <b>$1,200.00</b>
                </div>
                <div className="arch2-erp-row">
                  <span>Status</span>
                  <b className="ok">Ready to post</b>
                </div>
                <button className="arch2-erp-btn" type="button">
                  Post to ERP
                </button>
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="arch2-card panel">
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <CheckCircle size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Verification</span>
                <span className="arch2-card-sub">Check real world state</span>
              </div>
              <span className="pill muted">pending</span>
            </div>
            <ul className="arch2-verify-list">
              {["Agent claim", "Tool execution", "World state", "Independent check"].map((item) => (
                <li key={item}>
                  <span className="arch2-verify-box" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="arch2-verify-foot">Awaiting execution</div>
          </div>
        </div>
      </div>

      <div className="arch2-events window">
        <div className="arch2-events-head">
          <span className="arch2-events-title">
            <span className="dot verified" /> Live events
          </span>
          <span className="arch2-streaming mono">Streaming…</span>
        </div>
        <div className="arch2-events-body mono">
          {EVENTS.map((event) => (
            <div className="arch2-event" key={event.t + event.tag}>
              <span className="arch2-event-t">{event.t}</span>
              <span className="arch2-event-tag">[{event.tag}]</span>
              <span className="arch2-event-text">{event.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="arch2-powered">
        <div className="arch2-powered-left">
          <span className="arch2-powered-label">Powered by Solari</span>
          <div className="arch2-solari">
            <img src="/solari.avif" alt="Solari" className="arch2-solari-mark" />
            <span className="arch2-solari-word">SOLARI</span>
          </div>
        </div>
        <div className="arch2-powered-right">
          Browser. Sandbox. Desktop.
          <br />
          Real execution environments.
        </div>
      </div>
    </div>
  )
}
