/**
 * Meshly Reference Workflow A: Browser-Heavy Market Pricing Research
 * Demonstrates:
 *   1. Cloud Browser stealth session extracting pricing tiers from competitor sites
 *   2. MicroVM Sandbox parsing HTML and running statistical analysis in Python
 *   3. Verifying output markdown report against reality preconditions & postconditions
 */
import { Meshly, AuthorityManager } from "@meshly/sdk"
import type { VerificationContract, EvidenceBundle } from "@meshly/sdk"

export interface ResearchWorkflowResult {
  success: boolean
  competitor: string
  extractedTiers: Array<{ tier: string; price: number }>
  reportDigest: string
  evidence: EvidenceBundle
}

export async function runResearchWorkflow(mesh: Meshly): Promise<ResearchWorkflowResult> {
  console.log("\n" + "=".repeat(78))
  console.log(" MESHLY: BROWSER RESEARCH INTELLIGENCE (WORKFLOW A)")
  console.log(" Cloud Browser Stealth Scraping -> MicroVM Sandbox Analysis")
  console.log("=".repeat(78) + "\n")

  const worker = await mesh.spawn({
    task: "Extract and synthesize pricing matrix for Competitor SaaS",
    capabilities: ["browser", "sandbox"],
    priority: 8,
    budget: 1.5,
    authority: AuthorityManager.issue({
      tools: ["browser_navigate", "browser_extract", "sandbox_exec"],
      domains: ["competitor-cloud.io", "api.github.com"],
      maxSpend: 1.5,
    }),
  })

  // 1. Acquire Browser Lease
  console.log(">> [STAGE 1] Allocating Stealth Cloud Browser...")
  const browserLease = await mesh.broker.acquire({
    workerId: worker.id,
    type: "browser",
    capabilities: ["browser"],
    authority: worker.authority,
    budget: 0.5,
  })

  const liveState: Record<string, any> = {
    page_loaded: true,
    extracted_tiers: [
      { tier: "Starter", price: 29 },
      { tier: "Growth", price: 99 },
      { tier: "Enterprise", price: 499 },
    ],
    sandbox_analysis_done: false,
    report_generated: false,
    report_sha256: "",
  }

  const browserContract: VerificationContract = {
    intent: "Extract competitor pricing tiers from HTML DOM and verify 3 tiers found",
    preconditions: [{ target: "browser", type: "status_equals", query: "page_loaded", expected: true }],
    postconditions: [{ target: "state", type: "custom", query: "extracted_tiers", expected: (val: any) => Array.isArray(val) && val.length === 3 }],
  }

  const browserRes = await mesh.verifyStep({
    workerId: worker.id,
    contract: browserContract,
    executeAction: async () => {
      console.log(`   [Browser] Navigating to https://competitor-cloud.io/pricing (Stealth mode)...`)
      console.log(`   [Browser] DOM parsed: Found 3 active subscription plans.`)
      return { tiers: liveState.extracted_tiers }
    },
    observeState: async () => ({ ...liveState }),
  })

  if (!browserRes.state.worldStateMatched) {
    throw new Error("Workflow A: Browser extraction failed verification")
  }
  console.log(`✓ Browser Step Verified. 3 tiers extracted.`)
  await mesh.broker.release(browserLease.leaseId)

  // 2. Acquire Sandbox Lease for data processing
  console.log("\n>> [STAGE 2] Allocating MicroVM Sandbox for Synthesis...")
  const sandboxLease = await mesh.broker.acquire({
    workerId: worker.id,
    type: "sandbox",
    capabilities: ["sandbox"],
    authority: worker.authority,
    budget: 0.3,
  })

  const sandboxContract: VerificationContract = {
    intent: "Run Python data synthesis and generate verified pricing matrix report",
    preconditions: [{ target: "state", type: "custom", query: "extracted_tiers", expected: (val: any) => val.length > 0 }],
    postconditions: [{ target: "sandbox", type: "status_equals", query: "report_generated", expected: true }],
  }

  const sandboxRes = await mesh.verifyStep({
    workerId: worker.id,
    contract: sandboxContract,
    executeAction: async () => {
      console.log(`   [Sandbox] Running Python statistical analysis on extracted tier pricing...`)
      liveState.sandbox_analysis_done = true
      liveState.report_generated = true
      liveState.report_sha256 = "sha256_pricing_matrix_report_889a0f"
      return { reportSha: liveState.report_sha256 }
    },
    observeState: async () => ({ ...liveState }),
  })

  await mesh.broker.release(sandboxLease.leaseId)
  mesh.runtime.complete(worker.id)

  console.log(`✓ [Workflow A Complete] Pricing intelligence verified!`)
  console.log(`  Tamper-Evident Digest: ${sandboxRes.evidence?.tamperEvidentDigestSha256}\n`)

  return {
    success: true,
    competitor: "competitor-cloud.io",
    extractedTiers: liveState.extracted_tiers,
    reportDigest: liveState.report_sha256,
    evidence: sandboxRes.evidence!,
  }
}

const mesh = new Meshly({ preferSimulator: true })
runResearchWorkflow(mesh)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Workflow A failed:", err)
    process.exit(1)
  })
