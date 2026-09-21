import { BENCHMARK_HEADLINE, BENCHMARK_META, BENCHMARK_ROWS } from "../benchmarkResults"
import { useInView } from "../hooks"

/**
 * The proof section. Same model. Same task. Same environments. Same starting
 * state. The only variable is whether Meshly governs the execution. Numbers are
 * real simulator runs — see apps/site/src/benchmarkResults.ts.
 */
export function BenchmarkProof() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <div className={`bench-container ${inView ? "on" : ""}`} ref={ref}>
      <div className="bench-headline-grid">
        {BENCHMARK_HEADLINE.map((h) => (
          <div className="bench-headline-card panel" key={h.metric}>
            <div className="bench-headline-metric">{h.metric}</div>
            <div className="bench-headline-detail muted">{h.detail}</div>
            <div className="bench-headline-compare">
              <div className="bh-col">
                <span className="bh-label mono">Direct</span>
                <span className={`bh-val mono ${h.hazard ? "bad" : ""}`}>{h.direct}</span>
              </div>
              <div className="bh-divider" />
              <div className="bh-col">
                <span className="bh-label mono accent">Meshly</span>
                <span className={`bh-val mono ${h.good || h.hazard ? "good" : "accent"}`}>{h.meshly}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bench panel">
        <div className="bench-head">
          <span className="bt mono">scenario & metric</span>
          <span className="bt mono">direct agent</span>
          <span className="bt mono accent">meshly</span>
        </div>
        {BENCHMARK_ROWS.map((row, i) => (
          <div className="bench-row" key={`${row.metric}-${row.detail ?? ""}`} style={{ transitionDelay: `${i * 40}ms` }}>
            <span className="bench-metric">
              {row.metric}
              {row.detail && <em className="bench-detail muted">{row.detail}</em>}
            </span>
            <span className={`bench-value mono ${row.hazard ? "bad" : ""}`}>{row.direct}</span>
            <span className={`bench-value mono ${row.hazard || row.good ? "good" : "accent"}`}>{row.meshly}</span>
          </div>
        ))}
        <div className="bench-foot faint mono">
          source {BENCHMARK_META.source} · seed {BENCHMARK_META.seed} · {BENCHMARK_META.trials} trials per scenario · {BENCHMARK_META.command}
        </div>
      </div>
    </div>
  )
}

