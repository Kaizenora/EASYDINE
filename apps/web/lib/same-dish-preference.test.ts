import assert from "node:assert/strict";
import { test } from "node:test";
import { setCartLineNote, splitCartLine, type CartLine } from "../components/pos/cart-line.ts";
import { settleReceiptHtml } from "./settle-receipt.ts";

const paneer: CartLine = { key: "pm::::", menuItemId: "pm", name: "Paneer Mutter", unitPrice: 300, quantity: 2, modifierIds: [] };

test("2× the same dish can become 1× spicy + 1× buttery", () => {
  let lines = splitCartLine([paneer], "pm::::", 1);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => l.quantity), [1, 1]);
  assert.notEqual(lines[0].key, lines[1].key);
  lines = setCartLineNote(lines, lines[0].key, "spicy");
  lines = setCartLineNote(lines, lines[1].key, "buttery");
  assert.deepEqual(lines.map((l) => l.note), ["spicy", "buttery"]);
  // Total quantity and price are unchanged.
  assert.equal(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), 600);
});

test("a single portion is not split; an unknown line changes nothing", () => {
  const one = { ...paneer, quantity: 1 };
  assert.deepEqual(splitCartLine([one], one.key), [one]);
  assert.deepEqual(splitCartLine([paneer], "nope"), [paneer]);
});

test("preferences are capped at 120 characters", () => {
  const [l] = setCartLineNote([paneer], paneer.key, "x".repeat(300));
  assert.equal(l.note?.length, 120);
});

test("settle bill slip is bill-sized, never a full A4 page unless chosen", () => {
  const r = { billNumber: "20261112-0020", tableName: "Table 1", customerName: "Sid <b>", paymentMethod: "CASH", date: "04:19 pm", subtotal: "300.00", tax: "14.29", totalAmount: "300.00" };
  const h80 = settleReceiptHtml(r, "80mm");
  assert.match(h80, /@page\{size:80mm auto/);
  assert.match(h80, /TOTAL PAID/);
  assert.match(h80, /₹300\.00/);
  assert.match(h80, /Sid &lt;b&gt;/);
  assert.match(settleReceiptHtml(r, "58mm"), /@page\{size:58mm auto/);
  assert.match(settleReceiptHtml(r, "A4"), /size:A4/);
});
