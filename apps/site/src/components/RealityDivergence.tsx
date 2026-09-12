import { useInView, useSequence } from "../hooks"

const ROWS = [
  { label: "Agent claim", value: "SUCCESS", state: "ok" },
  { label: "Tool execution", value: "SUCCESS", state: "ok" },
  { label: "World state", value: "MISMATCH", state: "bad" },
] as const

/**
 * Agent says success. Tool says success. The world disagrees.
 * The sequence deliberately stops on COMMIT BLOCKED.
 */
export function RealityDivergence() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const step = useSequence(ROWS.length + 1, inView, 1100, false)
  const blocked = step >= ROWS.length

  return (
    <div className="divergence" ref={ref}>
      <div className="divergence-rows">
        {ROWS.map((row, i) => {
          const revealed = step >= i
          return (
            <div className={`divergence-row ${revealed ? "on" : ""}`} key={row.label}>
              <span className="divergence-label">{row.label}</span>
              <span className={`divergence-value ${row.state}`}>{ revealed ? row.value : "—"}</span>
            </div>
          )
        })}
      </div>
      <div className={`divergence-verdict ${blocked ? "on" : ""}`}>
        <span className="divergence-verdict-title">COMMIT BLOCKED</span>
        <span className="divergence-verdict-sub">The agent said it worked. The tool said it worked. The world disagreed.</span>
      </div>
    </div>
  )
}
