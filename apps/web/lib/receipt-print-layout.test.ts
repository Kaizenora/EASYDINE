import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReceiptPrintLayout } from "./receipt-print-layout.ts";

const receipt = "<html><head><style>body{width:80mm}</style></head><body>bill content</body></html>";

test("keeps the existing narrow receipt layouts selectable", () => {
  for (const layout of ["58mm", "80mm"] as const) {
    const html = applyReceiptPrintLayout(receipt, layout);
    assert.ok(html.includes(`@page { size: ${layout} auto !important;`));
    assert.ok(html.includes(`html, body { width: ${layout} !important;`));
    assert.ok(html.includes("bill content"));
  }
});

test("supports a full-page A4 receipt layout", () => {
  const html = applyReceiptPrintLayout(receipt, "A4");
  assert.ok(html.includes("@page { size: A4 portrait !important;"));
  assert.ok(html.includes("max-width: 186mm"));
  assert.ok(html.includes("bill content"));
});

test("reports invalid receipt documents instead of printing the app page", () => {
  assert.throws(
    () => applyReceiptPrintLayout("<html><body>not a receipt document</body></html>", "80mm"),
    /Could not prepare the receipt document/,
  );
});
