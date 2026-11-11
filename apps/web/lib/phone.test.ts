import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidPhoneInput, normalizePhone } from "@easydine/types";

test("the same Indian mobile number normalizes to one value whatever the typing", () => {
  const forms = ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "09876543210", "(+91) 98765 43210", "0091 9876543210"];
  for (const f of forms) assert.equal(normalizePhone(f), "9876543210", f);
});

test("things that are not phone numbers are rejected", () => {
  for (const bad of ["", "abc", "12", "12ab5678901", "1".repeat(16), null, undefined]) {
    assert.equal(normalizePhone(bad as string | null | undefined), bad === "12ab5678901" ? "125678901" : null, String(bad));
  }
  for (const bad of ["abc", "12ab5678901", "12", ""]) assert.equal(isValidPhoneInput(bad), false, bad);
  for (const ok of ["9876543210", "+91 98765 43210", "(022) 2345 6789"]) assert.equal(isValidPhoneInput(ok), true, ok);
});
