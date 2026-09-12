#!/usr/bin/env node
/**
 * Build and write installable tarballs to dist/npm.
 * Not a publish. Use this to install Meshly on a machine that has never seen the repo.
 *
 *   node scripts/pack-local.mjs
 *   npm install -g ./dist/npm/meshly-0.1.0.tgz ./dist/npm/meshly-cli-0.1.0.tgz ...
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const outDir = path.join(root, "dist", "npm")
const workspaces = [
  "packages/core",
  "packages/solari",
  "packages/sdk",
  "apps/console",
  "packages/cli",
  "packages/meshly",
]

fs.mkdirSync(outDir, { recursive: true })
for (const file of fs.readdirSync(outDir)) {
  if (file.endsWith(".tgz")) fs.unlinkSync(path.join(outDir, file))
}

console.log("▸ build")
execSync("node scripts/build.mjs", { cwd: root, stdio: "inherit" })

const tarballs = []
for (const dir of workspaces) {
  const json = JSON.parse(
    execSync("npm pack --json --pack-destination " + JSON.stringify(outDir), {
      cwd: path.join(root, dir),
      encoding: "utf8",
    }),
  )
  tarballs.push(json[0].filename)
  console.log("  packed", json[0].filename)
}

const install = `npm install -g ${tarballs.map((name) => `./dist/npm/${name}`).join(" ")}`
fs.writeFileSync(path.join(outDir, "INSTALL.txt"), `${install}\n`)
console.log("\nNot published. Install from these tarballs:\n")
console.log(`  ${install}\n`)
console.log("Then:\n  meshly init\n  meshly doctor\n  meshly run\n  meshly dev\n")
