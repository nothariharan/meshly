import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Browser, Cube, Desktop, Plus, TerminalWindow } from "@phosphor-icons/react"
import {
  compensate,
  createWorker,
  fetchSnapshot,
  initProject,
  resumeRun,
  reverify,
  runFailure,
  runWorker,
  takeover,
  cancelRun,
  type EnvRecord,
  type ProjectRecord,
  type RunRecord,
  type Snapshot,
  type WorkerRow,
} from "./api"

type Route =
  | { name: "home" }
  | { name: "project"; project: string }
  | { name: "workers" }
  | { name: "worker"; id: string }
  | { name: "runs" }
  | { name: "run"; id: string }
  | { name: "environments" }
  | { name: "policies" }

function parseHash(): Route {
  const raw = location.hash.replace(/^#/, "") || "/home"
  const parts = raw.split("/").filter(Boolean)
  if (parts[0] === "projects" && parts[1]) return { name: "project", project: decodeURIComponent(parts[1]) }
  if (parts[0] === "workers" && parts[1]) return { name: "worker", id: decodeURIComponent(parts[1]) }
  if (parts[0] === "workers") return { name: "workers" }
  if (parts[0] === "runs" && parts[1]) return { name: "run", id: decodeURIComponent(parts[1]) }
  if (parts[0] === "runs") return { name: "runs" }
  if (parts[0] === "environments") return { name: "environments" }
  if (parts[0] === "policies") return { name: "policies" }
  return { name: "home" }
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

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}

function pillClass(status: string): string {
  const s = status.toUpperCase()
  if (s === "VERIFIED" || s === "COMPLETED" || s === "VALIDATED") return "ok"
  if (s === "RUNNING" || s === "BUSY" || s === "ACTIVE" || s === "READY" || s === "ALLOCATING" || s === "QUEUED") return "run"
  if (s === "BLOCKED" || s === "PAUSED" || s === "WAITING" || s === "VERIFICATION_FAILED" || s === "UNKNOWN" || s === "VERIFYING") return "warn"
  if (s === "FAILED" || s === "CANCELLED" || s === "TERMINATED" || s === "REJECTED") return "bad"
  return ""
}

function dotClass(status: string): string {
  const p = pillClass(status)
  return p === "ok" ? "ok" : p === "run" ? "run" : p === "warn" ? "warn" : p === "bad" ? "bad" : ""
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
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="glyph">
              <img src="/logo.png" alt="" />
            </span>
            <img className="wordmark" src="/text_logo.png" alt="Meshly" />
          </div>
        </aside>
        <main className="main">
          <div className="page">
            <p className="muted">Loading Meshly state…</p>
          </div>
        </main>
      </div>
    )
  }

  const activeWorkerId = route.name === "worker" ? route.id : undefined

  return (
    <div className="shell">
      <Sidebar
        state={state}
        route={route}
        activeWorkerId={activeWorkerId}
        onCreate={() => setCreating(true)}
        onInit={() => act("init", () => initProject())}
      />
      <main className="main">
        <Topbar route={route} state={state} />
        {!state.initialized ? (
          <div className="page">
            <div className="empty">
              <h2>No Meshly project here</h2>
              <p>Meshly reads local `.meshly/` state. Nothing is seeded.</p>
              <button className="btn primary" onClick={() => act("init", () => initProject())}>
                Create project
              </button>
            </div>
          </div>
        ) : (
          <>
            {route.name === "home" && (
              <HomePage
                state={state}
                onCreate={() => setCreating(true)}
                onRun={(id) => act("run", () => runWorker(id))}
              />
            )}
            {route.name === "project" && (
              <ProjectPage
                state={state}
                name={route.project}
                onCreate={() => setCreating(true)}
                onRun={(id) => act("run", () => runWorker(id))}
              />
            )}
            {route.name === "workers" && (
              <WorkersPage
                state={state}
                onCreate={() => setCreating(true)}
                onRun={(id) => act("run", () => runWorker(id))}
                onFail={() => act("fail", () => runFailure())}
              />
            )}
            {route.name === "worker" && (
              <WorkerDetail
                state={state}
                id={route.id}
                busy={busy}
                onRun={(id) => act("run", () => runWorker(id))}
                onFail={(id) => act("fail", () => runWorker(id, "reality-divergence"))}
                onUnknown={(id) => act("unknown", () => runWorker(id, "ambiguous-timeout"))}
                onSafeRetry={(id) => act("retry", () => runWorker(id, "ambiguous-timeout-absent"))}
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
                onCancel={() => act("cancel", () => cancelRun(route.id))}
                onResume={() => act("resume", () => resumeRun(route.id))}
                onCompensate={() => act("compensate", () => compensate(route.id))}
              />
            )}
            {route.name === "environments" && <EnvironmentsPage state={state} />}
            {route.name === "policies" && <PoliciesPage state={state} />}
          </>
        )}
      </main>

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

function Sidebar({
  state,
  route,
  activeWorkerId,
  onCreate,
  onInit,
}: {
  state: Snapshot
  route: Route
  activeWorkerId?: string
  onCreate: () => void
  onInit: () => void
}) {
  const active = (id: string) => activeWorkerId === id
  const item = (key: string) =>
    (route.name === key) ||
    (key === "workers" && route.name === "worker") ||
    (key === "runs" && route.name === "run")

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <img className="wordmark" src="/text_logo.png" alt="Meshly" />
      </div>
      <div className="sidebar-body">
        <button className={`side-item ${item("home") ? "active" : ""}`} onClick={() => go("/home")}>
          <span className="ico">
            <HomeIcon />
          </span>
          <span className="lbl">Home</span>
        </button>
        <button className={`side-item ${item("runs") ? "active" : ""}`} onClick={() => go("/runs")}>
          <span className="ico">
            <RunsIcon />
          </span>
          <span className="lbl">Runs</span>
          <span className="count">{state.metrics.totalRuns}</span>
        </button>
        <button
          className={`side-item ${item("environments") ? "active" : ""}`}
          onClick={() => go("/environments")}
        >
          <span className="ico">
            <EnvIcon type="browser" />
          </span>
          <span className="lbl">Environments</span>
          <span className="count">{state.environments.length}</span>
        </button>
        <button className={`side-item ${item("policies") ? "active" : ""}`} onClick={() => go("/policies")}>
          <span className="ico">
            <PolicyIcon />
          </span>
          <span className="lbl">Policies</span>
        </button>

        <div className="side-group">
          <span className="t">Projects</span>
          {state.initialized && (
            <button onClick={onCreate} title="New worker">
              <Plus size={13} weight="bold" />
            </button>
          )}
        </div>
        {state.initialized &&
          state.projects.map((project) => (
            <button
              key={project.name}
              className={`side-item ${route.name === "project" && route.project === project.name ? "active" : ""}`}
              onClick={() => go(`/projects/${encodeURIComponent(project.name)}`)}
            >
              <span className="ico">
                <ProjectIcon />
              </span>
              <span className="lbl">{project.name}</span>
              <span className="count">{project.workers.length}</span>
            </button>
          ))}
        {state.initialized && (
          <button className="side-add" onClick={onCreate}>
            <Plus size={13} weight="bold" /> New worker
          </button>
        )}
        {!state.initialized && (
          <button className="side-item" onClick={onInit}>
            <span className="ico">
              <Plus size={13} weight="bold" />
            </span>
            <span className="lbl">Init project</span>
          </button>
        )}
      </div>
      <div className="sidebar-foot">
        <div className="sidebar-conn">
          <span className="dot" />
          <span className="nm">Solari</span>
          <span className="st">{state.provider.mode === "live" ? "Connected" : "Simulator"}</span>
        </div>
        <div className="conn-envs">
          <span className="ce">
            <EnvIcon type="browser" /> browser
          </span>
          <span className="ce">
            <EnvIcon type="sandbox" /> sandbox
          </span>
          <span className="ce">
            <EnvIcon type="desktop" /> desktop
          </span>
        </div>
        <div className="sidebar-budget">
          <div className="top">
            <span>Monthly budget</span>
          </div>
          <div className="bar">
            <div className="fill" style={{ width: `${Math.min(100, (workerSpend(state) / 2) * 100)}%` }} />
          </div>
          <div className="amt">
            <span>${workerSpend(state).toFixed(2)} / $2.00</span>
            <span>{Math.round((workerSpend(state) / 2) * 100)}%</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function workerSpend(state: Snapshot): number {
  return state.workers.reduce((sum, w) => sum + (w.spent || 0), 0)
}

function Topbar({ route, state }: { route: Route; state: Snapshot }) {
  return (
    <header className="topbar">
      <label className="search">
        <SearchIcon />
        <input placeholder="Search workers, runs, projects…" />
        <span className="kbd">Ctrl K</span>
      </label>
      <div className="topbar-right">
        <a href="https://github.com/nothariharan/meshly#readme" target="_blank" rel="noreferrer">
          Docs
        </a>
        <a href="https://github.com/nothariharan/meshly" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <span className={`provider ${state.provider.mode === "live" ? "live" : ""}`}>
          {state.provider.mode === "live" ? "LIVE" : "SIM"}
        </span>
        <span className="avatar" title="Local operator">
          H
        </span>
      </div>
    </header>
  )
}

/* ---------- icons ---------- */

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  )
}
function RunsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function PolicyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    </svg>
  )
}
function ProjectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
function MeshCtaIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ededf0" strokeWidth="1.6">
      <path d="M4 5c5 2 11 2 16 0M4 19c5-2 11-2 16 0M5 4c2 5 2 11 0 16M19 4c-2 5-2 11 0 16" />
    </svg>
  )
}

