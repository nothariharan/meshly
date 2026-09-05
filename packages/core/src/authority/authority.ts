/**
 * @meshly/core - Monotonic Authority & Policy Interception Engine
 */
import { Authority } from "../types.js"
import { EventStore } from "../events/events.js"

export interface ActionIntent {
  type?: string
  tool?: string
  capability?: string
  domain?: string
  amount?: number
  writeTarget?: string
  resource?: string
}

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL"

export interface AuthorizationResult {
  decision: PolicyDecision
  allowed: boolean
  violation?: string
  policyReason?: string
}

export class AuthorityManager {
  private events?: EventStore

  constructor(events?: EventStore) {
    this.events = events
  }

  static issue(params: {
    tools?: string[]
    capabilities?: string[]
    domains?: string[]
    maxSpend?: number
    writeAccess?: string[]
    lifespanMs?: number
    boundToJobId?: string
  }): Authority {
    return {
      tools: params.tools ? [...params.tools] : ["*"],
      capabilities: params.capabilities ? [...params.capabilities] : ["*"],
      domains: params.domains ? [...params.domains] : undefined,
      maxSpend: params.maxSpend ?? 5.0,
      writeAccess: params.writeAccess ? [...params.writeAccess] : [],
      expiresAt: new Date(Date.now() + (params.lifespanMs ?? 60 * 60 * 1000)),
      boundToJobId: params.boundToJobId,
    }
  }

  static delegate(parent: Authority, requested: Partial<Authority>): Authority {
    // 1. Tool intersection
    let tools: string[]
    if (parent.tools.includes("*")) {
      tools = requested.tools ? [...requested.tools] : ["*"]
    } else if (requested.tools) {
      tools = requested.tools.filter((t) => parent.tools.includes(t))
    } else {
      tools = [...parent.tools]
    }

    // 2. Capability intersection
    let capabilities: string[]
    if (parent.capabilities.includes("*")) {
      capabilities = requested.capabilities ? [...requested.capabilities] : ["*"]
    } else if (requested.capabilities) {
      capabilities = requested.capabilities.filter((c) => parent.capabilities.includes(c))
    } else {
      capabilities = [...parent.capabilities]
    }

    // 3. Domain intersection
    let domains: string[] | undefined
    if (parent.domains && requested.domains) {
      domains = requested.domains.filter((d) => parent.domains!.includes(d))
    } else if (parent.domains) {
      domains = [...parent.domains]
    } else {
      domains = requested.domains ? [...requested.domains] : undefined
    }

    // 4. Spend cap
    const maxSpend = Math.min(parent.maxSpend ?? 0, requested.maxSpend ?? parent.maxSpend ?? 0)

    // 5. Write target intersection
    const writeAccess = requested.writeAccess
      ? requested.writeAccess.filter((w) => parent.writeAccess?.includes(w))
      : [...(parent.writeAccess ?? [])]

    // 6. Expiration
    const expiresAt =
      requested.expiresAt && requested.expiresAt.getTime() < parent.expiresAt.getTime()
        ? requested.expiresAt
        : parent.expiresAt

    return {
      tools,
      capabilities,
      domains,
      maxSpend,
      writeAccess,
      expiresAt,
      boundToJobId: requested.boundToJobId || parent.boundToJobId,
    }
  }

  static evaluate(auth: Authority, action: ActionIntent): AuthorizationResult {
    if (Date.now() > auth.expiresAt.getTime()) {
      return { decision: "DENY", allowed: false, violation: "Authority lease has expired", policyReason: "LEASE_EXPIRED" }
    }

    if (action.tool && !auth.tools.includes("*") && !auth.tools.includes(action.tool)) {
      return {
        decision: "DENY",
        allowed: false,
        violation: `Tool '${action.tool}' not permitted under active authority`,
        policyReason: "TOOL_DISALLOWED",
      }
    }

    if (action.capability && !auth.capabilities.includes("*") && !auth.capabilities.includes(action.capability)) {
      return {
        decision: "DENY",
        allowed: false,
        violation: `Capability '${action.capability}' not held by worker`,
        policyReason: "CAPABILITY_DISALLOWED",
      }
    }

    if (action.domain && auth.domains) {
      const allowed = auth.domains.some(
        (p) => p === "*" || action.domain === p || action.domain?.endsWith("." + p)
      )
      if (!allowed) {
        return {
          decision: "DENY",
          allowed: false,
          violation: `Domain '${action.domain}' blocked by authority policy`,
          policyReason: "DOMAIN_BLOCKED",
        }
      }
    }

    const requestedAmount = action.amount ?? 0
    if (requestedAmount > 0 && auth.maxSpend !== undefined && requestedAmount > auth.maxSpend) {
      return {
        decision: "DENY",
        allowed: false,
        violation: `Requested amount $${requestedAmount.toFixed(2)} exceeds authority limit $${auth.maxSpend.toFixed(2)}`,
        policyReason: "SPEND_EXCEEDED",
      }
    }

    if (action.writeTarget && auth.writeAccess) {
      const writeAllowed = auth.writeAccess.some(
        (target) => target === "*" || action.writeTarget === target || action.writeTarget?.startsWith(target)
      )
      if (!writeAllowed) {
        return {
          decision: "DENY",
          allowed: false,
          violation: `Write access to '${action.writeTarget}' is unauthorized`,
          policyReason: "WRITE_UNAUTHORIZED",
        }
      }
    }

    return { decision: "ALLOW", allowed: true }
  }

  authorize(workerId: string, auth: Authority, action: ActionIntent): AuthorizationResult {
    const result = AuthorityManager.evaluate(auth, action)
    if (this.events) {
      if (result.allowed) {
        this.events.emit("action.authorized", { workerId, data: { action } })
      } else {
        this.events.emit("action.denied", {
          workerId,
          data: { action, violation: result.violation, policyReason: result.policyReason },
        })
      }
    }
    return result
  }
}
