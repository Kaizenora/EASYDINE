// Bill slip for the Tables page "Settle bill" receipt when the server's full
// receipt page cannot be used (an older backend that does not return the
// order id). Sized for the cashier's bill paper (58 / 80 mm thermal or A4),
// never the whole dashboard page.

export interface SettleReceiptSlip {
  billNumber: string;
  tableName: string;
  customerName: string;
  paymentMethod: string;
  date: string;
  subtotal: string;
  tax: string;
  totalAmount: string;
  restaurantName?: string;
}

function esc(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function pageCss(paper: "58mm" | "80mm" | "A4"): string {
  if (paper === "58mm") return "body{width:54mm;padding:2mm;font-size:12px}@page{size:58mm auto;margin:0}";
  if (paper === "A4") return "body{width:100%;max-width:170mm;margin:0 auto;padding:10mm;font-size:14px}@page{size:A4 portrait;margin:15mm}";
  return "body{width:76mm;padding:2mm;font-size:13px}@page{size:80mm auto;margin:0}";
}

export function settleReceiptHtml(r: SettleReceiptSlip, paper: "58mm" | "80mm" | "A4" = "80mm"): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="total"' : ""}><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Bill ${esc(r.billNumber)}</title>
<style>
*{box-sizing:border-box}html{margin:0}
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;color:#111}
h1{font-size:15px;text-align:center;margin:0 0 2px}
.c{text-align:center}.m{color:#444;font-size:11px}
hr{border:none;border-top:1px dashed #999;margin:6px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}
.r{text-align:right;white-space:nowrap}.total td{font-weight:700;font-size:1.15em;padding-top:4px}
${pageCss(paper)}
</style></head><body>
<h1>${esc(r.restaurantName || r.tableName)}</h1>
<p class="c m">${esc(r.tableName)} · Tax Invoice</p>
<p class="c m">Bill #${esc(r.billNumber)} · ${esc(r.date)}</p>
<hr>
<table>
${row("Customer", r.customerName)}
${row("Payment", r.paymentMethod)}
</table>
<hr>
<table>
${row("Subtotal", `₹${r.subtotal}`)}
${row("Tax", `₹${r.tax}`)}
${row("TOTAL PAID", `₹${r.totalAmount}`, true)}
</table>
<hr>
<p class="c m">Thank you for dining with us!</p>
<p class="c" style="font-size:9px;color:#777;margin-top:4px">Powered by EasyDine</p>
</body></html>`;
}
