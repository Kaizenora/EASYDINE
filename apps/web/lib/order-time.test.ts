import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatElapsed } from "./order-time.ts";

// The server stores/sends UTC instants; the same instant must read as the viewer's local clock time.
const INSTANT = "2026-11-11T15:30:00.000Z";

function inZone<T>(tz: string, run: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return run();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

test("a UTC instant is localised only at display time", () => {
  assert.equal(new Date(INSTANT).toISOString(), INSTANT);
  assert.match(inZone("Asia/Kolkata", () => formatClock(INSTANT, "en-US")), /^9:00\s?PM$/);
  assert.match(inZone("America/New_York", () => formatClock(INSTANT, "en-US")), /^10:30\s?AM$/);
  assert.match(inZone("UTC", () => formatClock(INSTANT, "en-US")), /^3:30\s?PM$/);
});

test("bad or missing timestamps render as empty, not NaN", () => {
  assert.equal(formatClock(null), "");
  assert.equal(formatClock("nonsense"), "");
  assert.equal(formatElapsed(undefined, Date.now()), "");
});

test("elapsed time is computed from the instant, independent of time zone", () => {
  const now = new Date("2026-11-11T17:40:00.000Z").getTime();
  assert.equal(formatElapsed(INSTANT, now), "2 h 10 min");
  assert.equal(formatElapsed("2026-11-11T17:39:30.000Z", now), "just now");
});
