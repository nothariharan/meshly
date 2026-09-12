import { useState } from "react"
import { Check, Copy } from "@phosphor-icons/react"
import { useInView, useSequence } from "../hooks"

const LINES: Array<{ text: string; prompt?: boolean; tone?: "ok" | "ready" }> = [
  { text: "meshly doctor", prompt: true },
  { text: "✓ Meshly installed", tone: "ok" },
  { text: "✓ Node 22.19.0", tone: "ok" },
  { text: "✓ Solari API key configured", tone: "ok" },
  { text: "✓ Browser environment available", tone: "ok" },
  { text: "✓ Sandbox environment available", tone: "ok" },
  { text: "✓ Desktop environment available", tone: "ok" },
  { text: "Meshly is ready.", tone: "ready" },
]

export function InstallTerminal() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const step = useSequence(LINES.length, inView, 480)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText("npm install -g meshly")
    } catch {
      /* clipboard may be unavailable; the command is visible regardless */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="install" ref={ref}>
      <div className="window">
        <div className="window-bar">
          <div className="dots">
            <span />
            <span />
            <span />
          </div>
          <span className="window-title">terminal</span>
        </div>
        <div className="window-body terminal">
          {LINES.map((line, i) => {
            const revealed = i <= step
            const current = i === step
            return (
              <div className={`terminal-line ${line.tone || ""} ${revealed ? "on" : ""} ${current ? "typing" : ""}`} key={line.text}>
                {line.prompt && <span className="terminal-prompt">$ </span>}
                <span>{revealed ? line.text : "\u00A0"}</span>
                {current && <span className="caret" />}
              </div>
            )
          })}
        </div>
      </div>
      <div className="install-steps">
        {["meshly init", "meshly doctor", "meshly run", "meshly dev"].map((cmd, i) => (
          <div className="install-step" key={cmd}>
            <span className="install-step-n mono">{i + 1}</span>
            <span className="mono">{cmd}</span>
          </div>
        ))}
        <button className="btn sm" onClick={copy}>
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="regular" />}
          {copied ? "Copied" : "Copy install command"}
        </button>
      </div>
    </div>
  )
}
