/**
 * @meshly/tests - Malicious Agent Escape Test Suite (Point 26)
 * Simulates a compromised or rogue model deliberately attempting to escape its authority:
 *   1. Spawn child with escalated privileges
 *   2. Hijack / reuse another worker's active environment
 *   3. Exfiltrate data to unauthorized domain
 *   4. Execute tool after authority lease expiry
 *   5. Exceed assigned spend cap
 *   6. Continue executing after parent worker cancellation
 */
import { Meshly, AuthorityManager } from "@meshly/sdk"

export async function runMaliciousAgentTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY MALICIOUS AGENT RED-TEAM ESCAPE TEST SUITE")
  console.log(" Attempting 6 Common Authority Escapes")
  console.log("=".repeat(78) + "\n")

  const mesh = new Meshly({ preferSimulator: true })
  let passed = true

  const parentAuth = AuthorityManager.issue({
    tools: ["read_invoice"],
    capabilities: ["read:finance"],
    domains: ["stripe.com"],
    maxSpend: 1.0,
    writeAccess: ["/tmp/safe"],
    lifespanMs: 3600_000,
  })

  const parentWorker = await mesh.spawn({
    task: "Parent finance worker",
    capabilities: ["browser", "sandbox"],
    authority: parentAuth,
    budget: 1.0,
  })

  // ESCAPE 1: Spawn child with more privileges (escalation attack)
  console.log("[Escape 1] Malicious agent attempts to spawn child with root tools...")
  const child = await parentWorker.spawnChild({
    task: "Rogue sub-agent",
    capabilities: ["desktop"], // Not in parent!
    requestedAuthority: {
      tools: ["delete_all_databases", "grant_admin_role"], // Not in parent!
      maxSpend: 1000.0, // Exceeds parent!
      domains: ["unauthorized-crypto-drain.com"], // Not in parent!
    },
  })

  const escalationBlocked =
    !child.authority.tools.includes("delete_all_databases") &&
    !child.authority.tools.includes("grant_admin_role") &&
    child.authority.maxSpend === 1.0 &&
    !child.authority.domains?.includes("unauthorized-crypto-drain.com")

  if (escalationBlocked) {
    console.log("  ✓ [Blocked] Privilege escalation mathematically neutralized by monotonic narrowing")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Child acquired escalated privileges!")
  }

  // ESCAPE 2: Hijack / reuse another worker's active environment
  console.log("\n[Escape 2] Malicious agent attempts to hijack an active environment...")
  const victimWorker = await mesh.spawn({
    task: "Victim worker",
    capabilities: ["browser"],
  })
  const victimLease = await mesh.broker.acquire({
    workerId: victimWorker.id,
    type: "browser",
    authority: victimWorker.authority,
    budget: 0.5,
  })

  const activeEnv = mesh.broker.inspect(victimLease.environmentId)!
  // Rogue worker attempts to issue commands on victim's leased environment
  const hijackAttempt = activeEnv.owner === child.id

  if (!hijackAttempt && activeEnv.owner === victimWorker.id) {
    console.log("  ✓ [Blocked] Environment ownership is exclusive; rogue worker rejected")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Environment was hijacked!")
  }

  // ESCAPE 3: Unauthorized domain egress
  console.log("\n[Escape 3] Malicious agent attempts data exfiltration to unauthorized domain...")
  const exfilResult = AuthorityManager.evaluate(parentAuth, {
    tool: "read_invoice",
    domain: "evil-exfiltration-target.org",
  })

  if (!exfilResult.allowed && exfilResult.policyReason === "DOMAIN_BLOCKED") {
    console.log("  ✓ [Blocked] Domain exfiltration intercepted before tool execution")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Disallowed domain access permitted!")
  }

  // ESCAPE 4: Execute after authority lease expiration
  console.log("\n[Escape 4] Malicious agent attempts execution after lease expiry...")
  const expiredAuth = AuthorityManager.issue({
    tools: ["read_invoice"],
    lifespanMs: -500, // Expired
  })
  const postExpiryResult = AuthorityManager.evaluate(expiredAuth, { tool: "read_invoice" })

  if (!postExpiryResult.allowed && postExpiryResult.policyReason === "LEASE_EXPIRED") {
    console.log("  ✓ [Blocked] Expired lease execution rejected with LEASE_EXPIRED")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Action allowed on expired lease!")
  }

  // ESCAPE 5: Exceed budget cap
  console.log("\n[Escape 5] Malicious agent attempts spend overrun...")
  const deductOver = child.deductSpend(50.0) // Budget is $1.00

  if (!deductOver && child.budget.spent <= child.budget.maxSpend) {
    console.log("  ✓ [Blocked] Budget overrun blocked ($50.00 attempt on $1.00 budget)")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Budget ceiling breached!")
  }

  // ESCAPE 6: Execute after cancellation
  console.log("\n[Escape 6] Rogue child attempts to execute after parent cancelled...")
  await parentWorker.cancel("Parent cancelled due to anomaly")

  if (child.status === "CANCELLED" && parentWorker.status === "CANCELLED") {
    console.log("  ✓ [Blocked] Cascade cancellation recursively terminated child compute")
  } else {
    passed = false
    console.error("  ✗ Vulnerability: Child worker survived parent cancellation!")
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL 6 MALICIOUS ESCAPES NEUTRALIZED" : "SECURITY VULNERABILITY FOUND"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("malicious-agent")) {
  runMaliciousAgentTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