/* ---------- home ---------- */

function HomePage({
  state,
  onCreate,
  onRun,
}: {
  state: Snapshot
  onCreate: () => void
  onRun: (id: string) => void
}) {
  const [tab, setTab] = useState<"recent" | "active" | "envs" | "insights">("recent")
  const m = state.metrics
  const projectsWithWorkers = state.projects.filter((p) => p.workers.length > 0)
  const recent = state.runs.slice(0, 6)

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-row">
          <div>
            <span className="eyebrow">
              <span className="ico">
                <ProjectIcon />
              </span>
              {state.config?.name || "Workspace"}
            </span>
            <h1>Autonomous workers for real-world operations.</h1>
            <p>Run, monitor, and govern AI workers with real browser, sandbox, and desktop environments.</p>
            <div className="hero-actions">
              <button className="btn primary" onClick={onCreate}>
                <Plus size={14} weight="bold" /> New worker
              </button>
              <button className="btn" onClick={() => go("/runs")}>
                <RunsIcon /> View runs
              </button>
            </div>
          </div>
          <div className="hero-stats">
            <div className="metric">
              <div className="v">{state.workers.length}</div>
              <div className="k">Workers</div>
            </div>
            <div className="metric">
              <div className="v">{m.totalRuns}</div>
              <div className="k">Total runs</div>
            </div>
            <div className="metric">
              <div className="v ok">{m.succeeded}</div>
              <div className="k">Succeeded</div>
            </div>
            <div className="metric">
              <div className="v bad">{m.blocked}</div>
              <div className="k">Blocked</div>
            </div>
            <div className="metric">
              <div className="v warn">{m.unknown}</div>
              <div className="k">Unknown</div>
            </div>
          </div>
        </div>
      </div>

      {projectsWithWorkers.length === 0 ? (
        <div className="empty">
          <h2>No workers yet.</h2>
          <p>Create your first worker. Then run it and watch the execution timeline.</p>
          <button className="btn primary" onClick={onCreate}>
            <Plus size={14} weight="bold" /> New worker
          </button>
        </div>
      ) : (
        <>
          <div className="grid-cards">
            {projectsWithWorkers
              .flatMap((p) => p.workers)
              .slice(0, 4)
              .map((w) => (
                <button key={w.id} className="wcard" onClick={() => go(`/workers/${w.id}`)}>
                  <div className="top">
                    <span className={`dot ${dotClass(w.displayStatus)}`} />
                    <span className="nm">{w.name}</span>
                    <span className="more">⋯</span>
                  </div>
                  <div className="desc">{w.task || "No task description."}</div>
                  <div className="chips">
                    {(w.capabilities || []).map((c) => (
                      <span className="chip" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="foot">
                    <span>{w.runCount || 0} runs</span>
                    <span>{w.lastRunAt ? `Last run ${ago(w.lastRunAt)}` : "Never run"}</span>
                  </div>
                </button>
              ))}
          </div>

          <div className="tabs">
            <button className={`tab ${tab === "recent" ? "active" : ""}`} onClick={() => setTab("recent")}>
              Recent runs
            </button>
            <button className={`tab ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
              Active workers
            </button>
            <button className={`tab ${tab === "envs" ? "active" : ""}`} onClick={() => setTab("envs")}>
              Environments
            </button>
            <button className={`tab ${tab === "insights" ? "active" : ""}`} onClick={() => setTab("insights")}>
              Insights
            </button>
            <span className="spacer" />
            <a className="viewall" href="#/runs">
              View all runs →
            </a>
          </div>

          {tab === "recent" && <RecentRunsTable runs={recent} />}
          {tab === "active" && <ActiveWorkersTable state={state} />}
          {tab === "envs" && <EnvTable environments={state.environments.slice(0, 8)} />}
          {tab === "insights" && <Insights state={state} />}

          <div className="cta">
            <span className="glyph">
              <MeshCtaIcon />
            </span>
            <div className="txt">
              <h3>Need a new workflow?</h3>
              <p>
                Describe what you want to automate and Meshly will help you create a worker with the right permissions
                and environments.
              </p>
            </div>
            <button className="btn primary" onClick={onCreate}>
              Create a worker
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function RecentRunsTable({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) return <p className="muted">No runs yet.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Run</th>
          <th>Worker</th>
          <th>Status</th>
          <th>Environments</th>
          <th>Started</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.runId} className="click" onClick={() => go(`/runs/${r.runId}`)}>
            <td>
              <div className="cell-strong mono">{r.runId}</div>
              <div className="cell-sub">{r.objective}</div>
            </td>
            <td>{r.workerName || r.workerId}</td>
            <td>
              <span className={`pill ${pillClass(r.status)}`}>{decisionLabel(r)}</span>
            </td>
            <td>
              <span className="env-icons">
                {(r.environments || []).map((e) => (
                  <EnvIcon key={e.id} type={e.type} />
                ))}
              </span>
            </td>
            <td className="muted">{ago(r.startedAt)}</td>
            <td className="mono muted">{r.completedAt ? formatDuration(r.completedAt - r.startedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActiveWorkersTable({ state }: { state: Snapshot }) {
  const rows = state.workers.filter((w) => w.displayStatus !== "CREATED")
  if (rows.length === 0) return <p className="muted">No active workers.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Worker</th>
          <th>Project</th>
          <th>Status</th>
          <th>Current run</th>
          <th>Budget</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => {
          const project = state.projects.find((p) => p.workers.some((x) => x.id === w.id))
          return (
            <tr key={w.id} className="click" onClick={() => go(`/workers/${w.id}`)}>
              <td className="cell-strong">{w.name}</td>
              <td className="muted">{project?.name || "—"}</td>
              <td>
                <span className={`pill ${pillClass(w.displayStatus)}`}>{w.displayStatus}</span>
              </td>
              <td className="mono muted">{w.currentRunId || "—"}</td>
              <td className="mono muted">
                ${(w.spent || 0).toFixed(2)} / ${w.budget.toFixed(2)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Insights({ state }: { state: Snapshot }) {
  const m = state.metrics
  const rate = m.totalRuns ? Math.round((m.succeeded / m.totalRuns) * 100) : 0
  return (
    <div className="stats">
      <div className="stat">
        <div className="k">Commit rate</div>
        <div className="v ok">{rate}%</div>
      </div>
      <div className="stat">
        <div className="k">Verified</div>
        <div className="v">{m.succeeded}</div>
      </div>
      <div className="stat">
        <div className="k">Blocked</div>
        <div className="v warn">{m.blocked}</div>
      </div>
      <div className="stat">
        <div className="k">Unknown</div>
        <div className="v warn">{m.unknown}</div>
      </div>
    </div>
  )
}

function ProjectPage({
  state,
  name,
  onCreate,
  onRun,
}: {
  state: Snapshot
  name: string
  onCreate: () => void
  onRun: (id: string) => void
}) {
  const project = state.projects.find((p) => p.name === name)
  if (!project) {
    return (
      <div className="page">
        <p className="muted">Project not found.</p>
      </div>
    )
  }
  const runs = state.runs.filter((r) =>
    project.workers.some((w) => w.id === r.workerId || w.name === r.workerName),
  )
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p className="sub">
            {project.workers.length} workers · {runs.length} runs
          </p>
        </div>
        <button className="btn primary" onClick={onCreate}>
          <Plus size={14} weight="bold" /> New worker
        </button>
      </div>
      <div className="grid-cards">
        {project.workers.map((w) => (
          <div key={w.id} className="wcard" role="button" tabIndex={0} onClick={() => go(`/workers/${w.id}`)}>
            <div className="top">
              <span className={`dot ${dotClass(w.displayStatus)}`} />
              <span className="nm">{w.name}</span>
            </div>
            <div className="desc">{w.task}</div>
            <div className="chips">
              {(w.capabilities || []).map((c) => (
                <span className="chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
            <div className="foot">
              <span>{w.runCount || 0} runs</span>
              <button
                className="btn sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onRun(w.id)
                }}
              >
                Run
              </button>
            </div>
          </div>
        ))}
      </div>
      <h2 className="section">Recent runs</h2>
      <RecentRunsTable runs={runs.slice(0, 8)} />
    </div>
  )
}

function decisionLabel(r: RunRecord): string {
  if (r.status === "BLOCKED" || r.status === "VERIFICATION_FAILED") return "BLOCKED"
  if (r.status === "UNKNOWN" || r.status === "VERIFYING") return "UNKNOWN"
  if (r.status === "VERIFIED") return "VERIFIED"
  if (r.status === "COMPLETED") return "COMMITTED"
  return r.status
}

function WorkersPage({
  state,
  onCreate,
  onRun,
  onFail,
}: {
  state: Snapshot
  onCreate: () => void
  onRun: (id: string) => void
  onFail: () => void
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workers</h1>
          <p className="sub">Workers are logical entities. Environments are leased underneath them.</p>
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
          <p>Create your first worker. Then run it and open the execution timeline.</p>
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
              <th>Verification</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.workers.map((w) => (
              <tr key={w.id} className="click" onClick={() => go(`/workers/${w.id}`)}>
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
                <td>
                  <span
                    className={`pill ${
                      w.lastVerification?.worldStateMatched === false
                        ? "warn"
                        : w.lastVerification?.worldStateMatched
                          ? "ok"
                          : ""
                    }`}
                  >
                    {w.lastVerification?.worldStateMatched === false
                      ? "MISMATCH"
                      : w.lastVerification?.worldStateMatched
                        ? "MATCHED"
                        : "-"}
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
    </div>
  )
}

function WorkerDetail({
  state,
  id,
  busy,
  onRun,
  onFail,
  onUnknown,
  onSafeRetry,
}: {
  state: Snapshot
  id: string
  busy: string | null
  onRun: (id: string) => void
  onFail: (id: string) => void
  onUnknown: (id: string) => void
  onSafeRetry: (id: string) => void
}) {
  const worker = state.workers.find((w) => w.id === id || w.name === id)
  const runs = state.runs.filter((r) => r.workerId === worker?.id || r.workerName === worker?.name)
  if (!worker) {
    return (
      <div className="page">
        <p className="muted">Worker not found.</p>
      </div>
    )
  }
  const project = state.projects.find((p) => p.workers.some((x) => x.id === worker.id))
  const memory = worker.memory || []
  const tiers = {
    hot: memory.filter((m) => m.tier === "hot").length,
    warm: memory.filter((m) => m.tier === "warm").length,
    cold: memory.filter((m) => m.tier === "cold").length,
  }
  const current = runs[0]
  const flags = [
    { label: "Run worker", handler: () => onRun(worker.id), primary: true },
    { label: "Run with mismatch", handler: () => onFail(worker.id) },
    { label: "Run UNKNOWN", handler: () => onUnknown(worker.id) },
    { label: "Run safe-retry", handler: () => onSafeRetry(worker.id) },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            {project ? project.name : "Worker"}
          </div>
          <h1>{worker.name}</h1>
          <p className="sub">{worker.task}</p>
        </div>
        <span className={`pill ${pillClass(worker.displayStatus)}`}>{worker.displayStatus}</span>
      </div>

      <div className="actions">
        {flags.map((f) => (
          <button
            key={f.label}
            className={`btn ${f.primary ? "primary" : ""}`}
            disabled={busy === "run" || busy === "fail" || busy === "unknown" || busy === "retry"}
            onClick={f.handler}
          >
            {f.label}
          </button>
        ))}
      </div>

      {current && (
        <>
          <h2 className="section">Environment</h2>
          <EnvironmentStrip run={current} />
        </>
      )}

      <h2 className="section">Worker</h2>
      <dl className="kv">
        <dt>Kind</dt>
        <dd className="mono">{worker.kind || "-"}</dd>
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
        <dt>Limits</dt>
        <dd className="muted">
          {formatDuration(current ? (current.completedAt || Date.now()) - current.startedAt : 0)} ·{" "}
          {current?.environments.length || 0}/{worker.limits?.maxEnvironments || 3} environments
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
            {(worker.authority?.tools || []).slice(0, 12).map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        </dd>
        <dt>Memory</dt>
        <dd className="muted">
          hot {tiers.hot} / warm {tiers.warm} / cold {tiers.cold}
        </dd>
      </dl>

      <h2 className="section">Runs</h2>
      {runs.length === 0 ? (
        <p className="muted">No runs yet. Run the worker to produce one.</p>
      ) : (
        <ul className="run-list">
          {runs.map((r) => (
            <li key={r.runId} className="click" onClick={() => go(`/runs/${r.runId}`)}>
              <span className={`glyph ${pillClass(r.status)}`}>{runGlyph(r.status)}</span>
              <span className="rid">{r.runId}</span>
              <span className={`pill ${pillClass(r.status)}`}>{r.status}</span>
              <span className="when">{ago(r.startedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EnvironmentStrip({ run }: { run: RunRecord }) {
  const types = ["browser", "sandbox", "desktop"]
  const relevant = types
    .map((t) => run.environments.find((e) => e.type === t))
    .filter((e): e is EnvRecord => Boolean(e))
  if (relevant.length === 0) return <p className="muted">No environments recorded on this run.</p>
  return (
    <div className="environments">
      {relevant.map((e) => {
        const step = run.steps.find((s: any) => s.observation?.environmentId === e.id)
        const status = step?.status || e.status
        return (
          <div className={`env-card ${(e.status || "").toLowerCase()}`} key={e.id}>
            <div className="top">
              <EnvIcon type={e.type} />
              <span className="name">{e.type}</span>
              <span className={`pill ${pillClass(status)}`}>{String(status).toUpperCase()}</span>
            </div>
            <div className="meta">{e.sessionId || e.fabricId || e.id}</div>
          </div>
        )
      })}
    </div>
  )
}

function runGlyph(status: string): string {
  const p = pillClass(status)
  if (p === "ok") return "✓"
  if (p === "bad") return "✕"
  if (p === "warn") return "⚠"
  if (p === "run") return "●"
  return "○"
}

function RunsPage({ state }: { state: Snapshot }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Runs</h1>
          <p className="sub">One run is one attempt. An agent claim is not equivalent to reality.</p>
        </div>
      </div>
      {state.runs.length === 0 ? (
        <div className="empty">
          <h2>No runs yet.</h2>
          <p>Create a worker and run it. Completed live Solari runs appear here once persisted.</p>
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
                <tr key={r.runId} className="click" onClick={() => go(`/runs/${r.runId}`)}>
                  <td className="mono">{r.runId}</td>
                  <td>{r.workerName || r.workerId}</td>
                  <td>
                    <span className={`pill ${pillClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="muted">{r.mode === "live" ? "LIVE · SOLARI" : "SIMULATOR"}</td>
                  <td>
                    <span className={`pill ${mismatch ? "warn" : r.status === "COMPLETED" || r.status === "VERIFIED" ? "ok" : ""}`}>
                      {mismatch ? "MISMATCH" : r.status === "COMPLETED" || r.status === "VERIFIED" ? "MATCHED" : "-"}
                    </span>
                  </td>
                  <td className="muted">{ago(r.startedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RunPage({
  state,
  id,
  busy,
  onReverify,
  onTakeover,
  onCancel,
  onResume,
  onCompensate,
}: {
  state: Snapshot
  id: string
  busy: string | null
  onReverify: () => void
  onTakeover: () => void
  onCancel: () => void
  onResume: () => void
  onCompensate: () => void
}) {
  const run = state.runs.find((r) => r.runId === id || r.runId.startsWith(id))
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  if (!run) {
    return (
      <div className="page">
        <p className="muted">Run not found in `.meshly/runs`.</p>
      </div>
    )
  }
  const step = run.steps[run.steps.length - 1] || {}
  const worker = state.workers.find((w) => w.id === run.workerId || w.name === run.workerName)
  const browserStep = run.steps.find((s: any) => s.observation?.type === "browser" || s.observation?.payment_status) || {}
  const desktopStep = [...run.steps].reverse().find((s: any) => s.observation?.type === "desktop") || step

  const sawUnknown = run.steps.some((s: any) => s.actionOutcome === "UNKNOWN")
  const unknown = run.status === "UNKNOWN" || run.status === "VERIFYING"
  const verified = run.status === "VERIFIED"
  const diverged =
    !unknown &&
    !verified &&
    (run.status === "BLOCKED" ||
      run.status === "VERIFICATION_FAILED" ||
      run.steps.some((s: any) => s.worldStateMatched === false && s.actionOutcome !== "UNKNOWN"))

  const agentClaimText =
    browserStep.observation?.payment_status === "PAID"
      ? "Invoice 4421 is PAID"
      : step.agentClaim || "PENDING"
  const worldText = desktopStep.observation?.erp_status
    ? `ERP = ${desktopStep.observation.erp_status}`
    : desktopStep.observation?.content
      ? String(desktopStep.observation.content).trim()
      : step.worldStateMatched === false
        ? "MISMATCH"
        : step.worldStateMatched
          ? "MATCHED"
          : "PENDING"

  const verdict = verified
    ? { cls: "ok", title: "VERIFIED", body: "Independent world state confirmed the result. Commit allowed." }
    : diverged
      ? { cls: "bad", title: "COMMIT BLOCKED", body: "An agent claim is not equivalent to reality. Commit was denied." }
      : unknown
        ? { cls: "warn", title: "UNKNOWN", body: "Side effect may have occurred. Retry blocked pending verification." }
        : run.status === "COMPLETED"
          ? { cls: "ok", title: "COMMITTED", body: "Verification passed. Commit allowed." }
          : run.status === "FAILED"
            ? { cls: "bad", title: "FAILED", body: run.error || "The run did not complete." }
            : { cls: "", title: run.status, body: "The run is still in progress." }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="mono" style={{ fontSize: 18 }}>
            {run.runId}
          </h1>
          <p className="sub">
            {run.workerName || run.workerId} · {run.objective}
          </p>
        </div>
        <span className={`pill ${pillClass(run.status)}`}>{run.status}</span>
      </div>

      <p className="crumb">
        <a href={`#/workers/${run.workerId}`}>Worker</a>
        <span>→</span>
        <span>Run</span>
        <span>→</span>
        <a href="#/environments">Environment</a>
        <span>→</span>
        <button className="linkish" onClick={() => setEvidenceOpen(true)}>
          Evidence
        </button>
      </p>

      <div className="meters">
        <span>
          ${(worker?.spent || 0).toFixed(2)} / ${(worker?.limits?.maxSpend || worker?.budget || 2).toFixed(2)}
        </span>
        <span>
          {formatDuration((run.completedAt || Date.now()) - run.startedAt)} /{" "}
          {Math.round((worker?.limits?.maxDurationMs || 30 * 60_000) / 60_000)}m
        </span>
        <span>
          {run.environments.length} / {worker?.limits?.maxEnvironments || 3} environments
        </span>
        <span className="muted">{run.mode === "live" ? "LIVE · SOLARI" : "SIMULATOR"}</span>
      </div>

      <h2 className="section">Execution</h2>
      <ExecutionTimeline run={run} />

      <div className="claim-grid">
        <div className={`claim ${step.agentClaim === "SUCCESS" || browserStep.observation?.payment_status === "PAID" ? "ok" : step.agentClaim === "FAILURE" || step.agentClaim === "UNKNOWN" ? "bad" : ""}`}>
          <div className="n">Agent claim</div>
          <div className="t">{agentClaimText}</div>
        </div>
        <div className={`claim ${step.toolExecution === "SUCCESS" ? "ok" : step.toolExecution === "FAILURE" || step.toolExecution === "UNKNOWN" ? "bad" : ""}`}>
          <div className="n">Tool observation</div>
          <div className="t">{step.toolExecution || (browserStep.observation?.httpStatus ? `HTTP ${browserStep.observation.httpStatus}` : "PENDING")}</div>
        </div>
        <div className={`claim ${step.worldStateMatched === false ? "bad" : step.worldStateMatched ? "ok" : unknown ? "warn" : ""}`}>
          <div className="n">World state</div>
          <div className="t">{worldText}</div>
        </div>
      </div>

      <div className={`verdict ${verdict.cls}`}>
        <h2>{verdict.title}</h2>
        <p>{verdict.body}</p>
      </div>

      {sawUnknown && (
        <>
          <h2 className="section">Unknown sequence</h2>
          <UnknownReadout run={run} />
        </>
      )}

      <h2 className="section">Environments</h2>
      <EnvTable environments={run.environments} />

      <h2 className="section">Event stream</h2>
      <ol className="events">
        {[...(run.events || [])]
          .sort((a, b) => a.sequence - b.sequence || a.timestamp - b.timestamp)
          .map((ev) => (
            <li key={ev.id}>
              <time>{clock(ev.timestamp)}</time>
              <div>
                <div className="et">{ev.type}</div>
                {ev.data && Object.keys(ev.data).length > 0 && (
                  <div className="evd">{compactData(ev.data)}</div>
                )}
              </div>
            </li>
          ))}
      </ol>
      {(run.events || []).length === 0 && (
        <p className="muted">No persisted events on this run. Newer runs record the full sequence.</p>
      )}

      <h2 className="section">Tamper-evident evidence</h2>
      <p className="muted mono" style={{ wordBreak: "break-all" }}>
        SHA-256 {run.sha256Digest || run.evidence?.tamperEvidentDigestSha256 || "not exported"}
      </p>
      <p className="faint" style={{ marginTop: 4, maxWidth: "62ch" }}>
        The digest establishes integrity of the exported evidence bundle. It does not prove the underlying observation is true.
      </p>

      <div className="actions">
        {run.environments.find((e) => e.type === "browser" && (e.replayUrl || e.streamUrl)) && (
          <a
            className="btn"
            href={run.environments.find((e) => e.type === "browser")?.replayUrl || "#"}
            target="_blank"
            rel="noreferrer"
          >
            Open browser
          </a>
        )}
        {run.environments.find((e) => e.type === "desktop" && e.streamUrl) && (
          <a
            className="btn"
            href={run.environments.find((e) => e.type === "desktop")?.streamUrl || "#"}
            target="_blank"
            rel="noreferrer"
          >
            Open desktop
          </a>
        )}
        <button className="btn" disabled={busy === "reverify"} onClick={onReverify}>
          {unknown ? "Verify" : "Retry verification"}
        </button>
        <button className="btn" disabled={busy === "takeover"} onClick={onTakeover}>
          Take over
        </button>
        {unknown || run.status === "PAUSED" ? (
          <button className="btn" disabled={busy === "resume"} onClick={onResume}>
            Resume
          </button>
        ) : null}
        <button className="btn" disabled={busy === "cancel"} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" disabled={busy === "compensate"} onClick={onCompensate}>
          Compensate
        </button>
        <button className="btn" onClick={() => setEvidenceOpen(!evidenceOpen)}>
          Inspect evidence
        </button>
      </div>

      {run.takeover && (
        <p className="muted">
          Takeover {run.takeover.sessionId}
          {run.takeover.streamUrl ? ` · ${run.takeover.streamUrl}` : ""}
        </p>
      )}
      {run.compensated && <p className="muted">SAGA compensation recorded. Commit remains abandoned.</p>}

      {evidenceOpen && (
        <pre className="json">{JSON.stringify(run.evidence || { sha256Digest: run.sha256Digest, steps: run.steps }, null, 2)}</pre>
      )}
    </div>
  )
}

const STAGES = [
  { key: "intent", label: "Intent" },
  { key: "authorization", label: "Authorization" },
  { key: "action", label: "Action" },
  { key: "observation", label: "Observation" },
  { key: "verification", label: "Verification" },
  { key: "commit", label: "Commit" },
] as const

function ExecutionTimeline({ run }: { run: RunRecord }) {
  const steps = run.steps || []
  const last = steps[steps.length - 1] || {}
  const sawUnknown = steps.some((s: any) => s.actionOutcome === "UNKNOWN")
  const verified = run.status === "VERIFIED" || run.status === "COMPLETED"
  const blocked = run.status === "BLOCKED" || run.status === "VERIFICATION_FAILED"

  const state: Record<string, { cls: string; detail: string }> = {
    intent: {
      cls: last.intent ? "ok" : "",
      detail: steps
        .map((s: any, i: number) => `${i + 1}. ${s.intent}`)
        .join("\n") || "No intent recorded",
    },
    authorization: {
      cls: steps.some((s: any) => s.status === "rejected") ? "bad" : steps.length ? "ok" : "",
      detail: steps
        .map((s: any) => `${s.action?.tool || "step"} · ${s.status}`)
        .join("\n"),
    },
    action: {
      cls: steps.some((s: any) => s.status === "rejected") ? "bad" : "ok",
      detail: steps.map((s: any) => s.observation?.type || s.action?.tool?.split("_")[0]).filter(Boolean).join(" → ") || "-",
    },
    observation: {
      cls: steps.every((s: any) => s.observation) ? "ok" : "",
      detail: steps
        .map((s: any) => {
          const o = s.observation || {}
          const bits = [o.type, o.payment_status && `payment=${o.payment_status}`, o.ledger && `ledger=${o.ledger}`, o.erp_status && `erp=${o.erp_status}`, o.exitCode !== undefined && `exit=${o.exitCode}`]
            .filter(Boolean)
            .join(" ")
          return bits
        })
        .filter(Boolean)
        .join("\n") || "No observation",
    },
    verification: {
      cls: sawUnknown ? "warn" : blocked ? "bad" : verified ? "ok" : "",
      detail: sawUnknown
        ? "UNKNOWN — independent verification ran against the world"
        : blocked
          ? last.error || "World state did not match the contract"
          : verified
            ? "World state matched the contract"
            : "Pending",
    },
    commit: {
      cls: verified || run.status === "COMPLETED" ? "ok" : blocked ? "bad" : sawUnknown ? "warn" : "",
      detail: verified
        ? "Committed"
        : run.status === "COMPLETED"
          ? "Committed"
          : blocked
            ? `BLOCKED\n${run.error || ""}`
            : sawUnknown
              ? "Blocked pending verification"
              : run.status,
    },
  }

  return (
    <ul className="timeline">
      {STAGES.map((stage) => {
        const s = state[stage.key]
        return (
          <li key={stage.key}>
            <span className={`mark ${s.cls}`}>{s.cls === "ok" ? "✓" : s.cls === "bad" ? "✕" : s.cls === "warn" ? "⚠" : "•"}</span>
            <span className="what">
              {stage.label}
              <span className="detail">{s.detail}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function UnknownReadout({ run }: { run: RunRecord }) {
  const worldObserved = (run.events || []).some((e) => e.type === "observation.recorded")
  const confirmed = run.status === "VERIFIED"
  const rows = [
    { label: "Action dispatched", ok: true },
    { label: "Result UNKNOWN", ok: true },
    { label: "Retry blocked", ok: true },
    { label: "Independent verification", ok: true },
    { label: "World state observed", ok: worldObserved },
    { label: confirmed ? "VERIFIED" : "Safe to retry (not automatic)", ok: true, warn: !confirmed },
  ]
  return (
    <ul className="timeline">
      {rows.map((r, i) => (
        <li key={i}>
          <span className={`mark ${r.warn ? "warn" : r.ok ? "ok" : ""}`}>{r.ok ? "✓" : "•"}</span>
          <span className="what">{r.label}</span>
        </li>
      ))}
    </ul>
  )
}

function compactData(data: Record<string, any>): string {
  const pick = ["tool", "type", "outcome", "reason", "retry", "safeToRetry", "erp_status", "payment_status", "error", "fabricId", "intent"]
  const parts: string[] = []
  for (const key of pick) {
    if (data[key] !== undefined && data[key] !== null) {
      const v = typeof data[key] === "string" && data[key].length > 40 ? `${String(data[key]).slice(0, 40)}…` : data[key]
      parts.push(`${key}=${v}`)
    }
  }
  return parts.join("  ")
}

function EnvironmentsPage({ state }: { state: Snapshot }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Environments</h1>
          <p className="sub">Worker → run → browser / sandbox / desktop. A warm-pool entry is a Meshly lease, not a Solari session id.</p>
        </div>
      </div>
      {state.environments.length === 0 && state.workers.length === 0 ? (
        <div className="empty">
          <h2>No environments yet.</h2>
          <p>A run leases execution resources. They appear here with provider, lease, and session id.</p>
        </div>
      ) : (
        <>
          {state.projects.map((project) => (
            <div key={project.name} style={{ marginBottom: 22 }}>
              <h2 className="section" style={{ marginTop: 0 }}>
                {project.name}
              </h2>
              {project.workers.map((w) => {
                const runs = state.runs.filter((r) => r.workerId === w.id || r.workerName === w.name)
                return (
                  <div className="env-card" key={w.id} style={{ marginBottom: 8 }}>
                    <div className="top">
                      <span className="name">
                        {w.name} <span className="faint mono" style={{ fontWeight: 400 }}>· {w.kind || "worker"}</span>
                      </span>
                      <span className={`pill ${pillClass(w.displayStatus)}`}>{w.displayStatus}</span>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {runs.length === 0 && <span className="faint">No runs</span>}
                      {runs.map((r) => (
                        <div key={r.runId} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <a className="mono" href={`#/runs/${r.runId}`}>
                            {r.runId}
                          </a>
                          <span className={`pill ${pillClass(r.status)}`}>{r.status}</span>
                          {(r.environments || []).map((e) => (
                            <span className="chip" key={e.id}>
                              <EnvIcon type={e.type} /> {e.type} · {e.status}
                              {e.sessionId ? ` · ${e.sessionId.slice(0, 10)}` : ""}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <h2 className="section">Lifecycle</h2>
          <p className="muted">Warm → Allocated → Running → Paused → Warm pool → Reused</p>
          <EnvTable environments={state.environments} />
        </>
      )}
    </div>
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
          <tr key={e.id} className={e.runId ? "click" : ""} onClick={() => e.runId && go(`/runs/${e.runId}`)}>
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
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Policies</h1>
          <p className="sub">Authority envelopes bound to workers. Child privileges cannot expand a parent.</p>
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
              <tr key={p.workerId} className="click" onClick={() => go(`/workers/${p.workerId}`)}>
                <td>{p.workerName}</td>
                <td className="mono muted">{p.authority.tools.join(", ") || "-"}</td>
                <td className="mono muted">{(p.authority.domains || []).join(", ") || "-"}</td>
                <td className="mono">${Number(p.authority.maxSpend ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CreateWorker({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("")
  const [task, setTask] = useState("")
  const [caps, setCaps] = useState<string[]>(["browser"])
  const [template, setTemplate] = useState("")
  const [budget, setBudget] = useState("2.00")
  const [error, setError] = useState<string | null>(null)

  const templates: Record<string, { name: string; task: string; caps: string[]; kind: string }> = {
    reconciliation: {
      name: "invoice-reconciler",
      task: "Reconcile today's payment records with the ERP",
      caps: ["browser", "sandbox", "desktop"],
      kind: "reconciliation",
    },
    research: {
      name: "research",
      task: "Collect information, analyze it, and produce a verified report",
      caps: ["browser", "sandbox"],
      kind: "research",
    },
    coding: {
      name: "coding",
      task: "Modify a repository, run tests, and browser-QA the artifact",
      caps: ["sandbox", "browser"],
      kind: "coding",
    },
    operations: {
      name: "operations",
      task: "Look up system status, process the incident, and file a desktop ops ticket",
      caps: ["browser", "sandbox", "desktop"],
      kind: "operations",
    },
  }

  function pickTemplate(t: string) {
    setTemplate(t)
    const def = templates[t]
    if (!def) return
    setName(def.name)
    setTask(def.task)
    setCaps(def.caps)
  }

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
        kind: template || undefined,
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
          <label htmlFor="w-template">Template</label>
          <select id="w-template" value={template} onChange={(e) => pickTemplate(e.target.value)}>
            <option value="">Custom</option>
            <option value="reconciliation">Reconciliation (Finance Ops)</option>
            <option value="research">Research</option>
            <option value="coding">Coding (Engineering)</option>
            <option value="operations">Operations</option>
          </select>
        </div>
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
