import { ArrowRight, Check, Copy, GithubLogo } from "@phosphor-icons/react"
import { useState } from "react"
import { ExecutionGraph } from "./components/ExecutionGraph"
import { EnvironmentFlow } from "./components/EnvironmentFlow"
import { RealityDivergence } from "./components/RealityDivergence"
import { UnknownRecovery } from "./components/UnknownRecovery"
import { WorkerWorkspace } from "./components/WorkerWorkspace"
import { InstallTerminal } from "./components/InstallTerminal"

const GH = "https://github.com/nothariharan/meshly"

export function App() {
  return (
    <>
      <Nav />
      <Hero />

      <section id="how">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>From intention to verified execution.</h2>
            <p className="lead">
              Meshly sits between your agent and real-world environments, managing permissions, resources, state, and
              verification.
            </p>
          </div>
          <div className="pipeline-row">
            <PipelineNode label="Agent" sub="Claude / GPT / MCP" />
            <PipelineArrow />
            <PipelineNode label="Meshly" sub="Policy · Runtime · Verification" accent />
            <PipelineArrow />
            <PipelineNode label="Solari" sub="Browser · Sandbox · Desktop" />
          </div>
        </div>
      </section>

      <section id="verify">
        <div className="wrap section-pad">
          <div className="split">
            <div className="split-copy">
              <div className="eyebrow">Reality checks</div>
              <h2>The agent can be wrong.</h2>
              <p className="lead">
                Agents may claim success. Meshly checks the real world before allowing any side effect to commit.
              </p>
            </div>
            <RealityDivergence />
          </div>
        </div>
      </section>

      <section id="unknown">
        <div className="wrap section-pad">
          <div className="split reverse">
            <div className="split-copy">
              <div className="eyebrow">Unknown is a real state</div>
              <h2>Not every failure is a failure.</h2>
              <p className="lead">
                When the result of a side effect is uncertain, Meshly verifies the world instead of guessing.
              </p>
            </div>
            <div className="unknown-panel panel">
              <div className="unknown-panel-head">
                <span className="pill unknown">
                  <span className="dot unknown" /> unknown
                </span>
                <span className="faint mono" style={{ fontSize: 12 }}>
                  run_mty1mh0i_3gb7
                </span>
              </div>
              <UnknownRecovery />
            </div>
          </div>
        </div>
      </section>

      <section id="environments">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">One worker. Three environments.</div>
            <h2>A single worker, real execution environments.</h2>
            <p className="lead">
              A worker can use a browser to gather data, a sandbox to run code, and a desktop to complete a task — with
              Meshly carrying state between them.
            </p>
          </div>
          <EnvironmentFlow />
        </div>
      </section>

      <section id="product">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">The product</div>
            <h2>Everything you need to run, inspect, and control autonomous workers.</h2>
            <p className="lead">Projects, workers, runs, environments, policies, and evidence — in one place.</p>
          </div>
          <WorkerWorkspace />
        </div>
      </section>

      <section id="workers">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">Workers, not chats</div>
            <h2>Autonomous work needs a lifecycle, not just a conversation.</h2>
          </div>
          <div className="grid-2 lifecycle">
            <div className="card">
              <div className="lifecycle-tag">Chat</div>
              <ol className="lifecycle-list muted">
                <li>Prompt</li>
                <li>Response</li>
                <li>Done</li>
              </ol>
            </div>
            <div className="card lifecycle-worker">
              <div className="lifecycle-tag accent">Worker</div>
              <ol className="lifecycle-list">
                <li>Task</li>
                <li>Run</li>
                <li>Environment</li>
                <li>Observe</li>
                <li>Verify</li>
                <li>Commit</li>
                <li>Continue</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="architecture">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">Architecture</div>
            <h2>Meshly controls how autonomous work executes.</h2>
            <p className="lead">Solari provides where it executes.</p>
          </div>
          <div className="arch">
            <ArchLayer
              title="Agent"
              items={["Claude", "GPT", "MCP", "Script"]}
            />
            <ArchArrow />
            <ArchLayer
              title="Meshly"
              items={["Worker", "Run", "Policy", "Authority", "Verification", "Recovery"]}
              accent
            />
            <ArchArrow />
            <ArchLayer title="Solari" items={["Browser", "Sandbox", "Desktop"]} />
          </div>
        </div>
      </section>

      <section id="install">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">Get started</div>
            <h2>Install Meshly in seconds.</h2>
            <p className="lead">
              Get up and running with a few commands. Requires Node 22+ and a Solari account.
            </p>
          </div>
          <InstallTerminal />
        </div>
      </section>

      <Footer />
    </>
  )
}

