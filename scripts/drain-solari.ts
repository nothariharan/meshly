import { SolariClient } from "@solarisdk/sdk"
import fs from "node:fs"
import path from "node:path"

const envFile = path.join(process.cwd(), ".env")
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith("#") || !t.includes("=")) continue
  const eq = t.indexOf("=")
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (process.env[k] === undefined) process.env[k] = v
}

const client = new SolariClient({ apiKey: process.env.SOLARI_API_KEY! })
const DESKTOP_PREFIX = "ZGVza3Rvc" // base64 "desktop"

let sandboxes = 0
let desktops = 0

console.log("draining solari sessions…")
try {
  for await (const s of client.sandboxes.listAll()) {
    const id = String((s as any).id || (s as any).sandboxId || "")
    const state = String((s as any).state || (s as any).status || "")
    if (!id || ["destroyed", "terminated", "killed"].includes(state)) continue
    if (id.startsWith(DESKTOP_PREFIX)) {
      desktops += 1
      try {
        await client.desktops.destroy(id)
        console.log("  destroyed desktop", id.slice(0, 22))
      } catch (e) {
        console.log("  desktop destroy failed", (e as Error).message)
      }
    } else {
      sandboxes += 1
      try {
        await client.sandboxes.kill(id)
        console.log("  killed sandbox   ", id.slice(0, 22))
      } catch (e) {
        console.log("  sandbox kill failed", (e as Error).message)
      }
    }
  }
} catch (e) {
  console.log("list error", (e as Error).message)
}

console.log(`drained ${sandboxes} sandbox(es), ${desktops} desktop(s)`)
