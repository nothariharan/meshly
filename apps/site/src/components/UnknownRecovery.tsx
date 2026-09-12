import { useInView, useSequence } from "../hooks"

const EVENTS = [
  { label: "Action dispatched", tone: "muted" },
  { label: "Connection lost", tone: "muted" },
  { label: "UNKNOWN", tone: "unknown" },
  { label: "Retry blocked", tone: "muted" },
  { label: "Independent verify", tone: "muted" },
  { label: "VERIFIED", tone: "verified" },
] as const

/**
 * UNKNOWN is a first-class state, not a failure. The flow plays like an
 * operating-system event log, then resolves.
 */
export function UnknownRecovery() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const step = useSequence(EVENTS.length, inView, 850, false)

  return (
    <div className="unknown-flow" ref={ref}>
      {EVENTS.map((event, i) => {
        const revealed = i <= step
        const current = i === step
        return (
          <div className={`unknown-row ${event.tone} ${revealed ? "on" : ""} ${current ? "current" : ""}`} key={event.label}>
            <span className={`unknown-mark ${event.tone}`}>
              {event.tone === "verified" ? "✓" : event.tone === "unknown" ? "!" : "—"}
            </span>
            <span className="unknown-label">{event.label}</span>
            {current && event.tone === "unknown" && <span className="unknown-tag">no automatic retry</span>}
          </div>
        )
      })}
    </div>
  )
}
