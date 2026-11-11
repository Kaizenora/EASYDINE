export type ReceiptPrintLayout = "58mm" | "80mm" | "A4";

const LAYOUT_KEY = "easydine.receiptPrintLayout";

export function isReceiptPrintLayout(value: string): value is ReceiptPrintLayout {
  return value === "58mm" || value === "80mm" || value === "A4";
}

export function getReceiptPrintLayout(): ReceiptPrintLayout {
  if (typeof window === "undefined") return "80mm";
  try {
    const saved = window.localStorage.getItem(LAYOUT_KEY);
    return saved && isReceiptPrintLayout(saved) ? saved : "80mm";
  } catch {
    return "80mm";
  }
}

export function saveReceiptPrintLayout(layout: ReceiptPrintLayout): void {
  window.localStorage.setItem(LAYOUT_KEY, layout);
}

export function applyReceiptPrintLayout(
  html: string,
  layout: ReceiptPrintLayout,
): string {
  const css =
    layout === "A4"
      ? `
        @page { size: A4 portrait !important; margin: 12mm !important; }
        html, body { width: auto !important; max-width: none !important; }
        body { padding: 0 !important; }
        .receipt { width: 100% !important; max-width: 186mm !important; margin: 0 auto !important; }
      `
      : `
        @page { size: ${layout} auto !important; margin: 0 !important; }
        html, body { width: ${layout} !important; max-width: ${layout} !important; }
        .receipt { width: 100% !important; }
      `;
  const style = `<style id="easydine-receipt-print-layout">${css}</style>`;
  const headEnd = html.search(/<\/head\s*>/i);
  if (headEnd < 0) {
    throw new Error("Could not prepare the receipt document for the selected paper layout.");
  }
  return `${html.slice(0, headEnd)}${style}${html.slice(headEnd)}`;
}
