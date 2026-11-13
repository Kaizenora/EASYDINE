// Browser copy of apps/backend/src/modules/orders/kot.html.ts, so the cashier
// PC can print a kitchen ticket straight from the cart, without waiting for
// the server. Keep the two identical: the backend spec kot-html-parity.spec.ts
// fails if they print differently.
// Self-printing HTML kitchen ticket — same iframe+window.print() pattern as
// receipt.html.ts, deliberately a separate template rather than reusing
// buildReceiptHtml with a "hide prices" flag: a KOT is read by kitchen
// staff standing at a station under pressure, not a customer, so it needs
// large type, item names as the loudest thing on the page, and zero price/
// tax noise — different enough from a receipt that a shared template with
// conditionals would be harder to read than two small, honest ones.

import { BRAND_PRINT_LOGO_PNG } from "./brand-print-logo";

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

interface KotOrder {
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string } | null;
  items: {
    nameSnapshot: string;
    quantity: number;
    kitchenNote: string | null;
    modifiers: { nameSnapshot: string }[];
  }[];
}

export type KotPaper = '58mm' | '80mm' | 'A4';

/** Page CSS for the ticket's paper. 80 mm is the long-standing default. */
function kotPageCss(paper: KotPaper): string {
  if (paper === '58mm') {
    return `body { width: 54mm; padding: 2mm; }
  table { font-size: 14px; }
  @page { size: 58mm auto; margin: 0; }
  @media print { html, body { width: 54mm; } .no-print { display: none; } }`;
  }
  if (paper === 'A4') {
    return `body { width: 100%; max-width: 170mm; margin: 0 auto; padding: 10mm; }
  h1 { font-size: 22px; }
  table { font-size: 20px; }
  @page { size: A4 portrait; margin: 15mm; }
  @media print { html, body { width: 100%; max-width: 170mm; } .no-print { display: none; } }`;
  }
  return `@page { size: 80mm auto; margin: 0; }
  @media print { html, body { width: 80mm; } .no-print { display: none; } }`;
}

function safeLocaleString(d: Date, timeZone?: string): string {
  try {
    return d.toLocaleString(undefined, timeZone ? { timeZone } : undefined);
  } catch {
    return d.toLocaleString();
  }
}

export function buildKotHtml({
  branchName,
  order,
  ticket,
  paper = '80mm',
  timeZone,
  copyLabel,
}: {
  branchName: string;
  order: KotOrder;
  /** Ticket number / station, and the REPRINT copy number (0 = first print). */
  ticket?: { number: string; station: string | null; reprint: number };
  paper?: KotPaper;
  /** IANA zone of the device that prints it (server zone when omitted). */
  timeZone?: string;
  /** e.g. "REPRINT": stamped on copies printed again on request. */
  copyLabel?: string;
}): string {
  const dateStr = safeLocaleString(new Date(order.createdAt), timeZone);

  const itemRows = order.items
    .map((item) => {
      const modifierLines = item.modifiers
        .map((m) => `<div class="sub">+ ${esc(m.nameSnapshot)}</div>`)
        .join('');
      const noteLine = item.kitchenNote
        ? `<div class="note">Note: ${esc(item.kitchenNote)}</div>`
        : '';
      return `
        <tr>
          <td class="qty">${item.quantity}×</td>
          <td>${esc(item.nameSnapshot)}${modifierLines}${noteLine}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>KOT ${esc(order.orderNumber || order.table?.label || '')}</title>
<style>
  * { box-sizing: border-box; }
  html { margin: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 4mm; color: #111; width: 80mm; }
  p { margin: 0 0 3px; }
  .kot { width: 100%; margin: 0; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 12px; line-height: 1.4; }
  .rule { border: none; border-top: 1px dashed #999; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  td { padding: 4px 0; vertical-align: top; word-break: break-word; }
  .qty { font-weight: 700; white-space: nowrap; padding-right: 8px; width: 1%; }
  .sub { font-size: 13px; color: #444; padding-left: 4px; }
  .note { font-size: 13px; font-weight: 600; color: #111; padding-left: 4px; }
  .reprint { font-size: 16px; font-weight: 700; text-align: center; margin: 2px 0; }
  .powered { text-align: center; margin-top: 4px; font-size: 9px; color: #777; letter-spacing: 0.3px; }
  .powered-logo { display: block; width: 26mm; max-width: 60%; height: auto; margin: 6px auto 1px; image-rendering: pixelated; }
  ${kotPageCss(paper)}
</style>
</head>
<body>
  <script>
    window.addEventListener('message', function (e) { if (e.data === 'print') window.print(); });
  </script>
  <div class="kot">
    <h1>Kitchen order</h1>
    ${ticket?.reprint ? `<p class="reprint">*** REPRINT #${ticket.reprint} ***</p>` : copyLabel ? `<p class="reprint">*** ${esc(copyLabel)} ***</p>` : ''}
    <p class="center muted">${esc(branchName)}</p>
    ${ticket ? `<p class="center muted">Ticket ${esc(ticket.number)}${ticket.station ? ` - ${esc(ticket.station)}` : ''}</p>` : ''}
    <hr class="rule">
    <p class="muted">
      ${esc(dateStr)}<br>
      Order: ${order.orderNumber ? `#${esc(order.orderNumber)} · ` : ''}${esc(order.type.replace('_', ' '))}
      ${order.table ? `<br><strong>Table: ${esc(order.table.label)}</strong>` : ''}
      ${order.customer ? `<br>Guest: ${esc(order.customer.name)}` : ''}
    </p>
    <hr class="rule">
    <table>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="rule">
    <img class="powered-logo" src="${BRAND_PRINT_LOGO_PNG}" alt="EasyDine" />
    <p class="powered">Powered by EasyDine</p>
  </div>
</body>
</html>`;
}
