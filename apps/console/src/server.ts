/**
 * @meshly/console — operator console.
 * Serves the React UI and a JSON API over the same `.meshly/` store the CLI uses.
 */
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  artifactPath,
  createStore,
  handleApi,
  loadEnv,
  snapshot,
  subscribe,
  type ConsoleOptions,
} from "./api.js"

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3400

function uiDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const built = path.join(here, "ui")
  if (fs.existsSync(path.join(built, "index.html"))) return built
  const fromSrc = path.join(here, "..", "dist", "ui")
  if (fs.existsSync(path.join(fromSrc, "index.html"))) return fromSrc
  return built
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".html") return "text/html; charset=utf-8"
  if (ext === ".js") return "text/javascript; charset=utf-8"
  if (ext === ".css") return "text/css; charset=utf-8"
  if (ext === ".svg") return "image/svg+xml"
  if (ext === ".woff2") return "font/woff2"
  if (ext === ".woff") return "font/woff"
  if (ext === ".png") return "image/png"
  if (ext === ".json") return "application/json"
  if (ext === ".map") return "application/json"
  return "application/octet-stream"
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      } catch {
        resolve({})
      }
    })
    req.on("error", reject)
  })
}

export function startConsole(portOrOpts: number | ConsoleOptions = DEFAULT_PORT): http.Server {
  const opts: ConsoleOptions = typeof portOrOpts === "number" ? { port: portOrOpts } : portOrOpts || {}
  const port = opts.port ?? DEFAULT_PORT
  const cwd = opts.cwd || process.cwd()
  loadEnv(cwd)
  const store = createStore(cwd)
  const staticDir = uiDir()

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`)
    const method = req.method || "GET"
    const pathname = url.pathname

    if (method === "GET" && pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      res.write(`data: ${JSON.stringify({ type: "state", state: snapshot(store) })}\n\n`)
      const unsub = subscribe((payload) => {
        res.write(`data: ${payload}\n\n`)
      })
      req.on("close", unsub)
      return
    }

    const artifact = pathname.match(/^\/api\/artifacts\/([^/]+)\/([^/]+)$/)
    if (method === "GET" && artifact) {
      const filePath = artifactPath(store, decodeURIComponent(artifact[1]), decodeURIComponent(artifact[2]))
      if (!filePath) {
        res.writeHead(404)
        res.end("Not found")
        return
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) })
      fs.createReadStream(filePath).pipe(res)
      return
    }

    if (pathname.startsWith("/api/")) {
      try {
        const body = method === "POST" || method === "PUT" ? await readBody(req) : {}
        const result = await handleApi(store, method, pathname, body)
        if (result.error && !result.json) {
          sendJson(res, result.status, { error: result.error })
          return
        }
        sendJson(res, result.status, result.json ?? { error: result.error })
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
      }
      return
    }

    const requested = pathname === "/" ? "/index.html" : pathname
    const filePath = path.normalize(path.join(staticDir, requested))
    if (filePath.startsWith(staticDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": contentType(filePath) })
      fs.createReadStream(filePath).pipe(res)
      return
    }

    const index = path.join(staticDir, "index.html")
    if (fs.existsSync(index)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      fs.createReadStream(index).pipe(res)
      return
    }

    res.writeHead(503, { "Content-Type": "text/plain" })
    res.end("Meshly console UI is not built. Run `npm run build` in the repo, then `meshly dev`.")
  })

  server.listen(port, () => {
    if (opts.quiet) return
    const addr = server.address()
    const bound = typeof addr === "object" && addr ? addr.port : port
    console.log(`[Meshly] Operator console  http://localhost:${bound}`)
  })
  return server
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href
  } catch {
    return fileURLToPath(import.meta.url) === path.resolve(entry)
  }
}

if (isDirectRun()) {
  startConsole()
}
