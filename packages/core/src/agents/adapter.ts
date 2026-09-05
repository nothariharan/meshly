/**
 * @meshly/core - Agent-Agnostic Runtime Contract
 * Decouples reasoning models from scheduling, sandboxing, and execution fabrics.
 */
import { WorkerContext, AgentActionRequest, AgentAdapter } from "../types.js"

export type { AgentActionRequest, AgentAdapter }

/**
 * Script / Custom Agent Adapter
 * Executes declarative or scripted worker logic through Meshly's universal contracts.
 */
export class ScriptAgentAdapter implements AgentAdapter {
  readonly name = "script-agent"
  private scriptFn: (context: WorkerContext) => Promise<AgentActionRequest>

  constructor(scriptFn: (context: WorkerContext) => Promise<AgentActionRequest>) {
    this.scriptFn = scriptFn
  }

  async start(context: WorkerContext): Promise<AgentActionRequest> {
    return this.scriptFn(context)
  }

  async resume(context: WorkerContext): Promise<AgentActionRequest> {
    return this.scriptFn(context)
  }

  async handleObservation(context: WorkerContext, observation: Record<string, any>): Promise<AgentActionRequest> {
    context.lastObservation = observation
    return this.scriptFn(context)
  }

  async interrupt(): Promise<void> {
    // Graceful cancellation of in-flight script
  }
}

/**
 * OpenAI-Style Tool Calling Agent Adapter
 */
export class OpenAIAgentAdapter implements AgentAdapter {
  readonly name = "openai-agent"
  private mockModelName: string
  private customCaller?: (messages: any[], tools: any[]) => Promise<{ tool: string; args: any; intent: string }>

  constructor(options: { model?: string; caller?: (messages: any[], tools: any[]) => Promise<{ tool: string; args: any; intent: string }> } = {}) {
    this.mockModelName = options.model || "gpt-4o"
    this.customCaller = options.caller
  }

  async start(context: WorkerContext, prompt?: string): Promise<AgentActionRequest> {
    if (this.customCaller) {
      const call = await this.customCaller([{ role: "user", content: prompt || context.task }], [])
      return { intent: call.intent, tool: call.tool, args: call.args }
    }
    // Default model step inference
    return {
      intent: `Analyze task "${context.task}" and execute primary tool`,
      tool: "browser_navigate",
      args: { url: context.metadata?.targetUrl || "https://dashboard.stripe.com" },
      claimedSuccess: true,
    }
  }

  async resume(context: WorkerContext): Promise<AgentActionRequest> {
    return {
      intent: `Resume task at step ${context.currentStep}`,
      tool: "sandbox_exec",
      args: { command: "python3 process.py" },
      claimedSuccess: true,
    }
  }

  async handleObservation(context: WorkerContext, observation: Record<string, any>): Promise<AgentActionRequest> {
    if (observation.modal_visible) {
      return {
        intent: "Dismiss blocking modal dialog",
        tool: "browser_click",
        args: { selector: ".modal-close" },
        claimedSuccess: true,
      }
    }
    return {
      intent: "Complete task with verified observation",
      tool: "complete",
      args: observation,
      done: true,
      claimedSuccess: true,
    }
  }

  async interrupt(): Promise<void> {}
}

/**
 * Anthropic-Style Computer-Use Agent Adapter
 */
export class AnthropicAgentAdapter implements AgentAdapter {
  readonly name = "anthropic-agent"
  private model: string

  constructor(model: string = "claude-3-5-sonnet-20241022") {
    this.model = model
  }

  async start(context: WorkerContext): Promise<AgentActionRequest> {
    return {
      intent: `Initialize desktop GUI session for "${context.task}"`,
      tool: "desktop_open",
      args: { app: "ERP Client" },
      claimedSuccess: true,
    }
  }

  async resume(context: WorkerContext): Promise<AgentActionRequest> {
    return {
      intent: "Re-observe desktop screen and resume typing",
      tool: "desktop_type",
      args: { text: "AMZ-401-POSTED" },
      claimedSuccess: true,
    }
  }

  async handleObservation(context: WorkerContext, observation: Record<string, any>): Promise<AgentActionRequest> {
    return {
      intent: "Finalize GUI transaction",
      tool: "desktop_click",
      args: { x: 540, y: 320 },
      done: true,
      claimedSuccess: true,
    }
  }

  async interrupt(): Promise<void> {}
}

/**
 * MCP (Model Context Protocol) Client Adapter
 */
export class MCPAgentAdapter implements AgentAdapter {
  readonly name = "mcp-agent"
  private serverName: string

  constructor(serverName: string = "solari-mcp") {
    this.serverName = serverName
  }

  async start(context: WorkerContext): Promise<AgentActionRequest> {
    return {
      intent: `Call MCP tool via server '${this.serverName}'`,
      tool: "mcp_call_tool",
      args: { server: this.serverName, name: "extract_table", arguments: {} },
      claimedSuccess: true,
    }
  }

  async resume(context: WorkerContext): Promise<AgentActionRequest> {
    return {
      intent: "Resume MCP tool execution",
      tool: "mcp_call_tool",
      args: { server: this.serverName, name: "get_state" },
      claimedSuccess: true,
    }
  }

  async handleObservation(context: WorkerContext, observation: Record<string, any>): Promise<AgentActionRequest> {
    return {
      intent: "Acknowledge MCP observation",
      tool: "complete",
      args: observation,
      done: true,
      claimedSuccess: true,
    }
  }

  async interrupt(): Promise<void> {}
}