function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-brand" href="#top">
          <span className="glyph">
            <img src="/logo.png" alt="" />
          </span>
          <img className="word" src="/text_logo.png" alt="Meshly" />
        </a>
        <nav className="nav-links">
          <a href="#how">How it works</a>
          <a href="#verify">Verification</a>
          <a href="#unknown">Unknown</a>
          <a href="#product">Console</a>
          <a href={GH} target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
        <div className="nav-right">
          <a className="gh" href={GH} target="_blank" rel="noreferrer">
            <GithubLogo size={14} weight="fill" />
            <span className="star">★</span> GitHub
          </a>
          <a className="btn primary sm" href="#install">
            Get started <ArrowRight size={14} weight="bold" />
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText("npm install -g meshly")
    } catch {
      /* ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <section id="top" className="hero" style={{ borderTop: 0 }}>
      <div className="wrap hero-grid">
        <div>
          <div className="eyebrow">Autonomous work. Governed.</div>
          <h1>The operating system for autonomous workers.</h1>
          <p className="lead">
            Agents reason. Meshly governs execution. Solari provides the environments.
          </p>
          <div className="install-line">
            <span className="prompt">$</span>
            <span>npm install -g meshly</span>
            <button className="copy-btn" onClick={copy} aria-label="Copy install command">
              {copied ? <Check size={15} weight="bold" /> : <Copy size={15} weight="regular" />}
            </button>
          </div>
          <div className="hero-actions">
            <a className="btn primary" href="#how">
              Get started <ArrowRight size={15} weight="bold" />
            </a>
            <a className="btn ghost" href={GH} target="_blank" rel="noreferrer">
              View on GitHub
            </a>
          </div>
        </div>
        <HeroWindow />
      </div>
    </section>
  )
}

function HeroWindow() {
  return (
    <div className="window hero-window">
      <div className="window-bar">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <span className="window-title">Workers › invoice-reconciler › Run</span>
      </div>
      <div className="window-body">
        <div className="hero-window-head">
          <div>
            <div className="mono" style={{ fontSize: 15 }}>
              run_mty1a8zl_ri7a
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              Reconcile invoice 4421
            </div>
          </div>
          <span className="pill running">
            <span className="dot run pulse" /> running
          </span>
        </div>
        <ExecutionGraph compact />
        <div className="hero-window-caption muted">Using browser environment…</div>
        <div className="workspace-envs">
          <div className="workspace-env on">
            <span className="workspace-env-name">Browser</span>
            <span className="workspace-env-state run">Active</span>
          </div>
          <div className="workspace-env">
            <span className="workspace-env-name">Sandbox</span>
            <span className="workspace-env-state faint">Waiting</span>
          </div>
          <div className="workspace-env">
            <span className="workspace-env-name">Desktop</span>
            <span className="workspace-env-state faint">Waiting</span>
          </div>
        </div>
        <div className="workspace-log mono">
          <div>
            <span className="faint">[12:28:21]</span> Agent: OpenAI
          </div>
          <div>
            <span className="faint">[12:28:22]</span> Action: Navigate to ERP
          </div>
          <div>
            <span className="faint">[12:28:24]</span> Observation: Page loaded
          </div>
          <div>
            <span className="faint">[12:28:24]</span> Next: Run reconciliation script…
          </div>
        </div>
      </div>
    </div>
  )
}

function PipelineNode({ label, sub, accent }: { label: string; sub: string; accent?: boolean }) {
  return (
    <div className={`pipeline-node panel ${accent ? "accent" : ""}`}>
      <div className="pipeline-node-label">{label}</div>
      <div className="pipeline-node-sub muted">{sub}</div>
    </div>
  )
}

function PipelineArrow() {
  return (
    <div className="pipeline-arrow" aria-hidden>
      →
    </div>
  )
}

function ArchLayer({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`arch-layer panel ${accent ? "accent" : ""}`}>
      <div className="arch-title">{title}</div>
      <div className="arch-items">
        {items.map((item) => (
          <span className="arch-item mono" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function ArchArrow() {
  return (
    <div className="arch-arrow" aria-hidden>
      ↓
    </div>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <span className="glyph">
            <img src="/logo.png" alt="" />
          </span>
          <div>
            <img className="word" src="/text_logo.png" alt="Meshly" />
            <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
              Agents can reason. Meshly makes sure the work actually happens.
            </div>
          </div>
        </div>
        <div className="footer-links">
          <a href={GH} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#install">Get started</a>
        </div>
      </div>
      <div className="wrap footer-bottom faint">
        <span>Built on Solari.</span>
        <span>Agents reason. Solari executes. Meshly governs the gap between the two.</span>
      </div>
    </footer>
  )
}
