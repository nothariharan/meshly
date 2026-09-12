import { Browser, Cube, Desktop } from "@phosphor-icons/react"
import { useInView, useSequence } from "../hooks"

const ENVS = [
  { key: "browser", label: "Browser", action: "Read data from web", Icon: Browser },
  { key: "sandbox", label: "Sandbox", action: "Run reconciliation", Icon: Cube },
  { key: "desktop", label: "Desktop", action: "Update ERP", Icon: Desktop },
] as const

/**
 * One worker, three real execution environments. The caption carries the point;
 * the motion just makes the fan-out legible.
 */
export function EnvironmentFlow() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const active = useSequence(ENVS.length, inView, 1200)

  return (
    <div className="env-flow" ref={ref}>
      <div className="env-worker panel">
        <div className="env-worker-name mono">invoice-reconciler</div>
        <div className="env-worker-task muted">Reconcile today's payments with the ERP</div>
      </div>
      <div className="env-rail" aria-hidden>
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="env-svg">
          <path d="M300 0 C300 40 100 50 100 120" />
          <path d="M300 0 L300 120" />
          <path d="M300 0 C300 40 500 50 500 120" />
        </svg>
      </div>
      <div className="env-cards">
        {ENVS.map((env, i) => (
          <div className={`env-card panel ${i === active ? "on" : ""}`} key={env.key}>
            <div className="env-card-top">
              <env.Icon size={18} weight="regular" />
              <span className="env-card-label">{env.label}</span>
            </div>
            <div className="env-card-action muted">{env.action}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
