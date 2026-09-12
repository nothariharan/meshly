/**
 * finance.reconcile — what this worker is allowed to do.
 *
 * Policy is issued before the worker runs. Meshly intercepts every tool
 * call against this lease. The agent does not get a Solari client.
 */
import { AuthorityManager } from "@meshly/sdk"

export const POLICY_NAME = "finance.reconcile"

export function issueReconcilePolicy(maxSpend = 2) {
  return AuthorityManager.issue({
    tools: [
      "browser_navigate",
      "browser_extract",
      "browser_click",
      "sandbox_exec",
      "sandbox_write",
      "sandbox_read",
      "desktop_write",
      "desktop_read",
      "desktop_screenshot",
      "desktop_health",
    ],
    capabilities: ["browser", "sandbox", "desktop"],
    domains: ["*"],
    maxSpend,
    writeAccess: ["/tmp/erp_status"],
  })
}
