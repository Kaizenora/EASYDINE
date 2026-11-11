import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTestBillHtml } from "./test-bill.ts";

test("builds a visibly synthetic bill without referencing an order or payment", () => {
  const html = buildTestBillHtml();
  assert.ok(html.includes("TEST BILL"));
  assert.ok(html.includes("NOT A SALE"));
  assert.ok(html.includes("Synthetic print check. No order or payment was created."));
  assert.ok(html.includes("Tax (included)"));
});
