/**
 * Meshly Authority & Policy Interception Subsystem
 * Enforces monotonic privilege narrowing (A_child ⊆ A_parent) and granular capability checking.
 * Intercepts every consequential action BEFORE it reaches the Solari execution fabric.
 */
import { Authority } from "./types.js"
import { EventStore } from "./events.js"

export interface ActionIntent {
  tool?: string
  capability?: string
  domain?: string
  spend?: number
  writeTarget?: string
  resource?: string
}

export interface AuthorizationResult {
  allowed: boolean
  violation?: string
  policyReason?: string
}

export class AuthorityManager {
  private events?: EventStore

  constructor(events?: EventStore) {
    this.events = events
  }

  /**
   * Create a root authority scope
   */
  static create(params: {
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

  /**
   * Derive child authority strictly through set intersection.
   * Monotonic invariant: child can NEVER exceed parent permissions.
   */
  static deriveChild(parent: Authority, requested: Partial<Authority>): Authority {
    // 1. Tools intersection
    let tools: string[]
    if (parent.tools.includes("*")) {
      tools = requested.tools ? [...requested.tools] : ["*"]
    } else if (requested.tools) {
      tools = requested.tools.filter((t) => parent.tools.includes(t))
    } else {
      tools = [...parent.tools]
    }

    // 2. Capabilities intersection (e.g. "read:invoice", "refund:max500")
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

    // 4. Spend cap: child maxSpend cannot exceed parent maxSpend
    const maxSpend = Math.min(parent.maxSpend ?? 0, requested.maxSpend ?? parent.maxSpend ?? 0)

    // 5. Write target intersection
    const writeAccess = requested.writeAccess
      ? requested.writeAccess.filter((w) => parent.writeAccess?.includes(w))
      : [...(parent.writeAccess ?? [])]

    // 6. Expiration: child cannot outlive parent
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

  /**
   * Pre-execution policy interception: evaluates action intent against active authority.
   */
  static evaluate(auth: Authority, action: ActionIntent): AuthorizationResult {
    // Check lease expiration
    if (Date.now() > auth.expiresAt.getTime()) {
      return { allowed: false, violation: "Authority lease has expired", policyReason: "LEASE_EXPIRED" }
    }

    // Check tool permission
    if (action.tool && !auth.tools.includes("*") && !auth.tools.includes(action.tool)) {
      return {
        allowed: false,
        violation: `Tool '${action.tool}' not permitted under active authority`,
        policyReason: "TOOL_DISALLOWED",
      }
    }

    // Check granular capability (e.g. "refund:max500")
    if (action.capability && !auth.capabilities.includes("*") && !auth.capabilities.includes(action.capability)) {
      return {
        allowed: false,
        violation: `Capability '${action.capability}' not held by worker`,
        policyReason: "CAPABILITY_DISALLOWED",
      }
    }

    // Check domain whitelist
    if (action.domain && auth.domains) {
      const domainAllowed = auth.domains.some(
        (pattern) => pattern === "*" || action.domain === pattern || action.domain?.endsWith("." + pattern)
      )
      if (!domainAllowed) {
        return {
          allowed: false,
          violation: `Domain '${action.domain}' blocked by authority policy`,
          policyReason: "DOMAIN_BLOCKED",
        }
      }
    }

    // Check spend cap
    if (action.spend && auth.maxSpend !== undefined && action.spend > auth.maxSpend) {
      return {
        allowed: false,
        violation: `Requested spend $${action.spend.toFixed(2)} exceeds authority limit $${auth.maxSpend.toFixed(2)}`,
        policyReason: "SPEND_EXCEEDED",
      }
    }

    // Check write target
    if (action.writeTarget && auth.writeAccess) {
      const writeAllowed = auth.writeAccess.some(
        (target) => target === "*" || action.writeTarget === target || action.writeTarget?.startsWith(target)
      )
      if (!writeAllowed) {
        return {
          allowed: false,
          violation: `Write access to '${action.writeTarget}' is unauthorized`,
          policyReason: "WRITE_UNAUTHORIZED",
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Authorize an action and log the policy event
   */
  authorize(workerId: string, auth: Authority, action: ActionIntent): AuthorizationResult {
    const result = AuthorityManager.evaluate(auth, action)

    if (this.events) {
      if (result.allowed) {
        this.events.emit("action.authorized", {
          workerId,
          data: { action },
        })
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
