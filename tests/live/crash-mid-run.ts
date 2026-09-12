/**
 * Live crash test: start `meshly run --keep`, kill the Meshly process after
 * the first committed step, leave Solari sessions alive.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const runsDir = path.join(root, ".meshly", "runs")
const before = new Set(fs.readdirSync(runsDir))

const child = spawn("npx", ["tsx", "packages/cli/src/index.ts", "run", "invoice-reconciler", "--keep"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  windowsHide: true,
})

const deadline = Date.now() + 120_000
let runId = ""

function snapshotNewRun(): { runId: string; status: string; committed: number; envs: number } | null {
  const files = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json") && !before.has(f))
  if (!files.length) {
    const newest = fs
      .readdirSync(runsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f, t: fs.statSync(path.join(runsDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]
    if (!newest) return null
    const j = JSON.parse(fs.readFileSync(path.join(runsDir, newest.f), "utf8"))
    if (j.startedAt && Date.now() - j.startedAt < 120_000 && j.mode === "live") {
      return {
        runId: j.runId,
        status: j.status,
        committed: (j.steps || []).filter((s: { status: string }) => s.status === "committed").length,
        envs: (j.environments || []).length,
      }
    }
    return null
  }
  const j = JSON.parse(fs.readFileSync(path.join(runsDir, files[0]), "utf8"))
  return {
    runId: j.runId,
    status: j.status,
    committed: (j.steps || []).filter((s: { status: string }) => s.status === "committed").length,
    envs: (j.environments || []).length,
  }
}

const timer = setInterval(() => {
  if (Date.now() > deadline) {
    clearInterval(timer)
    child.kill("SIGKILL")
    console.error("CRASH_TEST_TIMEOUT")
    process.exit(1)
  }
  const snap = snapshotNewRun()
  if (!snap) return
  if (snap.status === "RUNNING" && snap.committed >= 1) {
    clearInterval(timer)
    runId = snap.runId
    console.log(`KILL Meshly pid=${child.pid} run=${snap.runId} committed=${snap.committed} envs=${snap.envs}`)
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "inherit", shell: true })
    } else {
      child.kill("SIGKILL")
    }
    setTimeout(() => {
      const j = JSON.parse(fs.readFileSync(path.join(runsDir, `${runId}.json`), "utf8"))
      const committed = (j.steps || []).filter((s: { status: string }) => s.status === "committed").length
      console.log(`AFTER_KILL status=${j.status} committed=${committed} steps=${(j.steps || []).length}`)
      process.exit(0)
    }, 1200)
  }
}, 150)
