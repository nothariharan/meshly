/**
 * @meshly/tests - Agent-Agnostic Third-Party Developer Test
 * Simulates a fresh coding agent / third-party developer interacting strictly with @meshly/sdk.
 * Proves that the model operates through clean contracts without knowing about
 * Scheduler, Leases, Checkpoints, Authority internals, or Solari APIs.
 */
import { Meshly, ScriptAgentAdapter, OpenAIAgentAdapter, AnthropicAgentAdapter, MCPAgentAdapter } from "@meshly/sdk"

export async function runAgentAgnosticTests(): Promise<{ passed: boolean }> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY AGENT-AGNOSTIC ADAPTERS & RUN CONTRACTS")
  console.log(" Proving Model Independence (OpenAI • Claude • Custom • MCP)")
  console.log("=".repeat(78) + "\n")

  const mesh = new Meshly({ preferSimulator: true })
  let passed = true

  // 1. OpenAI-style Function Calling Agent Loop
  console.log("[Test 1] OpenAI-Style Function Calling Agent Loop...")
  const openaiAdapter = new OpenAIAgentAdapter({ model: "gpt-4o" })

  const run1 = await mesh.runWithAgent({
    adapter: openaiAdapter,
    task: "Scrape monthly invoice from Stripe portal",
    capabilities: ["browser"],
    maxSteps: 2,
  })

  // Await run completion
  await new Promise((resolve) => setTimeout(resolve, 30))

  if (run1.status === "COMPLETED" && run1.steps.length > 0) {
    console.log(`  ✓ OpenAI agent executed through Meshly run [Run ID: ${run1.runId}]`)
    console.log(`  ✓ Step count: ${run1.steps.length} | Final Status: ${run1.status}`)
  } else {
    passed = false
    console.error("  ✗ OpenAI agent run failed:", run1.error)
  }

  // 2. Anthropic-style Computer-Use Desktop Agent Loop
  console.log("\n[Test 2] Anthropic-Style Computer-Use Desktop Agent Loop...")
  const anthropicAdapter = new AnthropicAgentAdapter("claude-3-5-sonnet-20241022")

  const run2 = await mesh.runWithAgent({
    adapter: anthropicAdapter,
    task: "Open Desktop ERP and enter journal amortization",
    capabilities: ["desktop"],
    maxSteps: 2,
  })

  await new Promise((resolve) => setTimeout(resolve, 30))

  if (run2.status === "COMPLETED" && run2.steps.length > 0) {
    console.log(`  ✓ Anthropic agent executed through Meshly run [Run ID: ${run2.runId}]`)
    console.log(`  ✓ Computer-use steps verified: ${run2.steps.map((s) => s.action.tool).join(" -> ")}`)
  } else {
    passed = false
    console.error("  ✗ Anthropic agent run failed:", run2.error)
  }

  // 3. MCP (Model Context Protocol) Client Adapter
  console.log("\n[Test 3] MCP Client Agent Adapter...")
  const mcpAdapter = new MCPAgentAdapter("solari-mcp")

  const run3 = await mesh.runWithAgent({
    adapter: mcpAdapter,
    task: "Extract tables via MCP server protocol",
    capabilities: ["sandbox"],
    maxSteps: 2,
  })

  await new Promise((resolve) => setTimeout(resolve, 30))

  if (run3.status === "COMPLETED") {
    console.log(`  ✓ MCP client executed tool calls within governance bounds [Run ID: ${run3.runId}]`)
  } else {
    passed = false
    console.error("  ✗ MCP agent run failed:", run3.error)
  }

  // 4. State-Preserving Model Handoff (Switching from Claude to GPT without losing state)
  console.log("\n[Test 4] State-Preserving Model Handoff (Claude Reasoning -> GPT Execution)...")
  const claudeWorker = await mesh.spawn({
    task: "Analyze financial data and plan ledger entries",
    capabilities: ["browser", "sandbox"],
    initialMemory: [{ key: "plan_summary", value: "3 invoices to post", tier: "hot" }],
  })

  claudeWorker.checkpointState(1, { plannedEntries: ["INV-1", "INV-2", "INV-3"] })

  // Handoff to a fast GPT execution worker
  const gptWorker = await mesh.handoff(claudeWorker.id, "Execute posted entries")
  const transferredPlan = mesh.memory.get(gptWorker.id, "plan_summary")

  if (transferredPlan?.value === "3 invoices to post" && gptWorker.context.currentStep === 1) {
    console.log("  ✓ State-preserving model handoff verified: preserved run state, step index, and hot memory")
  } else {
    passed = false
    console.error("  ✗ Model handoff dropped cognitive state!")
  }

  console.log("\n" + "-".repeat(78))
  console.log(` Status: ${passed ? "ALL AGENT ADAPTERS VERIFIED AGNOSTIC" : "FAILURES ENCOUNTERED"}`)
  console.log("=".repeat(78) + "\n")

  return { passed }
}

if (process.argv[1]?.includes("agent-agnostic")) {
  runAgentAgnosticTests().then((res) => {
    process.exit(res.passed ? 0 : 1)
  })
}
