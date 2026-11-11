import test from "node:test";
import assert from "node:assert/strict";
import { pollIntervalFor } from "./poll-interval.ts";

test("polls slowly only while the realtime socket is live", () => {
  assert.equal(pollIntervalFor("live", 2000, 10000), 10000);
  assert.equal(pollIntervalFor("connecting", 2000, 10000), 2000);
  assert.equal(pollIntervalFor("offline", 2000, 10000), 2000);
});
