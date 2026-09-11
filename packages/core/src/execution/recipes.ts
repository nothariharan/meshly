/**
 * First-class worker programs. Same kernel loop, different tasks.
 * Do not add kernel concepts here — only ActionRequests + verification contracts.
 */
import type { AgentActionRequest, EnvironmentType, VerificationContract, WorkerKind } from "../types.js"
import { CODING_APP_JS, INVOICE_ID, PAYMENTS_HTML, RECONCILE_PY, RESEARCH_HTML, STATUS_HTML } from "./world.js"

export type ExecuteScenario = "default" | "reality-divergence" | "ambiguous-timeout"

export interface ProgramStep {
  intent: string
  tool: string
  environment: EnvironmentType
  args: Record<string, any>
  contract: VerificationContract
  claimedSuccess?: boolean
}

export interface WorkerProgram {
  kind: WorkerKind | "timeout"
  steps: ProgramStep[]
}

export interface ResolveProgramInput {
  task: string
  capabilities: string[]
  kind?: WorkerKind | string
  scenario?: ExecuteScenario
}

export function inferWorkerKind(task: string, kind?: string): WorkerKind | "timeout" | undefined {
  if (kind === "timeout" || kind === "ambiguous-timeout") return "timeout"
  if (kind === "probe" || kind === "reconciliation" || kind === "research" || kind === "coding" || kind === "operations") {
    return kind
  }
  const t = task.toLowerCase()
  if (/reconcil|invoice|payment.*erp|erp.*payment/.test(t)) return "reconciliation"
  if (/research|collect information|verified report/.test(t)) return "research"
  if (/repositor|run tests|coding worker|modify.*code/.test(t)) return "coding"
  if (/operations worker|system lookup|ops ticket/.test(t)) return "operations"
  if (/ambiguous|timeout experiment/.test(t)) return "timeout"
  return undefined
}

export function resolveProgram(input: ResolveProgramInput): WorkerProgram {
  const scenario = input.scenario || "default"
  if (scenario === "ambiguous-timeout") return timeoutProgram()
  if (scenario === "reality-divergence") return reconciliationProgram(true)

  const kind = inferWorkerKind(input.task, input.kind)
  if (kind === "reconciliation") return reconciliationProgram(false)
  if (kind === "research") return researchProgram()
  if (kind === "coding") return codingProgram()
  if (kind === "operations") return operationsProgram()
  if (kind === "timeout") return timeoutProgram()
  return probeProgram(input.capabilities)
}

export function probeProgram(capabilities: string[]): WorkerProgram {
  const types = requestedTypes(capabilities)
  const steps: ProgramStep[] = []
  if (types.includes("browser")) {
    steps.push({
      intent: "Open a live browser session and observe a page",
      tool: "browser_navigate",
      environment: "browser",
      args: { url: "https://example.com" },
      contract: {
        intent: "Browser loaded a real page with a title",
        preconditions: [],
        postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Example" }],
      },
    })
  }
  if (types.includes("sandbox")) {
    steps.push({
      intent: "Run an isolated command in a sandbox",
      tool: "sandbox_exec",
      environment: "sandbox",
      args: { command: "python3", args: ["-c", "print(2+2)"] },
      contract: {
        intent: "Sandbox command exited 0 and printed 4",
        preconditions: [],
        postconditions: [
          { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
          { target: "sandbox", type: "text_contains", query: "stdout", expected: "4" },
        ],
      },
    })
  }
  if (types.includes("desktop")) {
    steps.push({
      intent: "Capture desktop GUI state",
      tool: "desktop_health",
      environment: "desktop",
      args: {},
      contract: {
        intent: "Desktop display is ready",
        preconditions: [],
        postconditions: [{ target: "desktop", type: "status_equals", query: "ready", expected: true }],
      },
    })
  }
  return { kind: "probe", steps }
}

export function reconciliationProgram(diverge: boolean): WorkerProgram {
  const erpValue = diverge ? "UNPAID" : "POSTED"
  const expectedErp = "POSTED"
  return {
    kind: "reconciliation",
    steps: [
      {
        intent: "Retrieve today's payment records from the live browser",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "payments", html: PAYMENTS_HTML },
        contract: {
          intent: "Browser observation of invoice 4421 is PAID",
          preconditions: [],
          postconditions: [
            { target: "browser", type: "text_contains", query: "payment_status", expected: "PAID" },
            { target: "browser", type: "status_equals", query: "httpStatus", expected: 200 },
          ],
        },
      },
      {
        intent: "Reconcile the browser payment against the ERP ledger in a sandbox",
        tool: "sandbox_exec",
        environment: "sandbox",
        args: {
          prepare: [
            { path: "/tmp/payments.json", content: JSON.stringify({ invoice: INVOICE_ID, status: "PAID", amount: "1200.00" }) },
            { path: "/tmp/ledger.json", content: JSON.stringify({ invoice: INVOICE_ID, status: "UNPAID", amount: "1200.00" }) },
          ],
          command: "python3",
          args: ["-c", RECONCILE_PY],
        },
        contract: {
          intent: "Sandbox computed payment vs ledger from real files",
          preconditions: [],
          postconditions: [
            { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
            { target: "sandbox", type: "text_contains", query: "payment", expected: "PAID" },
            { target: "sandbox", type: "text_contains", query: "ledger", expected: "UNPAID" },
          ],
        },
      },
      {
        intent: diverge
          ? "Agent claims the ERP was posted; independent verification must read the desktop file"
          : "Update the ERP on the desktop from the reconciliation result",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/erp_status", content: erpValue, text: erpValue },
        claimedSuccess: true,
        contract: {
          intent: "Independent desktop observation of ERP status",
          preconditions: [],
          postconditions: [
            { target: "desktop", type: "status_equals", query: "erp_status", expected: expectedErp },
          ],
          onFailure: "human",
        },
      },
    ],
  }
}

export function researchProgram(): WorkerProgram {
  return {
    kind: "research",
    steps: [
      {
        intent: "Collect information from a live browser page",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "research", html: RESEARCH_HTML },
        contract: {
          intent: "Browser captured research source material",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "Research" }],
        },
      },
      {
        intent: "Analyze collected notes in a sandbox and write a report",
        tool: "sandbox_write",
        environment: "sandbox",
        args: {
          path: "/tmp/research.md",
          content: "# Verified report\n\nBrowser, sandbox, and desktop are distinct Solari surfaces.\n",
        },
        contract: {
          intent: "Sandbox wrote the research report",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }],
        },
      },
      {
        intent: "Independently read the report Meshly is about to commit",
        tool: "sandbox_read",
        environment: "sandbox",
        args: { path: "/tmp/research.md" },
        contract: {
          intent: "Verified report exists in the sandbox",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "text_contains", query: "content", expected: "Verified report" }],
        },
      },
    ],
  }
}

