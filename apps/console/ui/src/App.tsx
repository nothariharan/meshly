import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Browser, Cube, Desktop, Plus, TerminalWindow } from "@phosphor-icons/react"
import {
  compensate,
  createWorker,
  fetchSnapshot,
  initProject,
  reverify,
  runFailure,
  runWorker,
  takeover,
  type EnvRecord,
  type RunRecord,
  type Snapshot,
  type WorkerRow,
} from "./api"

type Route =
  | { name: "workers" }
  | { name: "worker"; id: string }
  | { name: "runs" }
  | { name: "run"; id: string }
  | { name: "environments" }
  | { name: "policies" }

function parseHash(): Route {
  const raw = location.hash.replace(/^#/, "") || "/workers"
  const parts = raw.split("/").filter(Boolean)
  if (parts[0] === "workers" && parts[1]) return { name: "worker", id: decodeURIComponent(parts[1]) }
  if (parts[0] === "runs" && parts[1]) return { name: "run", id: decodeURIComponent(parts[1]) }
  if (parts[0] === "runs") return { name: "runs" }
  if (parts[0] === "environments") return { name: "environments" }
  if (parts[0] === "policies") return { name: "policies" }
  return { name: "workers" }
}

function go(path: string) {
  location.hash = path
}

function ago(ts: number | string | undefined): string {
  if (!ts) return "-"
  const n = typeof ts === "string" ? Date.parse(ts) : ts
  if (!Number.isFinite(n)) return "-"
  const s = Math.max(0, Math.round((Date.now() - n) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function pillClass(status: string): string {
  const s = status.toUpperCase()
  if (s === "VERIFIED" || s === "COMPLETED" || s === "COMMITTED") return "ok"
  if (s === "RUNNING" || s === "BUSY" || s === "ACTIVE" || s === "READY") return "run"
  if (s === "BLOCKED" || s === "PAUSED" || s === "WAITING" || s === "VERIFICATION_FAILED") return "warn"
  if (s === "FAILED" || s === "CANCELLED" || s === "TERMINATED" || s === "REJECTED") return "bad"
  return ""
}

function verifyLabel(v: WorkerRow["lastVerification"]): string {
  if (!v) return "-"
  if (v.worldStateMatched === false) return "MISMATCH"
  if (v.worldStateMatched === true) return "MATCHED"
  return "-"
}

function EnvIcon({ type }: { type?: string }) {
  if (type === "sandbox") return <Cube size={14} weight="regular" />
  if (type === "desktop") return <Desktop size={14} weight="regular" />
  if (type === "browser") return <Browser size={14} weight="regular" />
  return <TerminalWindow size={14} weight="regular" />
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [state, setState] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setState(await fetchSnapshot())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  useEffect(() => {
    refresh()
    const es = new EventSource("/api/stream")
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.state) setState(msg.state)
      } catch {
        /* ignore malformed frames */
      }
    }
    const poll = setInterval(refresh, 2500)
    return () => {
      es.close()
      clearInterval(poll)
    }
  }, [refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur()
        return
      }
      if (e.key === "Escape") setCreating(false)
      if (e.key === "1") go("/workers")
      if (e.key === "2") go("/runs")
      if (e.key === "3") go("/environments")
      if (e.key === "4") go("/policies")
      if (e.key === "c" || e.key === "n") {
        e.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  if (!state) {
    return (
      <div className="page">
        <p className="muted">Loading Meshly state…</p>
      </div>
    )
  }

  const nav = route.name === "worker" ? "workers" : route.name === "run" ? "runs" : route.name

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Meshly</div>
        <nav className="nav">
          <a className={nav === "workers" ? "active" : ""} href="#/workers">
            Workers
          </a>
          <a className={nav === "runs" ? "active" : ""} href="#/runs">
            Runs
          </a>
          <a className={nav === "environments" ? "active" : ""} href="#/environments">
            Environments
          </a>
          <a className={nav === "policies" ? "active" : ""} href="#/policies">
            Policies
          </a>
        </nav>
        <div className={`provider ${state.provider.mode === "live" ? "live" : ""}`}>{state.provider.label}</div>
      </header>

      {route.name === "workers" && (
        <WorkersPage
          state={state}
          onCreate={() => setCreating(true)}
          onRun={(id) => act("run", () => runWorker(id))}
          onFail={() => act("fail", () => runFailure())}
          onInit={() => act("init", () => initProject())}
        />
      )}
      {route.name === "worker" && (
        <WorkerDetail
          state={state}
          id={route.id}
          onRun={(id) => act("run", () => runWorker(id))}
          onFail={(id) => act("fail", () => runWorker(id, "reality-divergence"))}
        />
      )}
      {route.name === "runs" && <RunsPage state={state} />}
      {route.name === "run" && (
        <RunPage
          state={state}
          id={route.id}
          busy={busy}
          onReverify={() => act("reverify", () => reverify(route.id))}
          onTakeover={() => act("takeover", () => takeover(route.id))}
          onCompensate={() => act("compensate", () => compensate(route.id))}
        />
      )}
      {route.name === "environments" && <EnvironmentsPage state={state} />}
      {route.name === "policies" && <PoliciesPage state={state} />}

      {creating && (
        <CreateWorker
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            go(`/workers/${id}`)
            refresh()
          }}
        />
      )}
      {error && (
        <div className="toast" role="status">
          {error}
        </div>
      )}
    </div>
  )
}

