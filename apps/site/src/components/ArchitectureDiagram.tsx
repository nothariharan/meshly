import { Browser, CheckCircle, Cube, Desktop, Database, Lightning, Shield } from "@phosphor-icons/react"
import { usePinProgress } from "../hooks"

const CHIPS = [
  { label: "Policy enforced", Icon: Shield },
  { label: "Stateful execution", Icon: Database },
  { label: "Independent verification", Icon: CheckCircle },
  { label: "Built on Solari", Icon: Lightning },
]

const PIPELINE = ["Intent", "Authorize", "Browser", "Sandbox", "Desktop", "Verify", "Commit"]

const EVENTS = [
  { t: "12:03:14", tag: "worker", text: "Starting run run_mty1a8zl_ri7a" },
  { t: "12:03:15", tag: "policy", text: "Authorization approved (finance.reconcile)" },
  { t: "12:03:17", tag: "browser", text: "Launching browser environment…" },
  { t: "12:03:19", tag: "browser", text: "Navigating to payments.example.com" },
  { t: "12:03:21", tag: "browser", text: "Payment data extracted: Invoice #4421 (PAID)" },
  { t: "12:03:23", tag: "sandbox", text: "Reconciling ledger… payment = PAID, ledger = UNPAID" },
  { t: "12:03:26", tag: "desktop", text: "Posting to ERP · erp_status = POSTED" },
  { t: "12:03:28", tag: "verify", text: "Independent read · world state matched · committed" },
]

const VERIFY_ITEMS = ["Agent claim", "Tool execution", "World state", "Independent check"]

type CardState = "waiting" | "active" | "done"
const pillFor = (state: CardState, pendingLabel = "waiting") =>
  state === "active" ? "active" : state === "done" ? "done" : pendingLabel

/**
 * Scroll-driven architecture diagram. One worker, every environment it needs.
 * The active stage advances Browser → Sandbox → Desktop → Verify → Commit as
 * the user scrolls, then settles. Values mirror the canonical run.
 */
export function ArchitectureDiagram() {
  const { wrapRef, stickRef, progress } = usePinProgress<HTMLDivElement, HTMLDivElement>()
  const stage = Math.min(4, Math.floor(progress * 5))
  const pipelineActive = stage >= 4 ? PIPELINE.length : 2 + stage

  const cardState = (index: number): CardState => (stage === index ? "active" : stage > index ? "done" : "waiting")
  const browser = cardState(0)
  const sandbox = cardState(1)
  const desktop = cardState(2)
  const verify = cardState(3)
  const finished = stage >= 4
  const revealEvents = Math.min(EVENTS.length, stage + 3)

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

      <div className="arch2-scroll" ref={wrapRef}>
        <div className="arch2-sticky" ref={stickRef}>
          <div className="arch2-pipeline window">
        {PIPELINE.map((name, i) => {
          const state = i < pipelineActive ? "done" : i === pipelineActive ? "active" : "todo"
          return (
            <div className={`arch2-stage ${state}`} key={name}>
              <span className="arch2-stage-dot">
                {state === "done" ? "✓" : state === "active" ? <span className="arch2-ring" /> : ""}
              </span>
              <span className="arch2-stage-label">{name}</span>
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
            <span className={`pill ${finished ? "verified" : "running"}`}>
              <span className={`dot ${finished ? "verified" : "run"} pulse`} /> {finished ? "verified" : "running"}
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
          <div className={`arch2-card panel ${browser}`}>
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Browser size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Browser</span>
                <span className="arch2-card-sub">Read payment information</span>
              </div>
              <span className={`pill ${browser === "active" ? "verified" : "muted"}`}>{pillFor(browser)}</span>
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
          <div className={`arch2-card panel ${sandbox}`}>
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Cube size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Sandbox</span>
                <span className="arch2-card-sub">Reconcile and validate</span>
              </div>
              <span className={`pill ${sandbox === "active" ? "verified" : "muted"}`}>{pillFor(sandbox)}</span>
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
          <div className={`arch2-card panel ${desktop}`}>
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <Desktop size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Desktop</span>
                <span className="arch2-card-sub">Update ERP system</span>
              </div>
              <span className={`pill ${desktop === "active" ? "verified" : "muted"}`}>{pillFor(desktop)}</span>
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
                <button className={`arch2-erp-btn ${desktop === "active" ? "hot" : ""}`} type="button">
                  {desktop === "done" || finished ? "Posted to ERP" : "Post to ERP"}
                </button>
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className={`arch2-card panel ${verify}`}>
            <div className="arch2-card-head">
              <span className="arch2-card-icon">
                <CheckCircle size={18} weight="regular" />
              </span>
              <div className="arch2-card-title">
                <span className="arch2-card-name">Verification</span>
                <span className="arch2-card-sub">Check real world state</span>
              </div>
              <span className={`pill ${verify === "done" ? "verified" : verify === "active" ? "unknown" : "muted"}`}>
                {verify === "done" ? "verified" : verify === "active" ? "checking" : "pending"}
              </span>
            </div>
            <ul className="arch2-verify-list">
              {VERIFY_ITEMS.map((item, i) => {
                const on = verify === "done" || (verify === "active" && i <= Math.min(3, stage - 3))
                return (
                  <li key={item} className={on ? "on" : ""}>
                    <span className="arch2-verify-box">{on ? "✓" : ""}</span>
                    {item}
                  </li>
                )
              })}
            </ul>
            <div className="arch2-verify-foot">
              {verify === "done" ? "World state matched" : verify === "active" ? "Verifying…" : "Awaiting execution"}
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>

      <div className="arch2-events window">
        <div className="arch2-events-head">
          <span className="arch2-events-title">
            <span className="dot verified" /> Live events
          </span>
          <span className="arch2-streaming mono">{finished ? "Committed" : "Streaming…"}</span>
        </div>
        <div className="arch2-events-body mono">
          {EVENTS.map((event, i) => (
            <div className={`arch2-event ${i < revealEvents ? "on" : ""}`} key={event.t + event.tag}>
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
