/**
 * Independent verification for invoice 4421.
 *
 * Meshly checks the world, not the agent claim.
 * payment.status === PAID and erp.status === POSTED must both be true
 * or commit is denied.
 */
import type { VerificationContract } from "@meshly/sdk"

export const INVOICE_ID = "4421"

export const reconcileContract: VerificationContract = {
  intent: "Independent desktop observation of ERP status",
  preconditions: [],
  postconditions: [
    { target: "browser", type: "text_contains", query: "payment_status", expected: "PAID" },
    { target: "desktop", type: "status_equals", query: "erp_status", expected: "POSTED" },
  ],
  onFailure: "human",
}

export function describeContract(): string {
  return [
    `invoice ${INVOICE_ID}`,
    "payment.status === PAID",
    "erp.status === POSTED",
    "payment.status === erp.status is implied by both posting",
  ].join("\n")
}
