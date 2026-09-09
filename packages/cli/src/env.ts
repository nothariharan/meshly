import fs from "node:fs"
import path from "node:path"

/**
 * Load `.env` then `.meshly/.env` into process.env without overwriting
 * values already set in the shell.
 */
export function loadEnv(cwd: string = process.cwd()): void {
  for (const rel of [".env", path.join(".meshly", ".env")]) {
    const file = path.join(cwd, rel)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, "utf8")
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

export function requireSolariKey(): string {
  const key = process.env.SOLARI_API_KEY
  if (!key) {
    throw new Error(
      "No SOLARI_API_KEY. Meshly will not pretend live Solari ran.\n" +
        "  Set it in .env (see .env.example) or pass --simulator for a local kernel demo.",
    )
  }
  return key
}
