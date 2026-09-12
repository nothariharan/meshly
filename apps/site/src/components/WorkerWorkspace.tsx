import { Browser, Cube, Desktop } from "@phosphor-icons/react"
import { ExecutionGraph } from "./ExecutionGraph"

const PROJECTS = [
  { name: "Finance Ops", workers: ["invoice-reconciler", "payment-auditor"], runs: 12 },
  { name: "Engineering", workers: ["coding-worker"], runs: 8 },
  { name: "Research", workers: ["research-worker"], runs: 5 },
  { name: "Operations", workers: ["ops-automator"], runs: 3 },
]

/**
 * A faithful miniature of the real operator console. Data mirrors the
 * persisted workspace: projects, workers, runs, execution stages.
 */
export function WorkerWorkspace() {
  return (
    <div className="window workspace">
      <div className="window-bar">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <span className="window-title">meshly — operator console</span>
      </div>
      <div className="workspace-body">
        <aside className="workspace-side">
          <div className="workspace-side-label">Projects</div>
          {PROJECTS.map((project) => (
            <div className="workspace-project" key={project.name}>
              <div className="workspace-project-name">
                <span className="workspace-caret">▾</span>
                {project.name}
                <span className="workspace-count">{project.runs}</span>
              </div>
              {project.workers.map((w) => (
                <div className={`workspace-worker ${w === "invoice-reconciler" ? "active" : ""}`} key={w}>
                  <span className="dot verified" />
                  {w}
                </div>
              ))}
            </div>
          ))}
        </aside>
        <div className="workspace-main">
          <div className="workspace-head">
            <div>
              <div className="workspace-title">invoice-reconciler</div>
              <div className="faint mono" style={{ fontSize: 12, marginTop: 4 }}>
                run_mty1a8zl_ri7a
              </div>
            </div>
            <span className="pill running">
              <span className="dot run" /> running
            </span>
          </div>

          <ExecutionGraph compact />

          <div className="workspace-envs">
            <div className="workspace-env">
              <Browser size={16} weight="regular" />
              <span>Browser</span>
              <span className="workspace-env-state verified">✓</span>
            </div>
            <div className="workspace-env">
              <Cube size={16} weight="regular" />
              <span>Sandbox</span>
              <span className="workspace-env-state verified">✓</span>
            </div>
            <div className="workspace-env">
              <Desktop size={16} weight="regular" />
              <span>Desktop</span>
              <span className="workspace-env-state verified">✓</span>
            </div>
          </div>

          <div className="workspace-log mono">
            <div><span className="faint">[12:28:25]</span> Agent: OpenAI · intent created</div>
            <div><span className="faint">[12:28:31]</span> Action: browser_extract · authorized</div>
            <div><span className="faint">[12:28:37]</span> Observation: payment_status = PAID</div>
            <div><span className="faint">[12:28:41]</span> Verification: world state matched · committed</div>
          </div>
        </div>
      </div>
    </div>
  )
}
