import { copyFileSync, cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
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
if (existsSync(meshlyDir)) {
  if (existsSync(license)) {
    copyFileSync(license, path.join(meshlyDir, "LICENSE"))
  }
  const binFile = path.join(meshlyDir, "bin/meshly.js")
  run(
    "bundle @nothariharan/meshly",
    "npx",
    [
      "esbuild",
      path.join(root, "packages/cli/src/index.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${binFile}`,
      "--external:@solarisdk/browser",
      "--external:@solarisdk/sdk",
    ],
    root,
  )
  if (existsSync(binFile)) {
    const content = readFileSync(binFile, "utf8")
    if (!content.startsWith("#!/usr/bin/env node")) {
      writeFileSync(binFile, `#!/usr/bin/env node\n${content}`)
    }
  }
  const uiSrc = path.join(root, "apps/console/dist/ui")
  const uiDest = path.join(meshlyDir, "ui")
  if (existsSync(uiSrc)) {
    cpSync(uiSrc, uiDest, { recursive: true })
  }
}

console.log("\nBuild complete.")
