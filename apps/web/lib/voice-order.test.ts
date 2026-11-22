import { test } from "node:test";
import assert from "node:assert/strict";
import { audioForm, spokenQuantity } from "./voice-order.ts";

test("spokenQuantity reads digits and number words in English, Hindi and Marathi", () => {
  assert.equal(spokenQuantity("3"), 3);
  assert.equal(spokenQuantity("३ प्लेट"), 3);
  assert.equal(spokenQuantity("teen"), 3);
  assert.equal(spokenQuantity("दो"), 2);
  assert.equal(spokenQuantity("दोन"), 2);
  assert.equal(spokenQuantity("two please"), 2);
});

test("spokenQuantity never guesses: nothing, vague or conflicting answers return null", () => {
  assert.equal(spokenQuantity(""), null);
  assert.equal(spokenQuantity("kuch"), null);
  assert.equal(spokenQuantity("haan"), null);
  assert.equal(spokenQuantity("2 ya 3"), null);
  assert.equal(spokenQuantity("0"), null);
  assert.equal(spokenQuantity("500"), null);
});

test("audioForm sends the blob as the 'audio' field", () => {
  const form = audioForm(new Blob(["x"], { type: "audio/webm;codecs=opus" }));
  const f = form.get("audio");
  assert.ok(f instanceof Blob);
  assert.equal((f as File).name, "speech.webm");
});