export function codingProgram(): WorkerProgram {
  return {
    kind: "coding",
    steps: [
      {
        intent: "Modify the repository inside a sandbox",
        tool: "sandbox_write",
        environment: "sandbox",
        args: { path: "/tmp/repo/app.js", content: CODING_APP_JS },
        contract: {
          intent: "Source file written",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }],
        },
      },
      {
        intent: "Run tests against the modified repository",
        tool: "sandbox_exec",
        environment: "sandbox",
        args: { command: "python3", args: ["-c", "print('PASS')"] },
        contract: {
          intent: "Tests passed in the sandbox",
          preconditions: [],
          postconditions: [
            { target: "sandbox", type: "status_equals", query: "exitCode", expected: 0 },
            { target: "sandbox", type: "text_contains", query: "stdout", expected: "PASS" },
          ],
        },
      },
      {
        intent: "Browser QA of the resulting artifact page",
        tool: "browser_extract",
        environment: "browser",
        args: { html: "<html><head><title>QA PASS</title></head><body><div id='qa'>PASS</div></body></html>" },
        contract: {
          intent: "Browser QA observed PASS",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "title", expected: "PASS" }],
        },
      },
    ],
  }
}

export function operationsProgram(): WorkerProgram {
  return {
    kind: "operations",
    steps: [
      {
        intent: "Look up live system status in a browser",
        tool: "browser_extract",
        environment: "browser",
        args: { fixture: "status", html: STATUS_HTML },
        contract: {
          intent: "Browser observed the degraded service",
          preconditions: [],
          postconditions: [{ target: "browser", type: "text_contains", query: "health", expected: "DEGRADED" }],
        },
      },
      {
        intent: "Process the incident in a sandbox",
        tool: "sandbox_write",
        environment: "sandbox",
        args: { path: "/tmp/incident.json", content: JSON.stringify({ service: "billing-api", health: "DEGRADED" }) },
        contract: {
          intent: "Sandbox stored the incident record",
          preconditions: [],
          postconditions: [{ target: "sandbox", type: "status_equals", query: "written", expected: true }],
        },
      },
      {
        intent: "File the operations ticket on the desktop GUI surface",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/ops_ticket", content: "ACK-DEGRADED" },
        contract: {
          intent: "Desktop ticket file is ACK-DEGRADED",
          preconditions: [],
          postconditions: [{ target: "desktop", type: "text_contains", query: "ops_ticket", expected: "ACK-DEGRADED" }],
        },
      },
    ],
  }
}

export function timeoutProgram(): WorkerProgram {
  return {
    kind: "timeout",
    steps: [
      {
        intent: "Dispatch a desktop side effect whose result may never return",
        tool: "desktop_write",
        environment: "desktop",
        args: { path: "/tmp/erp_status", content: "POSTED", dropResult: true },
        contract: {
          intent: "Independent verification of the desktop side effect",
          preconditions: [],
          postconditions: [{ target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" }],
        },
      },
    ],
  }
}

export function programAsScript(program: WorkerProgram): (context: { currentStep: number; lastObservation?: any }) => Promise<AgentActionRequest> {
  return async (context) => {
    const index = context.currentStep || 0
    const step = program.steps[index]
    if (!step) return { intent: "done", tool: "complete", args: context.lastObservation || {}, done: true }
    return {
      intent: step.intent,
      tool: step.tool,
      args: step.args,
      claimedSuccess: step.claimedSuccess !== false,
      environment: step.environment,
      timeoutMs: step.args.timeoutMs,
      contract: step.contract,
    }
  }
}

function requestedTypes(capabilities: string[]): EnvironmentType[] {
  const all: EnvironmentType[] = ["browser", "sandbox", "desktop"]
  const found = all.filter((type) => capabilities.includes(type))
  return found.length > 0 ? found : ["browser"]
}