function WorkersPage({
  state,
  onCreate,
  onRun,
  onFail,
  onInit,
}: {
  state: Snapshot
  onCreate: () => void
  onRun: (id: string) => void
  onFail: () => void
  onInit: () => void
}) {
  if (!state.initialized) {
    return (
      <main className="page">
        <div className="empty">
          <h2>No Meshly project here</h2>
          <p>Init writes local `.meshly/` state. The console reads that directory. Nothing is seeded.</p>
          <button className="btn primary" onClick={onInit}>
            Create project
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Workers</h1>
          <p>Autonomous workers are logical entities. Environments are leased underneath them.</p>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <button className="btn ghost" onClick={onFail}>
            Run failure workflow
          </button>
          <button className="btn primary" onClick={onCreate}>
            <Plus size={14} weight="bold" /> Create worker
          </button>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="k">Workers</div>
          <div className="v">{state.workers.length}</div>
        </div>
        <div className="stat">
          <div className="k">Need attention</div>
          <div className={`v ${state.attention.length ? "warn" : ""}`}>{state.attention.length}</div>
        </div>
        <div className="stat">
          <div className="k">Occupied environments</div>
          <div className="v">{state.occupied.length}</div>
        </div>
        <div className="stat">
          <div className="k">Verification failures</div>
          <div className={`v ${state.failedVerify ? "warn" : "ok"}`}>{state.failedVerify}</div>
        </div>
      </div>
      {state.workers.length === 0 ? (
        <div className="empty">
          <h2>No workers yet.</h2>
          <p>Create your first worker. Then run it and open the execution graph.</p>
          <button className="btn primary" onClick={onCreate}>
            <Plus size={14} weight="bold" /> Create worker
          </button>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Current run</th>
              <th>Environment</th>
              <th>Budget</th>
              <th>Last event</th>
              <th>Verification</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.workers.map((w) => (
              <tr key={w.id} onClick={() => go(`/workers/${w.id}`)}>
                <td>
                  <div>{w.name}</div>
                  <div className="faint">{w.task}</div>
                </td>
                <td>
                  <span className={`pill ${pillClass(w.displayStatus)}`}>{w.displayStatus}</span>
                </td>
                <td className="mono muted">{w.currentRunId || "-"}</td>
                <td className="muted">
                  {w.environment ? `${w.environment.type} · ${w.environment.status}` : "-"}
                </td>
                <td className="mono">
                  ${(w.spent || 0).toFixed(2)} / ${Number(w.budget).toFixed(2)}
                </td>
                <td className="mono muted">{w.lastEvent?.type || "-"}</td>
                <td>
                  <span className={`pill ${w.lastVerification?.worldStateMatched === false ? "warn" : w.lastVerification?.worldStateMatched ? "ok" : ""}`}>
                    {verifyLabel(w.lastVerification)}
                  </span>
                </td>
                <td className="muted">{ago(w.updatedAt)}</td>
                <td>
                  <button
                    className="btn"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onRun(w.id)
                    }}
                  >
                    Run
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

function WorkerDetail({
  state,
  id,
  onRun,
  onFail,
}: {
  state: Snapshot
  id: string
  onRun: (id: string) => void
  onFail: (id: string) => void
}) {
  const worker = state.workers.find((w) => w.id === id || w.name === id)
  const runs = state.runs.filter((r) => r.workerId === worker?.id || r.workerName === worker?.name)
  if (!worker) {
    return (
      <main className="page">
        <p className="muted">Worker not found.</p>
      </main>
    )
  }
  const memory = worker.memory || []
  const tiers = {
    hot: memory.filter((m) => m.tier === "hot").length,
    warm: memory.filter((m) => m.tier === "warm").length,
    cold: memory.filter((m) => m.tier === "cold").length,
  }
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{worker.name}</h1>
          <p>{worker.task}</p>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <button className="btn ghost" onClick={() => onFail(worker.id)}>
            Run with mismatch
          </button>
          <button className="btn primary" onClick={() => onRun(worker.id)}>
            Run worker
          </button>
        </div>
      </div>
      <dl className="kv">
        <dt>Status</dt>
        <dd>
          <span className={`pill ${pillClass(worker.displayStatus)}`}>{worker.displayStatus}</span>
        </dd>
        <dt>Current run</dt>
        <dd>
          {worker.currentRunId ? (
            <a className="mono" href={`#/runs/${worker.currentRunId}`}>
              {worker.currentRunId}
            </a>
          ) : (
            "-"
          )}
        </dd>
        <dt>Budget</dt>
        <dd className="mono">
          ${(worker.spent || 0).toFixed(2)} / ${Number(worker.budget).toFixed(2)}
        </dd>
        <dt>Capabilities</dt>
        <dd>
          <div className="chips">
            {worker.capabilities.map((c) => (
              <span className="chip" key={c}>
                {c}
              </span>
            ))}
          </div>
        </dd>
        <dt>Authority</dt>
        <dd>
          <div className="chips">
            {(worker.authority?.tools || []).map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
            {(worker.authority?.domains || ["example.com"]).map((d) => (
              <span className="chip" key={d}>
                {d}
              </span>
            ))}
          </div>
        </dd>
        <dt>Memory</dt>
        <dd className="muted">
          hot {tiers.hot} / warm {tiers.warm} / cold {tiers.cold}
        </dd>
      </dl>
      <h2 style={{ fontSize: 13, fontWeight: 560, margin: "0 0 10px", color: "var(--muted)" }}>Recent runs</h2>
      {runs.length === 0 ? (
        <p className="muted">No runs yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.runId} onClick={() => go(`/runs/${r.runId}`)}>
                <td className="mono">{r.runId}</td>
                <td>
                  <span className={`pill ${pillClass(r.status)}`}>{r.status}</span>
                </td>
                <td className="muted">{r.mode === "live" ? "LIVE · SOLARI" : "SIMULATOR"}</td>
                <td className="muted">{ago(r.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

function RunsPage({ state }: { state: Snapshot }) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Runs</h1>
          <p>One run is one attempt. An agent claim is not equivalent to reality.</p>
        </div>
      </div>
      {state.runs.length === 0 ? (
        <div className="empty">
          <h2>No runs yet.</h2>
          <p>Create a worker and run it. Completed live Solari probes appear here if they were persisted.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Worker</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Verification</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {state.runs.map((r) => {
              const mismatch = r.steps?.some((s: any) => s.worldStateMatched === false)
              return (
                <tr key={r.runId} onClick={() => go(`/runs/${r.runId}`)}>
                  <td className="mono">{r.runId}</td>
                  <td>{r.workerName || r.workerId}</td>
                  <td>
                    <span className={`pill ${pillClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="muted">{r.mode === "live" ? "LIVE · SOLARI" : "SIMULATOR"}</td>
                  <td>
                    <span className={`pill ${mismatch ? "warn" : r.status === "COMPLETED" ? "ok" : ""}`}>
                      {mismatch ? "MISMATCH" : r.status === "COMPLETED" ? "MATCHED" : "-"}
                    </span>
                  </td>
                  <td className="muted">{ago(r.startedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

function RunPage({
  state,
  id,
  busy,
  onReverify,
  onTakeover,
  onCompensate,
}: {
  state: Snapshot
  id: string
  busy: string | null
  onReverify: () => void
  onTakeover: () => void
  onCompensate: () => void
}) {
  const run = state.runs.find((r) => r.runId === id || r.runId.startsWith(id))
  const [open, setOpen] = useState<string | null>(null)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  if (!run) {
    return (
      <main className="page">
        <p className="muted">Run not found in `.meshly/runs`.</p>
      </main>
    )
  }
  const step = run.steps[run.steps.length - 1] || {}
  const diverged =
    run.status === "BLOCKED" ||
    run.status === "VERIFICATION_FAILED" ||
    run.steps.some((s: any) => s.worldStateMatched === false)
  const stages = stageModel(run)

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>RUN #{run.runId}</h1>
          <p>
            {run.workerName || run.workerId} · {run.objective}
          </p>
        </div>
        <span className={`pill ${pillClass(run.status)}`}>{run.status}</span>
      </div>

      {diverged && (
        <div className="banner">
          <h2>REALITY DIVERGENCE DETECTED</h2>
          <p>UNVERIFIED COMMIT BLOCKED. An agent claim is not equivalent to reality.</p>
        </div>
      )}

      <div className="graph">
        {stages.map((s) => (
          <button
            key={s.key}
            className={`stage ${s.state} ${open === s.key ? "active" : ""}`}
            onClick={() => setOpen(open === s.key ? null : s.key)}
          >
            <div className="n">{s.key}</div>
            <div className="t">{s.label}</div>
            {open === s.key && <pre>{s.detail}</pre>}
          </button>
        ))}
      </div>

      <div className="claim-grid">
        <div className={`claim ${step.agentClaim === "SUCCESS" ? "ok" : step.agentClaim === "FAILURE" ? "bad" : ""}`}>
          <div className="n">Agent claim</div>
          <div className="t">{step.agentClaim || "PENDING"}</div>
        </div>
        <div className={`claim ${step.toolExecution === "SUCCESS" ? "ok" : step.toolExecution === "FAILURE" ? "bad" : ""}`}>
          <div className="n">Tool execution</div>
          <div className="t">
            {step.toolExecution === "SUCCESS" && step.observation?.httpStatus
              ? `HTTP ${step.observation.httpStatus} OK`
              : step.toolExecution || "PENDING"}
          </div>
        </div>
        <div className={`claim ${step.worldStateMatched === false ? "bad" : step.worldStateMatched ? "ok" : ""}`}>
          <div className="n">World state</div>
          <div className="t">{step.worldStateMatched === false ? "MISMATCH" : step.worldStateMatched ? "MATCHED" : "PENDING"}</div>
        </div>
        <div className={`claim ${diverged ? "bad" : run.status === "COMPLETED" ? "ok" : ""}`}>
          <div className="n">Commit</div>
          <div className="t">{diverged ? "BLOCKED" : run.status === "COMPLETED" ? "COMMITTED" : run.status}</div>
        </div>
      </div>

      {diverged && (
        <p className="muted" style={{ marginTop: -8 }}>
          Reason: {run.error || step.error || "Verification contract was not satisfied."}
        </p>
      )}

      {diverged && (
        <div className="actions">
          <button className="btn" disabled={busy === "reverify"} onClick={onReverify}>
            Re-verify
          </button>
          <button className="btn" disabled={busy === "takeover"} onClick={onTakeover}>
            Take over
          </button>
          <button className="btn" disabled={busy === "compensate"} onClick={onCompensate}>
            SAGA compensate
          </button>
          <button className="btn" onClick={() => setEvidenceOpen(true)}>
            Inspect evidence
          </button>
        </div>
      )}

      {run.takeover && (
        <p className="muted">
          Takeover {run.takeover.sessionId}
          {run.takeover.streamUrl ? ` · ${run.takeover.streamUrl}` : ""}
        </p>
      )}
      {run.compensated && <p className="muted">SAGA compensation recorded. Commit remains abandoned.</p>}

      <h2 style={{ fontSize: 13, fontWeight: 560, margin: "24px 0 10px", color: "var(--muted)" }}>Environments</h2>
      <EnvTable environments={run.environments} />

      <h2 style={{ fontSize: 13, fontWeight: 560, margin: "28px 0 10px", color: "var(--muted)" }}>Event stream</h2>
      <ol className="events">
        {[...(run.events || [])]
          .sort((a, b) => a.sequence - b.sequence || a.timestamp - b.timestamp)
          .map((ev) => (
            <li key={ev.id}>
              <time>{clock(ev.timestamp)}</time>
              <div>
                <div className="et">{ev.type}</div>
                {ev.parentEventId && <div className="faint">parent {ev.parentEventId}</div>}
              </div>
            </li>
          ))}
      </ol>
      {(run.events || []).length === 0 && (
        <p className="muted">No persisted events on this run. Newer runs record the full sequence.</p>
      )}

      <h2 style={{ fontSize: 13, fontWeight: 560, margin: "28px 0 10px", color: "var(--muted)" }}>
        Tamper-evident execution evidence
      </h2>
      <p className="muted">
        SHA-256 {run.sha256Digest || run.evidence?.tamperEvidentDigestSha256 || "not exported"}
      </p>
      <p className="faint" style={{ marginTop: 4, maxWidth: "62ch" }}>
        The digest establishes integrity of the exported evidence bundle. It does not prove the underlying observation is true.
      </p>
      <div className="actions">
        <button className="btn" onClick={() => setEvidenceOpen(!evidenceOpen)}>
          Inspect evidence
        </button>
      </div>
      {evidenceOpen && (
        <pre className="json">{JSON.stringify(run.evidence || { sha256Digest: run.sha256Digest, steps: run.steps }, null, 2)}</pre>
      )}
    </main>
  )
}

function stageModel(run: RunRecord) {
  const step = run.steps[run.steps.length - 1] || {}
  const diverged = step.worldStateMatched === false || run.status === "BLOCKED"
  return [
    {
      key: "INTENT",
      label: "Intent",
      state: step.intent ? "ok" : "",
      detail: step.intent || "No intent recorded",
    },
    {
      key: "ACTION",
      label: "Action",
      state: step.action ? "ok" : "",
      detail: JSON.stringify(step.action || {}, null, 2),
    },
    {
      key: "OBSERVATION",
      label: "Observation",
      state: step.observation ? "ok" : "",
      detail: JSON.stringify(step.observation || {}, null, 2),
    },
    {
      key: "VERIFICATION",
      label: "Verification",
      state: diverged ? "bad" : step.worldStateMatched ? "ok" : "",
      detail: JSON.stringify(
        {
          agentClaim: step.agentClaim,
          toolExecution: step.toolExecution,
          worldStateMatched: step.worldStateMatched,
          contract: step.contract,
          error: step.error,
        },
        null,
        2,
      ),
    },
    {
      key: "COMMIT",
      label: "Commit",
      state: diverged ? "bad" : run.status === "COMPLETED" ? "ok" : "",
      detail: diverged ? `BLOCKED\n${run.error || step.error || ""}` : run.status,
    },
  ]
}

function EnvironmentsPage({ state }: { state: Snapshot }) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Environments</h1>
          <p>Solari browsers, sandboxes, and desktops. Distinct from workers. Linked by lease.</p>
        </div>
      </div>
      {state.environments.length === 0 ? (
        <div className="empty">
          <h2>No environments yet.</h2>
          <p>A run leases execution resources. They show up here with provider, lease, and session id.</p>
        </div>
      ) : (
        <EnvTable environments={state.environments} />
      )}
    </main>
  )
}

function EnvTable({ environments }: { environments: EnvRecord[] }) {
  if (!environments?.length) return <p className="muted">None recorded.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Provider</th>
          <th>Status</th>
          <th>Worker</th>
          <th>Lease</th>
          <th>Session</th>
          <th>Created</th>
          <th>Last activity</th>
        </tr>
      </thead>
      <tbody>
        {environments.map((e) => (
          <tr key={e.id} onClick={() => e.runId && go(`/runs/${e.runId}`)}>
            <td>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <EnvIcon type={e.type} />
                {e.type}
              </span>
            </td>
            <td>
              <span className={`pill ${e.provider === "solari" ? "ok" : ""}`}>
                {e.provider === "solari" ? "LIVE · SOLARI" : "SIMULATOR"}
              </span>
            </td>
            <td>
              <span className={`pill ${pillClass(e.status)}`}>{e.status}</span>
            </td>
            <td>
              {e.workerId ? (
                <a href={`#/workers/${e.workerId}`} onClick={(ev) => ev.stopPropagation()}>
                  {e.workerName || e.workerId}
                </a>
              ) : (
                "-"
              )}
            </td>
            <td className="mono muted">{e.leaseId || "-"}</td>
            <td className="mono muted" title={e.sessionId || e.fabricId}>
              {(e.sessionId || e.fabricId || "-").slice(0, 24)}
            </td>
            <td className="muted">{ago(e.createdAt)}</td>
            <td className="muted">{ago(e.lastActivityAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PoliciesPage({ state }: { state: Snapshot }) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Policies</h1>
          <p>Authority envelopes bound to workers. Child privileges cannot expand a parent.</p>
        </div>
      </div>
      {state.policies.length === 0 ? (
        <div className="empty">
          <h2>No policies yet.</h2>
          <p>Creating a worker issues an authority lease: tools, domains, and spend ceiling.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Tools</th>
              <th>Domains</th>
              <th>Spend ceiling</th>
            </tr>
          </thead>
          <tbody>
            {state.policies.map((p) => (
              <tr key={p.workerId} onClick={() => go(`/workers/${p.workerId}`)}>
                <td>{p.workerName}</td>
                <td className="mono muted">{p.authority.tools.join(", ") || "-"}</td>
                <td className="mono muted">{(p.authority.domains || []).join(", ") || "-"}</td>
                <td className="mono">${Number(p.authority.maxSpend ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

function CreateWorker({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("")
  const [task, setTask] = useState("")
  const [caps, setCaps] = useState<string[]>(["browser"])
  const [budget, setBudget] = useState("2.00")
  const [error, setError] = useState<string | null>(null)
  function toggle(cap: string) {
    setCaps((c) => (c.includes(cap) ? c.filter((x) => x !== cap) : [...c, cap]))
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const res = await createWorker({
        name,
        task,
        capabilities: caps.length ? caps : ["browser"],
        budget: Number(budget) || 2,
      })
      onCreated(res.worker.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Create worker</h2>
        <div className="field">
          <label htmlFor="w-name">Name</label>
          <input id="w-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="w-task">Task</label>
          <textarea id="w-task" rows={3} value={task} onChange={(e) => setTask(e.target.value)} required />
        </div>
        <div className="field">
          <label>Capabilities</label>
          <div className="caps">
            {["browser", "sandbox", "desktop"].map((c) => (
              <label key={c}>
                <input type="checkbox" checked={caps.includes(c)} onChange={() => toggle(c)} />
                {c}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="w-budget">Budget</label>
          <input
            id="w-budget"
            type="number"
            min="0.01"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        {error && <p className="muted">{error}</p>}
        <div className="actions" style={{ marginBottom: 0 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Create worker
          </button>
        </div>
      </form>
    </div>
  )
}
