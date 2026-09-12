import { Browser, CaretDown, Cube, Desktop, Gear, Globe, Pulse, Shield, Stack } from "@phosphor-icons/react"
import { useInView, useSequence } from "../hooks"

const STAGES = ["Intent", "Authorize", "Browser", "Sandbox", "Desktop", "Verify", "Commit"]

const NAV = [
  { label: "Workers", Icon: Stack, badge: 3, active: true },
  { label: "Runs", Icon: Pulse },
  { label: "Environments", Icon: Globe },
  { label: "Policies", Icon: Shield },
  { label: "Settings", Icon: Gear },
]

const LOG = [
  { t: "12:03:14", tag: "worker", text: "Starting run run_mty1a8zl_ri7a" },
  { t: "12:03:16", tag: "policy", text: "Authorization approved (finance.reconcile)" },
  { t: "12:03:18", tag: "browser", text: "Navigating to payments.example.com" },
  { t: "12:03:21", tag: "browser", text: "Payment data extracted: Invoice #4421 (PAID)" },
  { t: "12:03:24", tag: "sandbox", text: "Running reconciliation script…" },
  { t: "12:03:26", tag: "sandbox", text: "Ledger updated (diff: 3 records)" },
  { t: "12:03:28", tag: "desktop", text: "Updating ERP system…" },
  { t: "12:03:31", tag: "verify", text: "Checking world state…" },
]

const VERIFY = ["Agent claim collected", "Tool execution completed", "World state queried", "Comparing results…", "Ready to commit"]

/**
 * Elaborated hero console. A faithful miniature of the real workspace:
 * sidebar, run header, pipeline, environments, run log, and verification.
 * The pipeline and log advance on their own.
 */
export function HeroConsole() {
  const { ref, inView } = useInView<HTMLDivElement>("-10% 0px -10% 0px")
  const step = useSequence(STAGES.length, inView, 1050)

  const stage = (i: number) => (i < step ? "done" : i === step ? "active" : "todo")
  const envState = (i: number) => (step > i + 1 ? "done" : step === i + 1 ? "active" : "waiting")

  return (
    <div className="window hero-console" ref={ref}>
      <div className="window-bar">
        <div className="dots">
          <span className="r" />
          <span className="y" />
          <span className="g" />
        </div>
      </div>
      <div className="hc-body">
        <aside className="hc-side">
          <div className="hc-brand">
            <span className="hc-glyph">
              <img src="/logo.png" alt="" />
            </span>
            <span className="hc-word">Meshly</span>
          </div>
          <nav className="hc-nav">
            {NAV.map((item) => (
              <div className={`hc-nav-item ${item.active ? "active" : ""}`} key={item.label}>
                <item.Icon size={14} weight="regular" />
                <span>{item.label}</span>
                {item.badge ? <span className="hc-badge">{item.badge}</span> : null}
              </div>
            ))}
          </nav>
          <div className="hc-runtime">
            <span className="dot verified" />
            <div>
              <div className="hc-runtime-t">Runtime online</div>
              <div className="hc-runtime-s">Solari connected</div>
            </div>
            <CaretDown size={12} className="hc-runtime-c" />
          </div>
        </aside>

        <div className="hc-main">
          <div className="hc-crumbs mono">Workers › invoice-reconciler › Run</div>
          <div className="hc-head">
            <div>
              <div className="hc-run">
                run_mty1a8zl_ri7a
                <span className="pill running">
                  <span className="dot run pulse" /> running
                </span>
              </div>
              <div className="hc-task">Reconcile invoice 4421</div>
            </div>
            <div className="hc-meta">
              <div className="hc-started">Started 2m ago</div>
              <div className="hc-model">✦ Claude 3.5 Sonnet</div>
            </div>
          </div>

          <div className="hc-pipeline">
            {STAGES.map((name, i) => {
              const state = stage(i)
              return (
                <div className={`hc-stage ${state}`} key={name}>
                  {i > 0 && <span className={`hc-stage-line ${i <= step ? "on" : ""}`} aria-hidden />}
                  <span className="hc-stage-dot">
                    {state === "done" ? "✓" : state === "active" ? <span className="hc-ring" /> : ""}
                  </span>
                  <span className="hc-stage-label">{name}</span>
                </div>
              )
            })}
          </div>

          <div className="hc-section-label">Environments</div>
          <div className="hc-envs">
            {[
              { name: "Browser", task: "Read payment data", Icon: Browser },
              { name: "Sandbox", task: "Reconcile records", Icon: Cube },
              { name: "Desktop", task: "Update ERP", Icon: Desktop },
            ].map((env, i) => {
              const state = envState(i)
              return (
                <div className={`hc-env ${state}`} key={env.name}>
                  <div className="hc-env-top">
                    <env.Icon size={18} weight="regular" />
                    <span className={`pill ${state === "active" ? "verified" : "muted"}`}>{state}</span>
                  </div>
                  <div className="hc-env-name">{env.name}</div>
                  <div className="hc-env-task">{env.task}</div>
                </div>
              )
            })}
          </div>

          <div className="hc-bottom">
            <div className="hc-log panel">
              <div className="hc-log-head">
                <span className="hc-log-title">
                  <span className="dot verified" /> Run log
                </span>
                <span className="hc-live mono">Live ▾</span>
              </div>
              <div className="hc-log-body mono">
                {LOG.map((line, i) => (
                  <div className={`hc-log-line ${i < step + 2 ? "on" : ""}`} key={line.t + line.tag}>
                    <span className="hc-log-t">{line.t}</span>
                    <span className="hc-log-tag">{line.tag}</span>
                    <span className="hc-log-text">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hc-verify panel">
              <div className="hc-verify-title">World state verification</div>
              <div className="hc-verify-ring-wrap">
                <svg className="hc-verify-ring" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="27" className="hc-ring-bg" />
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    className="hc-ring-fg"
                    style={{ strokeDashoffset: 170 - (170 * step) / (STAGES.length - 1) }}
                  />
                </svg>
                <span className="hc-verify-now">{step >= STAGES.length - 1 ? "Verified" : "Verifying…"}</span>
              </div>
              <ul className="hc-verify-list">
                {VERIFY.map((item, i) => (
                  <li className={i < step - 3 ? "on" : ""} key={item}>
                    <span className="hc-verify-box">{i < step - 3 ? "✓" : ""}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
