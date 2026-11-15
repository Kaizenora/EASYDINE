// Parser & session tests with mocked transcripts. These do NOT exercise a microphone
// or a browser's speech engine; real-device recognition is tested separately.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUtteranceTracker,
  parseQuantityOnly,
  parseVoiceOrder,
  phoneticKey,
  RECOGNITION_LANG,
  transliterate,
  VoiceOrderSession,
  type VoiceAddLine,
  type VoiceMenuItem,
  type VoiceResult,
} from "./voice-order.ts";

const MENU: VoiceMenuItem[] = [
  { id: "pm", name: "Matar Paneer", price: "300.00" },
  { id: "pt", name: "Paneer Tikka", price: "280.00" },
  { id: "ptm", name: "Paneer Tikka Masala", price: "340.00" },
  { id: "bn", name: "Butter Naan", price: "60.00" },
  { id: "gn", name: "Garlic Naan", price: "70.00" },
  { id: "cgn", name: "Cheese Garlic Naan", price: "90.00" },
  { id: "cb", name: "Chicken Biryani", price: "320.00" },
  { id: "cm", name: "Chicken Masala", price: "220.00" },
  { id: "vb", name: "Veg Biryani", price: "240.00" },
  { id: "dm", name: "Dal Makhani", price: "260.00" },
  { id: "mc", name: "Masala Chaas", price: "80.00" },
  { id: "ls", name: "Lassi", price: "70.00" },
  { id: "cdp", name: "Chicken Do Pyaza", price: "360.00" },
  { id: "bis", name: "Bisleri", price: "20.00" },
  { id: "th", name: "Veg Thali", price: "250.00", needsChoice: true },
  { id: "gj", name: "Gulab Jamun", price: "90.00", available: false },
];

const adds = (r: VoiceResult[]) =>
  r
    .filter((x): x is Extract<VoiceResult, { kind: "add" }> => x.kind === "add")
    .map((x) => [x.itemId, x.quantity, x.note, x.variant]);

const kinds = (r: VoiceResult[]) => r.map((x) => x.kind);
const reasonOf = (x: VoiceResult) => (x.kind === "unavailable" ? x.reason : null);

// ----------------------------------------------------------------
// 7 MANDATORY UNIT TESTS
// ----------------------------------------------------------------

test("1. 'do matar paneer ek naan' -> 2 x Matar Paneer, 1 x Naan", () => {
  const r = parseVoiceOrder("do matar paneer ek naan", MENU);
  assert.equal(r.length, 2);
  assert.deepEqual(adds(r), [
    ["pm", 2, "", undefined],
    ["bn", 1, "", undefined],
  ]);
});

test("2. '2 plate chicken' -> 2 x Chicken dish (closest match)", () => {
  const r = parseVoiceOrder("2 plate chicken", MENU);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "add");
  if (r[0].kind === "add") {
    assert.equal(r[0].quantity, 2);
    // Matches Chicken Biryani (or Chicken Masala)
    assert.ok(["cb", "cm"].includes(r[0].itemId));
  }
});

test("3. 'ek half paneer' -> Half portion x 1 (never 0.5)", () => {
  const r = parseVoiceOrder("ek half paneer", MENU);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "add");
  if (r[0].kind === "add") {
    assert.equal(r[0].quantity, 1);
    assert.equal(r[0].variant, "Half");
  }

  // Also check session adds note with "Half portion" and qty 1
  const added: VoiceAddLine[] = [];
  const s = new VoiceOrderSession(MENU, (lines) => added.push(...lines));
  const res = s.processTranscript("ek half paneer");
  assert.equal(added.length, 1);
  assert.equal(added[0].quantity, 1);
  assert.equal(added[0].note, "Half portion");
  assert.equal(res.added[0].quantity, 1);
  assert.equal(res.added[0].variant, "Half");
});

test("4. 'teen lassi' -> 3 x Lassi", () => {
  const r = parseVoiceOrder("teen lassi", MENU);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "add");
  if (r[0].kind === "add") {
    assert.equal(r[0].itemId, "ls");
    assert.equal(r[0].quantity, 3);
  }
});

test("5. utterance with no quantity asks 'Kitne <dish>?' and accepts mic reply 'do'", () => {
  const added: VoiceAddLine[] = [];
  const s = new VoiceOrderSession(MENU, (lines) => added.push(...lines));

  // Customer says dish name with no quantity
  const out1 = s.processTranscript("cheese garlic naan", true, 0, 1000);
  assert.equal(out1.added.length, 0);
  assert.equal(out1.question, "Kitne Cheese Garlic Naan?");
  assert.equal(added.length, 0);

  // Customer answers on mic with only the quantity "do" (dish name not repeated)
  const out2 = s.processTranscript("do", true, 1, 2500);
  assert.equal(out2.added.length, 1);
  assert.equal(out2.added[0].name, "Cheese Garlic Naan");
  assert.equal(out2.added[0].quantity, 2);
  assert.equal(out2.question, null);
  assert.deepEqual(added, [{ itemId: "cgn", quantity: 2, note: "" }]);
});

