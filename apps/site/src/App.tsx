import { ArrowRight, Check, Copy, GithubLogo } from "@phosphor-icons/react"
import { useState, useEffect } from "react"
import { EnvironmentFlow } from "./components/EnvironmentFlow"
import { RealityDivergence } from "./components/RealityDivergence"
import { UnknownRecovery } from "./components/UnknownRecovery"
import { WorkerWorkspace } from "./components/WorkerWorkspace"
import { InstallTerminal } from "./components/InstallTerminal"
import { WorksWithAgents } from "./components/WorksWithAgents"
import { ArchitectureDiagram } from "./components/ArchitectureDiagram"
import { HowItWorks } from "./components/HowItWorks"
import { HeroConsole } from "./components/HeroConsole"
import { BenchmarkProof } from "./components/BenchmarkProof"
import { Workspace404 } from "./components/Workspace404"

const GH = "https://github.com/nothariharan/meshly"
const WORKSPACE = "http://localhost:3400"

export function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname
      return p === "/" || p === "" ? "/" : p
    }
    return "/"
  })

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname
      setCurrentPath(p === "/" || p === "" ? "/" : p)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const navigate = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", path)
    }
    setCurrentPath(path)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (currentPath !== "/") {
    return <Workspace404 onBackToHome={() => navigate("/")} />
  }

  return (
    <>
      <Nav onOpenWorkspace={() => navigate("/workspace")} />
      <Hero onOpenWorkspace={() => navigate("/workspace")} />

      <section id="how">
        <div className="wrap section-pad">
          <HowItWorks />
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
          <ArchitectureDiagram />
        </div>
      </section>

      <section id="benchmark">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">Evidence</div>
            <h2>Same agent. Same infrastructure. Different execution model.</h2>
            <p className="lead">
              A controlled simulator benchmark across 100 trials per scenario. Same model, same task, same starting state. The only variable is whether Meshly governs the execution. These numbers are from the local simulator, not live Solari.
            </p>
          </div>
          <BenchmarkProof />
          <p className="bench-note muted">
            Direct execution means the agent talks straight to the tools and commits on its own claim. Meshly intercepts
            authority before dispatch and verifies the world before commit. Ground truth is read from the world, never
            from the model's claim.
          </p>
        </div>
      </section>

      <section id="install">
        <div className="wrap section-pad">
          <div className="section-head">
            <div className="eyebrow">Get started</div>
            <h2>Install Meshly in seconds.</h2>
            <p className="lead">
              Get up and running with a few commands. Requires Node 20+ and a Solari account. Pass --simulator only when you mean the local kernel.
            </p>
          </div>
          <InstallTerminal />
          <WorksWithAgents />
        </div>
      </section>

      <Footer />
    </>
  )
}

function Nav({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
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
          <a href="#benchmark">Benchmark</a>
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
          <button className="btn sm" onClick={onOpenWorkspace}>
            Open workspace
          </button>
          <a className="btn primary sm" href="#install">
            Get started <ArrowRight size={14} weight="bold" />
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText("npm install -g @nothariharan/meshly")
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
            <span>npm install -g @nothariharan/meshly</span>
            <button className="copy-btn" onClick={copy} aria-label="Copy install command">
              {copied ? <Check size={15} weight="bold" /> : <Copy size={15} weight="regular" />}
            </button>
          </div>
          <div className="hero-actions">
            <a className="btn primary" href="#install">
              Get started <ArrowRight size={15} weight="bold" />
            </a>
            <button className="btn ghost" onClick={onOpenWorkspace}>
              Open workspace
            </button>
          </div>
          <p className="hero-note">The workspace is local to your machine — `meshly dev` serves it at localhost:3400.</p>
        </div>
        <HeroConsole />
      </div>
    </section>
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
