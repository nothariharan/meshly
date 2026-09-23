import React, { useState, useEffect } from "react"
import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsClockwise,
  Browser,
  Check,
  CheckCircle,
  Copy,
  Cube,
  Desktop,
  GithubLogo,
  Shield,
  WarningCircle,
} from "@phosphor-icons/react"

interface Workspace404Props {
  onBackToHome?: () => void
}

export function Workspace404({ onBackToHome }: Workspace404Props) {
  const [probeStatus, setProbeStatus] = useState<"checking" | "offline" | "connected">("checking")
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<"cli" | "npx">("cli")
  const [probeCount, setProbeCount] = useState(1)

  const checkLocalDaemon = async () => {
    setProbeStatus("checking")
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1400)
      // Attempting to fetch health from local Meshly console
      await fetch("http://localhost:3400/api/overview", {
        mode: "no-cors",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      // If no-cors fetch doesn't throw network error, localhost:3400 is actively listening!
      setProbeStatus("connected")
    } catch {
      setProbeStatus("offline")
    }
  }

  useEffect(() => {
    checkLocalDaemon()
  }, [probeCount])

  const copyCommand = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  const activeCmd = tab === "cli" ? "meshly dev" : "npx -y @nothariharan/meshly dev"

  return (
    <div className="w404-container">
      {/* Background ambient grid */}
      <div className="w404-grid-bg" />
      <div className="w404-vignette" />

      {/* Top Header Bar */}
      <header className="w404-nav">
        <div className="w404-nav-left">
          <a
            href="/"
            onClick={(e) => {
              if (onBackToHome) {
                e.preventDefault()
                onBackToHome()
              }
            }}
            className="w404-brand"
          >
            <span className="glyph">
              <img src="/logo.png" alt="" />
            </span>
            <img className="word" src="/text_logo.png" alt="Meshly" />
          </a>
        </div>
        <div className="w404-nav-right">
          <div className={`w404-status-badge ${probeStatus}`}>
            <span className="w404-pulse-dot" />
            <span className="w404-status-text">
              {probeStatus === "checking"
                ? "PROBING :3400"
                : probeStatus === "connected"
                ? "DAEMON DETECTED"
                : "DAEMON OFFLINE"}
            </span>
          </div>
          <a
            href="/"
            onClick={(e) => {
              if (onBackToHome) {
                e.preventDefault()
                onBackToHome()
              }
            }}
            className="btn ghost sm"
          >
            <ArrowLeft size={14} weight="bold" /> Back to site
          </a>
        </div>
      </header>

      {/* Main 404 Stage */}
      <main className="w404-stage">
        {/* Radar & Mesh Hologram Centerpiece */}
        <div className="w404-radar-wrap">
          <div className="w404-radar-glow" />
          
          <svg className="w404-radar-svg" viewBox="0 0 440 440" fill="none">
            <defs>
              <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3ecf8e" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#3ecf8e" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#3ecf8e" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="laserBeam" x1="220" y1="220" x2="420" y2="220" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3ecf8e" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#3ecf8e" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Radar concentric rings */}
            <circle cx="220" cy="220" r="190" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <circle cx="220" cy="220" r="135" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <circle cx="220" cy="220" r="80" stroke="rgba(255,255,255,0.12)" />

            {/* Crosshairs */}
            <line x1="220" y1="20" x2="220" y2="420" stroke="rgba(255,255,255,0.05)" />
            <line x1="20" y1="220" x2="420" y2="220" stroke="rgba(255,255,255,0.05)" />

            {/* Connecting telemetry lines */}
            <line x1="220" y1="220" x2="95" y2="125" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />
            <line x1="220" y1="220" x2="345" y2="125" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />
            <line x1="220" y1="220" x2="220" y2="345" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />

            {/* Rotating radar sweep */}
            <g className="w404-sweep-group">
              <path d="M 220 220 L 410 220 A 190 190 0 0 0 220 30 Z" fill="url(#radarSweepGrad)" />
              <line x1="220" y1="220" x2="410" y2="220" stroke="url(#laserBeam)" strokeWidth="1.5" />
            </g>

            {/* Central Node: Localhost :3400 */}
            <circle cx="220" cy="220" r="24" fill="#0e0f10" stroke={probeStatus === "connected" ? "#3ecf8e" : "#e5484d"} strokeWidth="2" />
            <circle cx="220" cy="220" r="6" fill={probeStatus === "connected" ? "#3ecf8e" : "#f5a524"} />

            {/* Node 1: Browser (Top Left) */}
            <circle cx="95" cy="125" r="18" fill="#0e0f10" stroke="#2c2d30" strokeWidth="1.5" />
            <circle cx="95" cy="125" r="4" fill="#6ea8fe" />

            {/* Node 2: Sandbox (Top Right) */}
            <circle cx="345" cy="125" r="18" fill="#0e0f10" stroke="#2c2d30" strokeWidth="1.5" />
            <circle cx="345" cy="125" r="4" fill="#f5a524" />

            {/* Node 3: Desktop (Bottom Center) */}
            <circle cx="220" cy="345" r="18" fill="#0e0f10" stroke="#2c2d30" strokeWidth="1.5" />
            <circle cx="220" cy="345" r="4" fill="#3ecf8e" />
          </svg>

          {/* Node HTML overlays for labels */}
          <div className="w404-hub-label">
            <span className="mono">:3400</span>
            <span className="w404-sub-tag">LOCAL KERNEL</span>
          </div>

          <div className="w404-sat-node n-browser">
            <Browser size={15} weight="bold" />
            <span>Browser</span>
          </div>
          <div className="w404-sat-node n-sandbox">
            <Cube size={15} weight="bold" />
            <span>Sandbox</span>
          </div>
          <div className="w404-sat-node n-desktop">
            <Desktop size={15} weight="bold" />
            <span>Desktop</span>
          </div>
        </div>

        {/* Narrative & Status Content */}
        <div className="w404-content">
          <div className="w404-pill">
            <span className="w404-error-code">404</span>
            <span className="w404-error-sep">/</span>
            <span>WORKSPACE_NOT_FOUND</span>
          </div>

          <h1 className="w404-title">Autonomous workers live on your machine.</h1>

          <p className="w404-desc">
            Meshly is deliberately <strong>local-first</strong>. We do not host your workers, execution telemetry, or
            Solari credentials in the public cloud. Your Operator Console runs privately on your local socket{" "}
            <code>http://localhost:3400</code>.
          </p>

          {/* Connected Callout or Offline Warning */}
          {probeStatus === "connected" ? (
            <div className="w404-notice success">
              <CheckCircle size={20} weight="fill" className="text-verified" />
              <div>
                <strong>Local daemon detected on port 3400!</strong>
                <p>Your local Meshly Operator Console is active and responding.</p>
              </div>
              <a
                href="http://localhost:3400"
                target="_blank"
                rel="noreferrer"
                className="btn primary sm w404-launch-btn"
              >
                Launch Console <ArrowSquareOut size={14} weight="bold" />
              </a>
            </div>
          ) : (
            <div className="w404-notice warning">
              <WarningCircle size={20} weight="fill" className="text-unknown" />
              <div>
                <strong>Port 3400 is not responding.</strong>
                <p>Start your local workspace by launching the Meshly dev server in your project directory.</p>
              </div>
            </div>
          )}

          {/* Terminal Command Card */}
          <div className="w404-term-box">
            <div className="w404-term-head">
              <div className="w404-term-tabs">
                <button
                  className={`w404-tab ${tab === "cli" ? "active" : ""}`}
                  onClick={() => setTab("cli")}
                >
                  Global CLI
                </button>
                <button
                  className={`w404-tab ${tab === "npx" ? "active" : ""}`}
                  onClick={() => setTab("npx")}
                >
                  npx (Zero Install)
                </button>
              </div>
              <div className="w404-dots">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="w404-term-body">
              <div className="w404-term-line">
                <span className="w404-term-prompt">$</span>
                <span className="w404-term-cmd mono">{activeCmd}</span>
                <button
                  className="w404-term-copy"
                  onClick={() => copyCommand(activeCmd)}
                  title="Copy command"
                >
                  {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="w404-term-log faint mono">
                ▸ Serving Operator Console at http://localhost:3400
                <br />▸ MCP socket ready for Cursor, Claude & Windsurf
                <br />▸ All state stored in .meshly/ (local & private)
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="w404-actions">
            <button
              className="btn primary"
              onClick={() => setProbeCount((c) => c + 1)}
              disabled={probeStatus === "checking"}
            >
              <ArrowsClockwise
                size={16}
                weight="bold"
                className={probeStatus === "checking" ? "w404-spin" : ""}
              />
              {probeStatus === "checking" ? "Probing :3400..." : "Re-scan Port 3400"}
            </button>

            <a
              href="http://localhost:3400"
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Open http://localhost:3400 <ArrowSquareOut size={14} />
            </a>

            <a
              href="https://github.com/nothariharan/meshly"
              target="_blank"
              rel="noreferrer"
              className="btn ghost"
            >
              <GithubLogo size={16} weight="fill" /> Documentation
            </a>
          </div>

          {/* Privacy Note */}
          <div className="w404-footer-note faint">
            <Shield size={14} weight="bold" />
            <span>Zero telemetry leaves your machine. Solari execution keys never transit public endpoints.</span>
          </div>
        </div>
      </main>
    </div>
  )
}
