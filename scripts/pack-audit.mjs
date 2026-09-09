#!/usr/bin/env node
/**
 * Fail if an npm tarball contains secrets, cookbook, local runs, or source that
 * should never ship.
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const root = process.cwd()
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "meshly-pack-"))

const packages = [
  "packages/core",
  "packages/solari",
  "packages/sdk",
  "apps/console",
  "packages/cli",
  "packages/meshly",
]

const bannedName = [
  /^\.env$/,
  /\.meshly\//,
  /cookbook\//,
  /exports\//,
  /screenshot\.png$/,
  /\.tgz$/,
  /node_modules\//,
  /^src\//,
  /\.env\.example$/,
]

const bannedContent = [/slr_live_[A-Za-z0-9_]+/]

let failed = false

for (const dir of packages) {
  const abs = path.join(root, dir)
  const out = execSync("npm pack --json --pack-destination " + JSON.stringify(packDir), {
    cwd: abs,
    encoding: "utf8",
  })
  const report = JSON.parse(out)
  const filename = report[0].filename
  const tarball = path.join(packDir, filename)
  const listing = execSync(`tar -tzf "${tarball}"`, { encoding: "utf8" })
  const files = listing.trim().split(/\r?\n/)
  console.log(`\n${dir} → ${filename} (${files.length} files)`)
  for (const file of files) {
    const rel = file.replace(/^package\//, "")
    if (bannedName.some((re) => re.test(rel))) {
      console.error(`  FORBIDDEN path: ${rel}`)
      failed = true
    }
  }
  const inspect = execSync(`tar -xOf "${tarball}" package/package.json`, { encoding: "utf8" })
  for (const re of bannedContent) {
    if (re.test(inspect)) {
      console.error("  FORBIDDEN content in package.json")
      failed = true
    }
  }
}

if (failed) {
  console.error("\nPack audit FAILED")
  process.exit(1)
}

console.log("\nPack audit passed.")
console.log(packDir)
