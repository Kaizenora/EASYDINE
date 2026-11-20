import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LOCALES, LOCALE_LABELS, resolveInitialLocale } from "./i18n/locales.ts";

const dict = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`./i18n/dictionaries/${code}.json`, import.meta.url), "utf8"));

test("only English, Hindi and Marathi are offered", () => {
  assert.deepEqual([...LOCALES], ["en", "hi", "mr"]);
  assert.deepEqual(Object.keys(LOCALE_LABELS).sort(), ["en", "hi", "mr"]);
});

test("a saved Spanish or French choice falls back to English, whatever the browser says", () => {
  assert.equal(resolveInitialLocale("es", ["hi-IN"]), "en");
  assert.equal(resolveInitialLocale("fr", ["mr-IN"]), "en");
  assert.equal(resolveInitialLocale("de"), "en");
});

test("a saved supported choice wins; otherwise the browser language, else English", () => {
  assert.equal(resolveInitialLocale("mr", ["en-GB"]), "mr");
  assert.equal(resolveInitialLocale(null, ["hi-IN", "en"]), "hi");
  assert.equal(resolveInitialLocale(null, ["es-ES", "fr-FR"]), "en");
  assert.equal(resolveInitialLocale(null, []), "en");
});

test("Hindi and Marathi translate every English key with the same placeholders", () => {
  const en = dict("en");
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
  for (const code of ["hi", "mr"]) {
    const d = dict(code);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), `${code} keys`);
    for (const [k, v] of Object.entries(en)) {
      assert.ok(d[k].trim().length > 0, `${code} ${k} empty`);
      assert.deepEqual(vars(d[k]), vars(v), `${code} ${k} placeholders`);
    }
  }
});
