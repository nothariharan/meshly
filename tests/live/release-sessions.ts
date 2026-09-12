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

const ids = process.argv.slice(2)
if (!ids.length) {
  console.error("usage: npx tsx tests/live/release-sessions.ts <sandboxOrDesktopId>...")
  process.exit(1)
}

async function main() {
  const client = new SolariClient({ apiKey: process.env.SOLARI_API_KEY! })
  for (const id of ids) {
    const kind = id.startsWith("ZGVza3Rvc") ? "desktop" : "sandbox"
    try {
      if (kind === "desktop") {
        const desktop = await client.desktops.connect(id)
        if (desktop.kill) await desktop.kill()
        else if (client.desktops.destroy) await client.desktops.destroy(id)
        console.log("released desktop", id.slice(0, 24))
      } else {
        const sandbox = await client.sandboxes.connect(id)
        await sandbox.kill()
        console.log("released sandbox", id.slice(0, 24))
      }
    } catch (err) {
      console.log("release failed", kind, (err as Error).message)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
