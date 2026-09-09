#!/usr/bin/env node
/**
 * Clean-room dry test: pack → install in an empty directory → import SDK → run CLI.
 * Does not publish. Does not use the monorepo source tree as cwd for the CLI.
 */
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = process.cwd()
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-pack-"))
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-app-"))

const workspaces = [
  "packages/core",
  "packages/solari",
  "packages/sdk",
  "apps/console",
  "packages/cli",
  "packages/meshly",
]

function sh(cmd, cwd = root, { silent = false } = {}) {
  const out = execSync(cmd, { cwd, encoding: "utf8" })
  if (out && !silent) process.stdout.write(out)
  return out
}

console.log("▸ build")
sh("node scripts/build.mjs")

const tarballs = []
for (const dir of workspaces) {
  const json = JSON.parse(sh("npm pack --json --pack-destination " + JSON.stringify(packDir), path.join(root, dir), { silent: true }))
  tarballs.push(path.join(packDir, json[0].filename))
  console.log("  packed", json[0].filename)
}

console.log("▸ clean install", appDir)
fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "meshly-dry-app", private: true, type: "module" }, null, 2))
sh("npm install " + tarballs.map((t) => JSON.stringify(t)).join(" "), appDir)

console.log("▸ SDK import")
const sdkTest = `
import { Meshly } from "@meshly/sdk"
import { SolariExecutionFabric } from "@meshly/solari"
const mesh = new Meshly({ preferSimulator: true })
const worker = await mesh.workers.spawn({
  name: "invoice-reconciler",
  task: "Reconcile today's payments with the ERP",
  capabilities: ["browser"],
})
const run = await worker.run()
if (run.status !== "COMPLETED") {
  console.error("run failed", run.status, run.error)
  process.exit(1)
}
console.log("SDK_OK", run.runId, run.status)
`
fs.writeFileSync(path.join(appDir, "sdk-smoke.mjs"), sdkTest)
sh("node sdk-smoke.mjs", appDir)

console.log("▸ CLI init + live (simulator)")
const cliBin = process.platform === "win32" ? "meshly.cmd" : "meshly"
const cli = path.join(appDir, "node_modules", ".bin", cliBin)

function runMeshly(args) {
  const result =
    process.platform === "win32"
      ? spawnSync(`"${cli}" ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`, {
          cwd: appDir,
          encoding: "utf8",
          shell: true,
        })
      : spawnSync(cli, args, { cwd: appDir, encoding: "utf8" })
  process.stdout.write(result.stdout || "")
  process.stderr.write(result.stderr || "")
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result
}

runMeshly(["init", "--yes", "--provider", "simulator"])
runMeshly(["live", "--simulator", "--capabilities", "browser"])
const help = runMeshly(["help"])
if (!help.stdout?.includes("meshly init")) {
  console.error("CLI help missing init")
  process.exit(1)
}

console.log("\nDRY TEST PASSED")
console.log("app:", appDir)
