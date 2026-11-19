import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeWebUrl, whatsappDigits, whatsappUrl } from "./outbound.ts";

test("only http(s) addresses are safe to open", () => {
  assert.equal(isSafeWebUrl("https://www.zomato.com/demo"), true);
  assert.equal(isSafeWebUrl("http://example.com"), true);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.io", "zomato.com", "", null, undefined]) {
    assert.equal(isSafeWebUrl(bad as string), false, String(bad));
  }
});

test("whatsapp numbers get a country code and are digits only", () => {
  assert.equal(whatsappDigits("9876543210"), "919876543210");
  assert.equal(whatsappDigits("+91 98765-43210"), "919876543210");
  assert.equal(whatsappDigits("09876543210"), "919876543210");
  assert.equal(whatsappDigits("0091 9876543210"), "919876543210");
  assert.equal(whatsappDigits("+1 415 555 2671"), "14155552671");
  assert.equal(whatsappDigits("12345"), null);
  assert.equal(whatsappDigits(""), null);
  assert.equal(whatsappDigits(null), null);
});

test("wa.me link encodes the message", () => {
  assert.equal(
    whatsappUrl("9876543210", "Hi Asha, you have 12 points & a free dessert!"),
    "https://wa.me/919876543210?text=Hi%20Asha%2C%20you%20have%2012%20points%20%26%20a%20free%20dessert!",
  );
  assert.equal(whatsappUrl("bad", "x"), null);
});
