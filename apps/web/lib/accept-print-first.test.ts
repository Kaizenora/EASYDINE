import assert from "node:assert/strict";
import { test } from "node:test";
import { isScheduledLater, kotPageVersion, printedButNotAcceptedMessage } from "./printer-routing.ts";

const NOW = Date.parse("2026-11-12T12:00:00Z");

test("print-first is skipped only for orders scheduled beyond the kitchen lead time", () => {
  assert.equal(isScheduledLater(null, NOW), false);
  assert.equal(isScheduledLater(undefined, NOW), false);
  assert.equal(isScheduledLater("2026-11-12T12:10:00Z", NOW), false); // within 25 min: tickets now
  assert.equal(isScheduledLater("2026-11-12T13:00:00Z", NOW), true);
  assert.equal(isScheduledLater("not a date", NOW), false);
});

test("a prefetched KOT page is tied to the order's lines", () => {
  const a = kotPageVersion([{ id: "i1", quantity: 2, status: "NEW" }]);
  assert.equal(a, kotPageVersion([{ id: "i1", quantity: 2, status: "NEW" }]));
  assert.notEqual(a, kotPageVersion([{ id: "i1", quantity: 3, status: "NEW" }]));
  assert.notEqual(a, kotPageVersion([{ id: "i1", quantity: 2, status: "NEW" }, { id: "i2", quantity: 1 }]));
  assert.equal(kotPageVersion(undefined), "");
});

test("printed but not accepted: staff are told what to do with the ticket", () => {
  assert.match(printedButNotAcceptedMessage("already", "This order was already accepted"), /duplicate.*discard/);
  assert.match(printedButNotAcceptedMessage("unconfirmed"), /could not be confirmed.*discard the second ticket/);
  const e = printedButNotAcceptedMessage("error", "Order not found");
  assert.match(e, /^Order NOT accepted: Order not found\./);
  assert.match(e, /not to cook/);
});
