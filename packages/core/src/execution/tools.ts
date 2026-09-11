/**
 * Meshly tool surface. Agents request actions. They never receive a Solari client.
 *
 * Agent → ActionRequest → Policy → dispatchTool → ExecutionFabric / Solari
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ActionOutcome, EnvironmentType, ExecutionEnvironment } from "../types.js"
import { AmbiguousTimeoutError, withAmbiguousTimeout } from "./timeout.js"
import {
  CODING_APP_JS,
  extractById,
  extractTitle,
  parsePaymentsHtml,
  PAYMENTS_HTML,
  RESEARCH_HTML,
  STATUS_HTML,
} from "./world.js"

export interface ToolSpec {
  name: string
  capability: EnvironmentType | "none"
}

export const TOOL_CATALOG: Record<string, ToolSpec> = {
  browser_navigate: { name: "browser_navigate", capability: "browser" },
  browser_extract: { name: "browser_extract", capability: "browser" },
  browser_click: { name: "browser_click", capability: "browser" },
  sandbox_exec: { name: "sandbox_exec", capability: "sandbox" },
  sandbox_write: { name: "sandbox_write", capability: "sandbox" },
  sandbox_read: { name: "sandbox_read", capability: "sandbox" },
  desktop_open: { name: "desktop_open", capability: "desktop" },
  desktop_type: { name: "desktop_type", capability: "desktop" },
  desktop_click: { name: "desktop_click", capability: "desktop" },
  desktop_write: { name: "desktop_write", capability: "desktop" },
  desktop_read: { name: "desktop_read", capability: "desktop" },
  desktop_screenshot: { name: "desktop_screenshot", capability: "desktop" },
  desktop_health: { name: "desktop_health", capability: "desktop" },
  mcp_call_tool: { name: "mcp_call_tool", capability: "none" },
  complete: { name: "complete", capability: "none" },
}

export interface ToolDispatchRequest {
  tool: string
  args: Record<string, any>
  env?: ExecutionEnvironment
  artifactDir?: string
  runId?: string
  timeoutMs?: number
}

export interface ToolDispatchResult {
  outcome: ActionOutcome
  claimedSuccess: boolean
  observation: Record<string, any>
}

export function environmentForTool(tool: string): EnvironmentType | undefined {
  const cap = TOOL_CATALOG[tool]?.capability
  if (!cap || cap === "none") return undefined
  return cap
}

export async function dispatchTool(req: ToolDispatchRequest): Promise<ToolDispatchResult> {
  const spec = TOOL_CATALOG[req.tool]
  if (!spec) {
    return {
      outcome: "FAILURE",
      claimedSuccess: false,
      observation: { error: `Unknown tool '${req.tool}'` },
    }
  }

  if (spec.capability !== "none" && !req.env?.handle) {
    throw new Error(`No environment handle for tool '${req.tool}'`)
  }

  if (req.args?.forceUnknown || req.args?.simulateTimeout) {
    return unknownResult(req, "Forced ambiguous timeout: no retry until independent verification")
  }

  try {
    const work = executeTool(spec.name, req)
    const observation = await withAmbiguousTimeout(work, req.timeoutMs ?? req.args?.timeoutMs)
    const claimedSuccess = observation.claimedSuccess !== false
    return {
      outcome: claimedSuccess ? "SUCCESS" : "FAILURE",
      claimedSuccess,
      observation,
    }
  } catch (err) {
    if (err instanceof AmbiguousTimeoutError) {
      return unknownResult(req, err.message)
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      outcome: "FAILURE",
      claimedSuccess: false,
      observation: { error: message, tool: req.tool },
    }
  }
}

function unknownResult(req: ToolDispatchRequest, reason: string): ToolDispatchResult {
  return {
    outcome: "UNKNOWN",
    claimedSuccess: false,
    observation: {
      result: "UNKNOWN",
      tool: req.tool,
      reason,
      retry: false,
      environmentId: req.env?.id,
      fabricId: req.env?.fabricId,
      type: req.env?.type,
    },
  }
}

async function executeTool(tool: string, req: ToolDispatchRequest): Promise<Record<string, any>> {
  if (tool === "complete" || tool === "mcp_call_tool") {
    return { claimedSuccess: true, tool, args: req.args }
  }

  const handle = req.env!.handle
  const base = {
    environmentId: req.env!.id,
    fabricId: req.env!.fabricId,
    type: req.env!.type,
    leaseId: req.env!.currentLeaseId,
    streamUrl: req.env!.streamUrl,
    replayUrl: req.env!.replayUrl,
    browser_replay_url: req.env!.replayUrl,
    desktop_stream_url: req.env!.streamUrl,
  }

  if (tool.startsWith("browser_")) return { ...base, ...(await browserAction(tool, handle, req)) }
  if (tool.startsWith("sandbox_")) return { ...base, ...(await sandboxAction(tool, handle, req.args)) }
  return { ...base, ...(await desktopAction(tool, handle, req)) }
}

async function browserAction(tool: string, handle: any, req: ToolDispatchRequest): Promise<Record<string, any>> {
  const page = handle.__meshlyPage || (await handle.newPage())
  handle.__meshlyPage = page
  const args = req.args || {}

  if (tool === "browser_click" && page.click && args.selector) {
    await page.click(args.selector)
  }

  if (args.html) {
    if (page.setContent) await page.setContent(args.html)
  } else if (args.fixture === "payments") {
    if (page.setContent) await page.setContent(PAYMENTS_HTML)
  } else if (args.fixture === "research") {
    if (page.setContent) await page.setContent(RESEARCH_HTML)
  } else if (args.fixture === "status") {
    if (page.setContent) await page.setContent(STATUS_HTML)
  } else if (args.url && page.goto) {
    await page.goto(args.url)
  }

  const html = page.content ? await page.content() : PAYMENTS_HTML
  const title = page.title ? await page.title() : extractTitle(html)
  const url = typeof page.url === "function" ? page.url() : args.url || "about:blank"
  const payments = parsePaymentsHtml(html)

  const observation: Record<string, any> = {
    claimedSuccess: true,
    title,
    url,
    html,
    httpStatus: 200,
    sessionId: handle.id,
    payment_status: payments.payment_status,
    invoiceId: payments.invoiceId,
    amount: payments.amount,
    research_title: extractTitle(html),
    findings: extractById(html, "findings") ? "present" : extractTitle(html),
    service: extractById(html, "service"),
    health: extractById(html, "health"),
  }

  if (page.screenshot) {
    const png = await page.screenshot()
    observation.screenshotPath = writeArtifact(req.artifactDir, req.runId, "browser.png", png)
  }
  return observation
}

async function sandboxAction(tool: string, handle: any, args: Record<string, any>): Promise<Record<string, any>> {
  if (handle.connect) await handle.connect()

  if (Array.isArray(args.prepare)) {
    for (const file of args.prepare) {
      if (file?.path) await writeFile(handle, file.path, file.content ?? "")
    }
  }

  if (tool === "sandbox_write") {
    await writeFile(handle, args.path, args.content)
    return { claimedSuccess: true, path: args.path, written: true }
  }

  if (tool === "sandbox_read") {
    const content = await readFile(handle, args.path)
    return { claimedSuccess: true, path: args.path, content, stdout: content }
  }

  const cmd = args.command || args.cmd || "python3"
  const cmdArgs: string[] = Array.isArray(args.args) ? args.args : args.code ? ["-c", args.code] : []
  const out = await handle.commands.run(cmd, { args: cmdArgs, cwd: args.cwd })
  const stdout = String(out.stdout || "").trim()
  let parsed: any
  try {
    parsed = JSON.parse(stdout)
  } catch {
    parsed = undefined
  }

  return {
    claimedSuccess: out.exitCode === 0,
    exitCode: out.exitCode,
    stdout,
    stderr: String(out.stderr || "").trim(),
    sandboxId: handle.sandboxId || handle.id,
    payment: parsed?.payment,
    ledger: parsed?.ledger,
    match: parsed?.match,
    invoice: parsed?.invoice,
    tests: stdout.includes("PASS") ? "PASS" : stdout.includes("FAIL") ? "FAIL" : undefined,
    ...parsed,
  }
}

async function desktopAction(tool: string, handle: any, req: ToolDispatchRequest): Promise<Record<string, any>> {
  const args = req.args || {}
  if (args.delayMs) await sleep(Number(args.delayMs))
  if (handle.connect) await handle.connect()

  if (handle.health) {
    for (let i = 0; i < 15; i++) {
      const health = await handle.health()
      if (health?.ready) break
      await sleep(400)
    }
  }

  if (tool === "desktop_open" && handle.open && args.app) {
    await handle.open(args.app)
  }
  if (tool === "desktop_click" && handle.mouse?.click) {
    await handle.mouse.click(args.x ?? 100, args.y ?? 100)
  }
  if ((tool === "desktop_type" || args.text) && handle.keyboard?.type && args.text) {
    await handle.keyboard.type(args.text)
  }
  if (tool === "desktop_write") {
    const filePath = args.path || "/tmp/erp_status"
    const content = args.content ?? args.text ?? "POSTED"
    await writeFile(handle, filePath, content)
  }

  const readPath = args.path || "/tmp/erp_status"
  let erp = await readFile(handle, readPath).catch(() => undefined)
  if (readPath !== "/tmp/erp_status") {
    const fallback = await readFile(handle, "/tmp/erp_status").catch(() => undefined)
    if (!erp) erp = fallback
  }
  const ops = await readFile(handle, "/tmp/ops_ticket").catch(() => undefined)

  const ready = true
  const observation: Record<string, any> = {
    claimedSuccess: true,
    ready,
    sessionId: handle.sessionId || handle.id,
    streamUrl: handle.streamUrl,
    erp_status: erp ? String(erp).trim() : undefined,
    ops_ticket: ops ? String(ops).trim() : undefined,
    typed: args.text,
    path: args.path,
  }

  if (handle.screenshot && (tool === "desktop_screenshot" || tool === "desktop_write" || tool === "desktop_health")) {
    const png = await handle.screenshot({ format: "png" })
    observation.screenshotPath = writeArtifact(req.artifactDir, req.runId, "desktop.png", png)
  }

  // Side effect landed; the RPC result did not. Caller must independently verify.
  if (args.dropResult) {
    throw new AmbiguousTimeoutError("Network connection disappeared after dispatch; result is UNKNOWN")
  }

  return observation
}

async function writeFile(handle: any, filePath: string, content: string): Promise<void> {
  if (handle.files?.write) {
    await handle.files.write(filePath, String(content))
    return
  }
  if (handle.commands?.run) {
    const encoded = Buffer.from(String(content)).toString("base64")
    await handle.commands.run("bash", {
      args: ["-lc", `mkdir -p "$(dirname '${filePath}')" && echo '${encoded}' | base64 -d > '${filePath}'`],
    })
  }
}

async function readFile(handle: any, filePath: string): Promise<string> {
  if (handle.files?.readText) return String(await handle.files.readText(filePath) ?? "")
  if (handle.files?.read) {
    const buf = await handle.files.read(filePath)
    return Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf ?? "")
  }
  if (handle.commands?.run) {
    const out = await handle.commands.run("cat", { args: [filePath] })
    return String(out.stdout || "")
  }
  return ""
}

function writeArtifact(
  artifactDir: string | undefined,
  runId: string | undefined,
  filename: string,
  data: Buffer | Uint8Array | string,
): string | undefined {
  if (!artifactDir || !runId) return undefined
  const dir = path.join(artifactDir, runId)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, filename)
  writeFileSync(file, data)
  return file
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { CODING_APP_JS }
