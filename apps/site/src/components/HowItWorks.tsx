import { ArrowsClockwise, Browser, CheckCircle, Cloud, Cube, Desktop, Fingerprint, Key, Shield, Stack, User } from "@phosphor-icons/react"

const AGENTS = [
  { name: "Claude", src: "/agents/claude.svg" },
  { name: "GPT", src: "/agents/openai.svg" },
  { name: "MCP", src: "/agents/mcp.svg" },
  { name: "Script", icon: true },
]

const CAPABILITIES = [
  { label: "Worker", Icon: Stack },
  { label: "Authority", Icon: Key },
  { label: "Run", Icon: Fingerprint },
  { label: "Verification", Icon: CheckCircle },
  { label: "Policy", Icon: Shield },
  { label: "Recovery", Icon: ArrowsClockwise },
]

const ENVS = [
  { name: "Browser", task: "Read payment data from web", Icon: Browser, kind: "browser" },
  { name: "Sandbox", task: "Reconcile data and run analysis", Icon: Cube, kind: "sandbox" },
  { name: "Desktop", task: "Update ERP and complete task", Icon: Desktop, kind: "desktop" },
]

/**
 * From intention to verified execution. Three columns: the reasoning agent,
 * the Meshly governance layer, and the real Solari environments.
 */
export function HowItWorks() {
  return (
    <div className="hiw">
      <header className="hiw-head">
        <div className="eyebrow">How it works</div>
        <h2>From intention to verified execution.</h2>
        <p className="lead">
          Meshly sits between your agent and real-world environments, managing permissions, resources, state, and
          verification.
        </p>
      </header>

      <div className="hiw-grid">
        {/* Agent */}
        <div className="hiw-card panel">
          <div className="hiw-card-top">
            <span className="hiw-card-icon">
              <User size={18} weight="regular" />
            </span>
            <div>
              <div className="hiw-card-title">Agent</div>
              <div className="hiw-card-sub">Claude / GPT / MCP</div>
            </div>
          </div>
          <div className="hiw-agents">
            {AGENTS.map((agent) => (
              <div className="hiw-agent" key={agent.name}>
                {agent.icon ? (
                  <span className="hiw-agent-code mono">&lt;/&gt;</span>
                ) : (
                  <img className="hiw-agent-icon" src={agent.src} alt="" />
                )}
                <span className="hiw-agent-label">{agent.name}</span>
              </div>
            ))}
          </div>
          <div className="hiw-quote">"Reconcile today's invoices and update the ERP."</div>
        </div>

        <div className="hiw-link">
          <span className="hiw-link-label">Intent</span>
          <span className="hiw-link-line" />
          <span className="hiw-link-dot" />
        </div>

        {/* Meshly */}
        <div className="hiw-card panel accent">
          <div className="hiw-card-top">
            <span className="hiw-glyph">
              <img src="/logo.png" alt="" />
            </span>
            <div>
              <div className="hiw-card-title">Meshly</div>
              <div className="hiw-card-sub">Policy · Runtime · Verification</div>
            </div>
            <span className="pill running">
              <span className="dot run pulse" /> running
            </span>
          </div>
          <div className="hiw-caps">
            {CAPABILITIES.map((cap) => (
              <div className="hiw-cap" key={cap.label}>
                <cap.Icon size={15} weight="regular" />
                <span>{cap.label}</span>
              </div>
            ))}
          </div>
          <div className="hiw-manage">
            <Stack size={16} weight="regular" />
            <div>
              <div className="hiw-manage-t">Manages state across environments</div>
              <div className="hiw-manage-s">Permissions · Resources · Memory · Retries</div>
            </div>
          </div>
        </div>

        <div className="hiw-link">
          <span className="hiw-link-label">Execute</span>
          <span className="hiw-link-line" />
          <span className="hiw-link-dot" />
        </div>

        {/* Solari */}
        <div className="hiw-card panel">
          <div className="hiw-card-top">
            <span className="hiw-card-icon">
              <Cloud size={18} weight="regular" />
            </span>
            <div>
              <div className="hiw-card-title">Solari</div>
              <div className="hiw-card-sub">Browser · Sandbox · Desktop</div>
            </div>
          </div>
          <div className="hiw-envs">
            {ENVS.map((env) => (
              <div className="hiw-env" key={env.name}>
                <div className="hiw-env-top">
                  <env.Icon size={16} weight="regular" />
                  <span className="hiw-env-name">{env.name}</span>
                </div>
                <div className="hiw-env-task">{env.task}</div>
                <div className={`hiw-skel ${env.kind}`} aria-hidden>
                  {env.kind === "browser" && (
                    <>
                      <span />
                      <span />
                      <span />
                    </>
                  )}
                  {env.kind === "sandbox" && <span className="hiw-skel-line" />}
                  {env.kind === "desktop" && <span className="hiw-skel-btn" />}
                </div>
              </div>
            ))}
          </div>
          <div className="hiw-envs-label">Real execution environments</div>
        </div>
      </div>
    </div>
  )
}
