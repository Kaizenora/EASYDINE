// Ported from easydine-pos's frontend/lib/print.ts: loads the backend's
// self-printing receipt HTML into a hidden same-page iframe rather than a
// new tab, so there's no blank/finished tab left for the cashier to notice
// and close. The OS print dialog still opens exactly as it would for any
// other page (any printer, or "Save as PDF").
import { nativePrinter, printHtmlOnDevice } from "./device-print.ts";
import { isNativeApp } from "./native.ts";
import { toast } from "./toast.ts";

export type CashierPaperSize = "58mm" | "80mm" | "A4";

export function getCashierPaperSize(): CashierPaperSize {
  if (typeof window === "undefined") return "80mm";
  const val = window.localStorage.getItem("easydine.cashierPaperSize");
  if (val === "58mm" || val === "80mm" || val === "A4") return val;
  return "80mm";
}

export function setCashierPaperSize(size: CashierPaperSize) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("easydine.cashierPaperSize", size);
  window.dispatchEvent(new Event("easydine:paperSize"));
}

let printFrame: HTMLIFrameElement | null = null;

function getPrintFrame(): HTMLIFrameElement {
  if (printFrame && document.body.contains(printFrame)) return printFrame;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Positioned far off-screen rather than display:none/width:0 — a 0-width
  // frame forces the browser to lay out the receipt at 0px before printing,
  // clipping the right-aligned amount columns. A real box lets it lay out
  // normally; the huge negative offset keeps it invisible without affecting
  // page layout.
  frame.style.position = "fixed";
  frame.style.top = "-10000px";
  frame.style.left = "-10000px";
  frame.style.width = "400px";
  frame.style.height = "600px";
  frame.style.border = "none";
  document.body.appendChild(frame);
  printFrame = frame;
  return frame;
}

function applyPaperSizeToDoc(doc: Document | null, paperSize: CashierPaperSize) {
  if (!doc) return;
  let styleEl = doc.getElementById("easydine-paper-size-override");
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = "easydine-paper-size-override";
    doc.head?.appendChild(styleEl);
  }
  if (paperSize === "58mm") {
    styleEl.textContent = `
      @page { size: 58mm auto; margin: 0; }
      body { width: 54mm !important; margin: 0 !important; padding: 2mm !important; font-size: 11px !important; }
      .receipt { width: 100% !important; }
      table { font-size: 10px !important; }
      h1 { font-size: 13px !important; }
      @media print { html, body { width: 54mm !important; } }
    `;
  } else if (paperSize === "A4") {
    styleEl.textContent = `
      @page { size: A4 portrait; margin: 15mm; }
      body { width: 100% !important; max-width: 170mm !important; margin: 0 auto !important; padding: 10mm !important; font-size: 13px !important; }
      .receipt { width: 100% !important; }
      table { font-size: 13px !important; }
      h1 { font-size: 18px !important; }
      @media print { html, body { width: 100% !important; max-width: 170mm !important; } }
    `;
  } else {
    styleEl.textContent = `
      @page { size: 80mm auto; margin: 0; }
      body { width: 80mm !important; margin: 0 !important; padding: 4mm !important; }
      .receipt { width: 100% !important; }
      @media print { html, body { width: 80mm !important; } }
    `;
  }
}

/** Bill figures the cashier has typed but not yet saved (see receipt route). */
export type BillQuery = Record<string, string | number | undefined>;

export function billQueryString(adj: BillQuery = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(adj)) {
    if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `&${s}` : "";
}

let isPrintingLock = false;
let printLockTimer: ReturnType<typeof setTimeout> | null = null;

function acquirePrintLock(): boolean {
  if (isPrintingLock) return false;
  isPrintingLock = true;
  if (printLockTimer) clearTimeout(printLockTimer);
  printLockTimer = setTimeout(() => {
    isPrintingLock = false;
  }, 1200);
  return true;
}

