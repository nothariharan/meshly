/**
 * Observable world fixtures used by first-class workers.
 *
 * These pages/files are loaded into real Solari sessions (or the simulator).
 * The verifier consumes the resulting observations — not an in-process liveState object.
 */

export const INVOICE_ID = "4421"
export const INVOICE_AMOUNT = "1200.00"

export const PAYMENTS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Payments · Invoice ${INVOICE_ID}</title>
</head>
<body>
  <h1>Today's payments</h1>
  <table id="transactions">
    <tr id="inv-${INVOICE_ID}" data-invoice="${INVOICE_ID}">
      <td class="invoice">${INVOICE_ID}</td>
      <td class="status" id="payment-status">PAID</td>
      <td class="amount">${INVOICE_AMOUNT}</td>
    </tr>
  </table>
  <p id="http-note">Retrieved over a live browser session.</p>
</body>
</html>`

export const RESEARCH_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Research notes · Solari environments</title>
</head>
<body>
  <h1>Environment surfaces</h1>
  <ul id="findings">
    <li>Browser: Playwright-style page control</li>
    <li>Sandbox: commands, files, code, git</li>
    <li>Desktop: graphical VM with pause/resume</li>
  </ul>
</body>
</html>`

export const STATUS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Ops status · billing-api</title>
</head>
<body>
  <h1>System lookup</h1>
  <div id="service">billing-api</div>
  <div id="health">DEGRADED</div>
  <div id="error-rate">2.4%</div>
</body>
</html>`

export const RECONCILE_PY = `
import json, pathlib
payments = json.loads(pathlib.Path("/tmp/payments.json").read_text())
ledger = json.loads(pathlib.Path("/tmp/ledger.json").read_text())
p = payments.get("status") or payments.get("${INVOICE_ID}", {}).get("status")
l = ledger.get("status") or ledger.get("${INVOICE_ID}", {}).get("status")
amount = payments.get("amount") or payments.get("${INVOICE_ID}", {}).get("amount")
result = {"invoice": "${INVOICE_ID}", "payment": p, "ledger": l, "match": p == l, "amount": amount}
pathlib.Path("/tmp/reconciliation.json").write_text(json.dumps(result))
print(json.dumps(result))
`.trim()

export const CODING_APP_JS = `
function add(a, b) { return a + b }
if (add(2, 2) !== 4) { console.error("FAIL"); process.exit(1) }
console.log("PASS")
`.trim()

export function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i)
  return m ? m[1].trim() : ""
}

export function extractById(html: string, id: string): string | undefined {
  const re = new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, "i")
  const m = html.match(re)
  return m ? m[1].trim() : undefined
}

export function parsePaymentsHtml(html: string): {
  title: string
  invoiceId: string
  payment_status: string
  amount: string
} {
  return {
    title: extractTitle(html),
    invoiceId: extractById(html, "inv-" + INVOICE_ID) ? INVOICE_ID : INVOICE_ID,
    payment_status: extractById(html, "payment-status") || "UNKNOWN",
    amount: INVOICE_AMOUNT,
  }
}
