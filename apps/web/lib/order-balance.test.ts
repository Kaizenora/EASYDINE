import assert from "node:assert/strict";
import { test } from "node:test";
import { amountPaidSoFar, amountToCollect } from "./order-balance.ts";

test("an unpaid order collects its full total", () => {
  assert.equal(amountToCollect({ totalAmount: "1040", payments: [] }), 1040);
  assert.equal(amountToCollect({ totalAmount: "1040" }), 1040);
});

test("a part-paid order only collects what is left, never the total again", () => {
  const order = { totalAmount: "1040", payments: [{ amount: "400" }, { amount: "140.50" }] };
  assert.equal(amountPaidSoFar(order), 540.5);
  assert.equal(amountToCollect(order), 499.5);
});

test("the server's bill preview wins (tax on top, charges, offers)", () => {
  // tax-exclusive branch: the order row holds 1000, the bill is 1050
  assert.equal(amountToCollect({ totalAmount: "1000", payments: [] }, { balanceDue: 1050 }), 1050);
  assert.equal(amountToCollect({ totalAmount: "1000", payments: [{ amount: "500" }] }, { balanceDue: 550 }), 550);
});

test("never negative and tolerant of missing figures", () => {
  assert.equal(amountToCollect({ totalAmount: "100", payments: [{ amount: "150" }] }), 0);
  assert.equal(amountToCollect({ totalAmount: null, payments: null }), 0);
  assert.equal(amountToCollect({ totalAmount: "abc" }, { balanceDue: null }), 0);
  assert.equal(amountToCollect({ totalAmount: "0.1", payments: [{ amount: "0.2" }] }, undefined), 0);
});

test("money is rounded to paise, not left with float noise", () => {
  assert.equal(amountToCollect({ totalAmount: "0.3", payments: [{ amount: "0.1" }] }), 0.2);
});