/** In the phone app: fetch the page and hand it to Android's print dialog (Save as PDF or any printer). */
function printPageOnDevice(url: string, name: string) {
  void fetch(url, { credentials: "include" })
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load the ${name.toLowerCase()} (${r.status})`);
      return r.text();
    })
    .then((html) => printHtmlOnDevice(html, name))
    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not open the print dialog"));
}

// When this cashier PC has a Bill printer saved (EasyDine Windows app, see
// lib/local-print.ts), bills go there without a dialog. The router returns
// false when nothing is saved, and the browser dialog below is used as before.
type BillPrintRouter = (
  orderId: string,
  branchId: string,
  adj: BillQuery,
  fallbackDialog: () => void,
) => boolean;
let billPrintRouter: BillPrintRouter | null = null;
export function registerBillPrintRouter(router: BillPrintRouter) {
  billPrintRouter = router;
}

/** Bill (open order) or receipt (paid order): this PC's saved Bill printer, else the browser dialog. Read-only. */
export function openReceiptPrint(orderId: string, branchId: string, adj: BillQuery = {}) {
  if (!acquirePrintLock()) return;
  if (billPrintRouter?.(orderId, branchId, adj, () => openReceiptDialog(orderId, branchId, adj))) return;
  openReceiptDialog(orderId, branchId, adj);
}

/** The browser / OS print dialog fallback (the cashier picks the printer there). */
export function openReceiptDialog(orderId: string, branchId: string, adj: BillQuery = {}) {
  const paperSize = getCashierPaperSize();
  // Only the native Android/iOS Capacitor app with a native printer plugin should use native device printing
  if (isNativeApp() && !!nativePrinter()) {
    printPageOnDevice(`/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}&paperSize=${paperSize}`, "Bill");
    return;
  }
  const frame = getPrintFrame();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    try {
      applyPaperSizeToDoc(frame.contentDocument, paperSize);
      win.focus();
      win.print();
    } catch {
      win.postMessage("print", "*");
    }
  };
  // Force a reload even if printing the same order twice in a row.
  frame.src = `/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}&paperSize=${paperSize}&t=${Date.now()}`;
}

export function openKotPrint(orderId: string, branchId: string) {
  if (!acquirePrintLock()) return;
  if (isNativeApp() && !!nativePrinter()) {
    printPageOnDevice(`/api/v1/orders/${orderId}/kot?branchId=${branchId}`, "Kitchen ticket");
    return;
  }
  const frame = getPrintFrame();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      win.postMessage("print", "*");
    }
  };
  frame.src = `/api/v1/orders/${orderId}/kot?branchId=${branchId}&t=${Date.now()}`;
}

/** Builds synthetic sample receipt HTML for test printing. Purely synthetic, never creates an order. */
export function buildSampleReceiptHtml(paperSize: CashierPaperSize = "80mm"): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const pageCss =
    paperSize === "58mm"
      ? `
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 2mm; color: #111; width: 54mm; font-size: 11px; }
    h1 { font-size: 13px; text-align: center; margin: 0 0 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .grand td { font-weight: 700; font-size: 11px; border-top: 1px solid #111; padding-top: 2px; }
    @page { size: 58mm auto; margin: 0; }
    @media print { html, body { width: 54mm; } .no-print { display: none; } }`
      : paperSize === "A4"
      ? `
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 auto; padding: 10mm; color: #111; width: 100%; max-width: 170mm; font-size: 13px; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .grand td { font-weight: 700; font-size: 15px; border-top: 1px solid #111; padding-top: 4px; }
    @page { size: A4 portrait; margin: 15mm; }
    @media print { html, body { width: 100%; max-width: 170mm; } .no-print { display: none; } }`
      : `
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 4mm; color: #111; width: 80mm; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .grand td { font-weight: 700; font-size: 13px; border-top: 1px solid #111; padding-top: 3px; }
    @page { size: 80mm auto; margin: 0; }
    @media print { html, body { width: 80mm; } .no-print { display: none; } }`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TEST-RECEIPT</title>
<style>
  * { box-sizing: border-box; }
  html { margin: 0; }
  p { margin: 0 0 3px; }
  .receipt { width: 100%; margin: 0; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 11px; line-height: 1.35; }
  .rule { border: none; border-top: 1px dashed #999; margin: 5px 0; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #777; padding-bottom: 2px; }
  td { padding: 1px 0; vertical-align: top; word-break: break-word; }
  .num { text-align: right; white-space: nowrap; padding-left: 6px; }
  .sub { font-size: 10px; color: #777; }
  .totals td { padding: 1px 0; }
  .footer { text-align: center; margin-top: 6px; font-size: 11px; }
  .badge { display: inline-block; padding: 1px 4px; font-size: 9px; font-weight: bold; border: 1px solid #333; border-radius: 3px; margin: 2px 0; }
${pageCss}
</style>
</head>
<body>
  <div class="receipt">
    <h1>EasyDine Restaurant</h1>
    <p class="center muted">
      Main Branch<br>123 High Street, Food District<br>Ph: +91 98765 43210<br>GSTIN: 27AABCE1234F1Z5
    </p>
    <div class="center"><span class="badge">SAMPLE TEST BILL &middot; ${paperSize}</span></div>
    <hr class="rule">
    <p class="muted">
      Bill: #TEST-001 &middot; Dine-in (Table 4)<br>
      Date: ${dateStr}, ${timeStr}
    </p>
    <hr class="rule">
    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Paneer Butter Masala<div class="sub">+ Extra cheese</div></td>
          <td class="num">1</td>
          <td class="num">&#8377;320.00</td>
          <td class="num">&#8377;320.00</td>
        </tr>
        <tr>
          <td>Garlic Naan</td>
          <td class="num">2</td>
          <td class="num">&#8377;60.00</td>
          <td class="num">&#8377;120.00</td>
        </tr>
        <tr>
          <td>Fresh Lime Soda</td>
          <td class="num">1</td>
          <td class="num">&#8377;50.00</td>
          <td class="num">&#8377;50.00</td>
        </tr>
      </tbody>
    </table>
    <hr class="rule">
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">&#8377;490.00</td></tr>
      <tr><td>CGST (2.5%)</td><td class="num">&#8377;12.25</td></tr>
      <tr><td>SGST (2.5%)</td><td class="num">&#8377;12.25</td></tr>
      <tr class="grand"><td>Total</td><td class="num">&#8377;514.50</td></tr>
    </table>
    <hr class="rule">
    <div class="footer muted">
      *** TEST BILL &mdash; NOT A REAL SALE ***<br>
      Printer configured successfully (${paperSize})<br>
      Thank you for visiting!
    </div>
  </div>
</body>
</html>`;
}

/** Opens browser print dialog with a safe synthetic test receipt. */
export function openTestReceiptPrint(size?: CashierPaperSize) {
  if (!acquirePrintLock()) return;
  const paperSize = size || getCashierPaperSize();
  const frame = getPrintFrame();

  const printFromHtml = () => {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) {
        toast.error("Could not access print frame");
        return;
      }
      doc.open();
      doc.write(buildSampleReceiptHtml(paperSize));
      doc.close();

      const win = frame.contentWindow;
      if (!win) return;
      try {
        win.focus();
        win.print();
      } catch {
        win.postMessage("print", "*");
      }
      toast.info("Print dialog opened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open print dialog");
    }
  };

  // Attempt to load through backend sample-receipt route to match server layout exactly
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    try {
      applyPaperSizeToDoc(frame.contentDocument, paperSize);
      win.focus();
      win.print();
      toast.info("Print dialog opened");
    } catch {
      try {
        win.postMessage("print", "*");
        toast.info("Print dialog opened");
      } catch {
        printFromHtml();
      }
    }
  };

  frame.onerror = () => {
    printFromHtml();
  };

  frame.src = `/api/v1/orders/sample-receipt?paperSize=${paperSize}&t=${Date.now()}`;
}
