import { useEffect, useState, type MouseEvent } from "react"
import { ArrowRight, Copy, Check } from "@phosphor-icons/react"

interface Workspace404Props {
  onBackToHome?: () => void
}

const CLI = "meshly dev"
const NPX = "npx -y @nothariharan/meshly dev"

export function Workspace404({ onBackToHome }: Workspace404Props) {
  const [probeStatus, setProbeStatus] = useState<"checking" | "offline" | "connected">("checking")
  const [copied, setCopied] = useState(false)
  const [useNpx, setUseNpx] = useState(false)
  const [probeCount, setProbeCount] = useState(1)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1400)
    setProbeStatus("checking")
    fetch("http://localhost:3400/api/overview", { mode: "no-cors", signal: controller.signal })
      .then(() => {
        if (!cancelled) setProbeStatus("connected")
      })
      .catch(() => {
        if (!cancelled) setProbeStatus("offline")
      })
      .finally(() => clearTimeout(timeoutId))
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [probeCount])

  const command = useNpx ? NPX : CLI
  const online = probeStatus === "connected"

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    if (!onBackToHome) return
    event.preventDefault()
    onBackToHome()
  }

  return (
    <div className="w404">
      <header className="w404-nav">
        <a href="/" className="w404-brand" onClick={goHome}>
          <span className="glyph">
            <img src="/logo.png" alt="" />
          </span>
          <img className="word" src="/text_logo.png" alt="Meshly" />
        </a>
        <a href="/" className="w404-back" onClick={goHome}>
          Back to site <ArrowRight size={14} />
        </a>
      </header>

      <main className="w404-main">
        <p className="w404-num" aria-hidden={online}>
          {online ? "3400" : "404"}
        </p>

        <span className={`w404-badge ${online ? "ok" : "bad"}`}>
          {online ? "Workspace found" : "Workspace not found"}
        </span>

        <h1>{online ? "The workspace is running." : "This page isn't here."}</h1>

        <p className="w404-lead">
          {online
            ? "The operator console is responding at localhost:3400. Open it on this machine."
            : "Nothing is being served at localhost:3400. The operator console runs on your machine. Start it, then open this page again."}
        </p>

        {!online && (
          <div className="w404-cmd">
            <code>
              <span className="w404-prompt">$</span> {command}
            </code>
            <button type="button" className="w404-copy" onClick={copyCommand}>
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {!online && (
          <button type="button" className="w404-alt" onClick={() => setUseNpx((v) => !v)}>
            {useNpx ? "Use the global CLI instead" : "No global install? Use npx"}
          </button>
        )}

        <div className="w404-actions">
          {online ? (
            <a className="w404-primary" href="http://localhost:3400" target="_blank" rel="noreferrer">
              Open localhost:3400
            </a>
          ) : (
            <>
              <button
                type="button"
                className="w404-primary"
                onClick={() => setProbeCount((c) => c + 1)}
                disabled={probeStatus === "checking"}
              >
                {probeStatus === "checking" ? "Checking…" : "Check again"}
              </button>
              <a className="w404-secondary" href="http://localhost:3400" target="_blank" rel="noreferrer">
                Open localhost:3400
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
