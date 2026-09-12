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
let n = 0
for await (const s of client.sandboxes.listAll()) {
  n += 1
  const id = (s as any).id || (s as any).sandboxId
  const state = (s as any).state || (s as any).status
  const kind = (s as any).kind || (s as any).type
  console.log(JSON.stringify({ kind, state, id: String(id || "").slice(0, 48) }))
  if (id && state !== "destroyed" && state !== "terminated") {
    try {
      await client.sandboxes.kill(id)
      console.log("killed", String(id).slice(0, 24))
    } catch (err) {
      console.log("kill failed", (err as Error).message)
    }
  }
}
console.log("listed", n)