test("6. two-dish utterance missing both quantities asks sequentially, correct dish each time", () => {
  const added: VoiceAddLine[] = [];
  const s = new VoiceOrderSession(MENU, (lines) => added.push(...lines));

  // Utterance has two dishes, neither specifies quantity
  const out1 = s.processTranscript("matar paneer, garlic naan", true, 0, 1000);
  assert.equal(out1.added.length, 0);
  assert.equal(out1.question, "Kitne Matar Paneer?");
  assert.equal(s.getPendingList().length, 2);

  // Customer answers first quantity on mic
  const out2 = s.processTranscript("do", true, 1, 3000);
  assert.equal(out2.added.length, 1);
  assert.equal(out2.added[0].itemId, "pm");
  assert.equal(out2.added[0].quantity, 2);
  assert.equal(out2.question, "Kitne Garlic Naan?");
  assert.equal(s.getPendingList().length, 1);

  // Customer answers second quantity on mic
  const out3 = s.processTranscript("teen", true, 2, 5000);
  assert.equal(out3.added.length, 1);
  assert.equal(out3.added[0].itemId, "gn");
  assert.equal(out3.added[0].quantity, 3);
  assert.equal(out3.question, null);
  assert.equal(s.getPendingList().length, 0);

  assert.deepEqual(added, [
    { itemId: "pm", quantity: 2, note: "" },
    { itemId: "gn", quantity: 3, note: "" },
  ]);
});

test("7. repeated interim transcript does not double-add", () => {
  const added: VoiceAddLine[] = [];
  const s = new VoiceOrderSession(MENU, (lines) => added.push(...lines));

  // Stream of interim results from Web Speech API
  s.processTranscript("do butter naan", false, 0, 100);
  s.processTranscript("do butter naan", false, 0, 200);
  assert.equal(added.length, 0);

  // Final result arrives
  s.processTranscript("do butter naan", true, 0, 300);
  assert.equal(added.length, 1);
  assert.equal(added[0].quantity, 2);

  // Duplicate final with same result index (e.g. re-emitted)
  s.processTranscript("do butter naan", true, 0, 400);
  assert.equal(added.length, 1);

  // Echo repetition of the identical utterance within the repeat window (e.g. 500ms later)
  s.processTranscript("do butter naan", true, 1, 800);
  assert.equal(added.length, 1);

  // Deliberate re-order later outside repeat window increments quantity
  s.processTranscript("aur ek butter naan", true, 2, 6000);
  assert.equal(added.length, 2);
  assert.equal(added[1].quantity, 1);
});

// ----------------------------------------------------------------
// ADDITIONAL ROBUSTNESS & SPEECH TESTS
// ----------------------------------------------------------------

test("locale drives the recognition language", () => {
  assert.deepEqual(RECOGNITION_LANG, { en: "en-IN", hi: "hi-IN", mr: "mr-IN" });
});

test("transliteration + phonetic keys line up spelling variants", () => {
  assert.equal(transliterate("मटर"), "matar");
  assert.equal(transliterate("पनीर"), "paniir");
  assert.equal(phoneticKey("paneer"), phoneticKey("पनीर"));
  assert.equal(phoneticKey("naan"), phoneticKey("नान"));
  assert.equal(phoneticKey("tikka"), phoneticKey("टिक्का"));
});

test("closest-match auto-add on spelling/pronunciation similarity ('mutter panir' -> 'Matar Paneer')", () => {
  const r = parseVoiceOrder("2 mutter panir", MENU);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "add");
  if (r[0].kind === "add") {
    assert.equal(r[0].itemId, "pm");
    assert.equal(r[0].name, "Matar Paneer");
    assert.equal(r[0].quantity, 2);
  }
});

test("no reasonable match gives not_found", () => {
  const r = parseVoiceOrder("two sushi", MENU);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "not_found");
});

test("Marathi full order with word quantities (दोन, एक)", () => {
  const r = parseVoiceOrder("दोन मटर पनीर, एक चिकन बिर्याणी", MENU);
  assert.deepEqual(adds(r), [
    ["pm", 2, "", undefined],
    ["cb", 1, "", undefined],
  ]);
});

test("Hindi word quantity + spoken cooking instruction goes to note", () => {
  const r = parseVoiceOrder("दो पनीर टिक्का मसाला कम तीखा", MENU);
  assert.deepEqual(adds(r), [["ptm", 2, "कम तीखा", undefined]]);
});

test("English instruction after separator attaches to dish note", () => {
  const r = parseVoiceOrder("one chicken biryani less spicy and no onion", MENU);
  assert.deepEqual(adds(r), [["cb", 1, "less spicy, no onion", undefined]]);
});

test("sold-out and needsChoice items report unavailable", () => {
  const r1 = parseVoiceOrder("one gulab jamun", MENU);
  assert.deepEqual(r1.map((x) => [x.kind, reasonOf(x)]), [["unavailable", "sold_out"]]);

  const r2 = parseVoiceOrder("one veg thali", MENU);
  assert.deepEqual(r2.map((x) => [x.kind, reasonOf(x)]), [["unavailable", "needs_choice"]]);
});

test("multipliers (X, into, times) parse exact single item quantity without splitting", () => {
  assert.deepEqual(adds(parseVoiceOrder("4 X chicken masala", MENU)), [["cm", 4, "", undefined]]);
  assert.deepEqual(adds(parseVoiceOrder("4 into chicken masala", MENU)), [["cm", 4, "", undefined]]);
  assert.deepEqual(adds(parseVoiceOrder("4 times chicken masala", MENU)), [["cm", 4, "", undefined]]);
  assert.deepEqual(adds(parseVoiceOrder("4 x 1 chicken masala", MENU)), [["cm", 4, "", undefined]]);
});

test("parseQuantityOnly standalone quantity parser", () => {
  assert.equal(parseQuantityOnly("do"), 2);
  assert.equal(parseQuantityOnly("2"), 2);
  assert.equal(parseQuantityOnly("two"), 2);
  assert.equal(parseQuantityOnly("teen"), 3);
  assert.equal(parseQuantityOnly("चार"), 4);
  assert.equal(parseQuantityOnly("ek plate"), 1);
  assert.equal(parseQuantityOnly("sirf do"), 2);
  assert.equal(parseQuantityOnly("char chahiye"), 4);
  assert.equal(parseQuantityOnly("cheese garlic naan"), null); // dish, not quantity
  assert.equal(parseQuantityOnly(""), null);
});
