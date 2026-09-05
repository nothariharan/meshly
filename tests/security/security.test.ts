/**
 * @meshly/tests - Security & Red-Team Policy Invariants
 * Evaluates pre-execution interception against privilege escalation and unauthorized side effects.
 */
import { AuthorityManager } from "@meshly/sdk"

export async function runSecurityTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY SECURITY & RED-TEAM POLICY SUITE")
  console.log(" Testing Pre-Execution Interception & Monotonic Privilege Bounds")
  console.log("=".repeat(78) + "\n")

  let passed = true

  const parentAuth = AuthorityManager.issue({
    tools: ["read_invoice", "calculate_tax"],
    capabilities: ["read:finance"],
    domains: ["billing.internal", "stripe.com"],
    maxSpend: 5.0,
    writeAccess: ["/tmp/app/logs"],
    lifespanMs: 3600_000,
  })

  // 1. Tool authorization interception
  const attack1 = AuthorityManager.evaluate(parentAuth, { tool: "drop_all_tables" })
  if (!attack1.allowed && attack1.policyReason === "TOOL_DISALLOWED") {
    console.log("  ✓ [Blocked] Tool 'drop_all_tables' blocked before invocation")
  } else {
    console.error("  ✗ Security failure: Unauthorized tool was permitted!")
    passed = false
  }

  // 2. Domain egress interception
  const attack2 = AuthorityManager.evaluate(parentAuth, {
    tool: "read_invoice",
    domain: "evil-exfiltration-target.ru",
  })
  if (!attack2.allowed && attack2.policyReason === "DOMAIN_BLOCKED") {
    console.log("  ✓ [Blocked] Domain exfiltration to 'evil-exfiltration-target.ru' intercepted")
  } else {
    console.error("  ✗ Security failure: Unauthorized domain egress allowed!")
    passed = false
  }

  // 3. Unauthorized filesystem write target
  const attack3 = AuthorityManager.evaluate(parentAuth, {
    tool: "read_invoice",
    writeTarget: "/etc/shadow",
  })
  if (!attack3.allowed && attack3.policyReason === "WRITE_UNAUTHORIZED") {
    console.log("  ✓ [Blocked] Write access to '/etc/shadow' denied")
  } else {
    console.error("  ✗ Security failure: Unauthorized write was allowed!")
    passed = false
  }

  // 4. Monotonic delegation privilege escalation
  const attack4 = AuthorityManager.delegate(parentAuth, {
    tools: ["read_invoice", "superuser_root_access"],
    domains: ["stripe.com", "crypto-miner.com"],
    maxSpend: 1000.0,
  })

  const escalationBlocked =
    !attack4.tools.includes("superuser_root_access") &&
    !attack4.domains?.includes("crypto-miner.com") &&
    attack4.maxSpend === 5.0

  if (escalationBlocked) {
    console.log("  ✓ [Blocked] Sub-agent privilege escalation strictly constrained (A_child ⊆ A_parent)")
  } else {
    console.error("  ✗ Security failure: Sub-agent escalated permissions!")
    passed = false
  }

  // 5. Spend over-limit interception
  const attack5 = AuthorityManager.evaluate(parentAuth, {
    tool: "calculate_tax",
    amount: 100.0, // exceeds $5.00 spend cap
  })
  if (!attack5.allowed && attack5.policyReason === "SPEND_EXCEEDED") {
    console.log("  ✓ [Blocked] Transaction amount $100.00 exceeds $5.00 authority limit")
  } else {
    console.error("  ✗ Security failure: Spend overrun permitted!")
    passed = false
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL SECURITY ATTACKS INTERCEPTED" : "SECURITY VULNERABILITY FOUND"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("security.test")) {
  runSecurityTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
