import { useInView, useSequence } from "../hooks"

const STAGES = ["Intent", "Authorize", "Browser", "Sandbox", "Desktop", "Verify", "Commit"] as const

/**
 * The Meshly execution spine. Reused in the hero and product sections.
 * The active stage advances automatically — the interface is the illustration.
 */
export function ExecutionGraph({ compact = false }: { compact?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const step = useSequence(STAGES.length, inView, compact ? 700 : 900)

  return (
    <div className={`exec-graph ${compact ? "compact" : ""}`} ref={ref}>
      <div className="exec-track">
        {STAGES.map((stage, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo"
          return (
            <div className={`exec-node ${state}`} key={stage}>
              <div className="exec-line" aria-hidden />
              <div className="exec-dot">
                {state === "done" ? "✓" : state === "active" ? <span className="exec-spin" /> : ""}
              </div>
              <div className="exec-label">{stage}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
