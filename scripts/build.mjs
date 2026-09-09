import { copyFileSync, mkdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const root = process.cwd()
const license = path.join(root, "LICENSE")

const packages = [
  "packages/core",
  "packages/solari",
  "packages/sdk",
  "apps/console",
  "packages/cli",
]

function run(label, cmd, args) {
  console.log(`\n▸ ${label}`)
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, cwd: root })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const dir of packages) {
  const abs = path.join(root, dir)
  run(`tsc ${dir}`, "npx", ["tsc", "-p", path.join(dir, "tsconfig.json")])
  if (dir === "apps/console") {
    run("vite console", "npx", ["vite", "build", "--config", path.join(dir, "vite.config.ts")])
  }
  if (existsSync(license)) {
    copyFileSync(license, path.join(abs, "LICENSE"))
  }
}

const meshlyDir = path.join(root, "packages", "meshly")
if (existsSync(meshlyDir) && existsSync(license)) {
  copyFileSync(license, path.join(meshlyDir, "LICENSE"))
}

console.log("\nBuild complete.")
