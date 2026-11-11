import assert from "node:assert/strict";
import { test } from "node:test";
import { billQueryString, buildSampleReceiptHtml } from "./print.ts";

test("billQueryString encodes valid params and skips blanks", () => {
  const q = billQueryString({ discount: 10, note: "VIP", empty: "", zero: 0, none: undefined });
  assert.equal(q, "&discount=10&note=VIP");
});

test("buildSampleReceiptHtml renders 80mm layout with sample items and totals", () => {
  const html = buildSampleReceiptHtml("80mm");
  assert.ok(html.includes("TEST BILL"));
  assert.ok(html.includes("80mm auto"));
  assert.ok(html.includes("Paneer Butter Masala"));
  assert.ok(html.includes("514.50"));
});

test("buildSampleReceiptHtml renders 58mm layout with narrow page rules", () => {
  const html = buildSampleReceiptHtml("58mm");
  assert.ok(html.includes("TEST BILL"));
  assert.ok(html.includes("58mm auto"));
  assert.ok(html.includes("width: 54mm"));
});

test("buildSampleReceiptHtml renders A4 layout with full-page rules", () => {
  const html = buildSampleReceiptHtml("A4");
  assert.ok(html.includes("TEST BILL"));
  assert.ok(html.includes("size: A4 portrait"));
});
