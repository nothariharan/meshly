import { copyFileSync, mkdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const root = process.cwd()
const license = path.join(root, "LICENSE")

const packages = [
  "packages/core",
  "packages/solari",
  "packages/sdk",
  "packages/benchmark",
  "apps/console",
  "packages/cli",
]

function run(label, cmd, args, cwd = root) {
  console.log(`\n▸ ${label}`)
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, cwd })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const dir of packages) {
  const abs = path.join(root, dir)
  run(`tsc ${dir}`, "npx", ["tsc", "-p", "tsconfig.json"], abs)
  if (dir === "apps/console") {
    run("vite console", "npx", ["vite", "build"], abs)
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
