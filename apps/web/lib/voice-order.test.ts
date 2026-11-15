// Parser tests with mocked transcripts. These do NOT exercise a microphone or
// a browser's speech engine; real-device recognition is tested separately.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUtteranceTracker,
  parseVoiceOrder,
  phoneticKey,
  RECOGNITION_LANG,
  transliterate,
  type VoiceMenuItem,
  type VoiceResult,
} from "./voice-order.ts";

const MENU: VoiceMenuItem[] = [
  { id: "pm", name: "Paneer Mutter", price: "300.00" },
  { id: "pt", name: "Paneer Tikka", price: "280.00" },
  { id: "ptm", name: "Paneer Tikka Masala", price: "340.00" },
  { id: "bn", name: "Butter Naan", price: "60.00" },
  { id: "gn", name: "Garlic Naan", price: "70.00" },
  { id: "cb", name: "Chicken Biryani", price: "320.00" },
  { id: "vb", name: "Veg Biryani", price: "240.00" },
  { id: "dm", name: "Dal Makhani", price: "260.00" },
  { id: "mc", name: "Masala Chaas", price: "80.00" },
  { id: "cdp", name: "Chicken Do Pyaza", price: "360.00" },
  { id: "th", name: "Veg Thali", price: "250.00", needsChoice: true },
  { id: "gj", name: "Gulab Jamun", price: "90.00", available: false },
];

const adds = (r: VoiceResult[]) =>
  r.filter((x): x is Extract<VoiceResult, { kind: "add" }> => x.kind === "add").map((x) => [x.itemId, x.quantity, x.note]);
const kinds = (r: VoiceResult[]) => r.map((x) => x.kind);
const reasonOf = (x: VoiceResult) => (x.kind === "unavailable" ? x.reason : null);
const optionIds = (x: VoiceResult) => new Set(x.kind === "choose" ? x.options.map((o) => o.itemId) : []);

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

test("Marathi full order with word quantities (दोन, एक) and reversed word order", () => {
  const r = parseVoiceOrder("दोन मटर पनीर, एक चिकन बिर्याणी", MENU);
  assert.deepEqual(adds(r), [["pm", 2, ""], ["cb", 1, ""]]);
});

test("English order with digit quantities", () => {
  const r = parseVoiceOrder("2 butter naan, 1 paneer tikka", MENU);
  assert.deepEqual(adds(r), [["bn", 2, ""], ["pt", 1, ""]]);
});

test("Hindi word quantity + spoken instruction goes to the cooking note", () => {
  const r = parseVoiceOrder("दो पनीर टिक्का मसाला कम तीखा", MENU);
  assert.deepEqual(adds(r), [["ptm", 2, "कम तीखा"]]);
});

test("Marathi instruction (तिखट नको) and Devanagari dish names", () => {
  const r = parseVoiceOrder("एक दाल मखनी तिखट नको", MENU);
  assert.deepEqual(adds(r), [["dm", 1, "तिखट नको"]]);
});

test("English instruction after a separator attaches to the dish before it", () => {
  const r = parseVoiceOrder("one chicken biryani less spicy and no onion", MENU);
  assert.deepEqual(adds(r), [["cb", 1, "less spicy, no onion"]]);
});

test("Devanagari digits and English words spoken in Devanagari script", () => {
  const r = parseVoiceOrder("२ बटर नान", MENU);
  assert.deepEqual(adds(r), [["bn", 2, ""]]);
});

test("spelling variants (mutter / matar) are matched", () => {
  assert.deepEqual(adds(parseVoiceOrder("three mutter paneer", MENU)), [["pm", 3, ""]]);
  assert.deepEqual(adds(parseVoiceOrder("three paneer matar", MENU)), [["pm", 3, ""]]);
});

test("near-name dishes: the exact name wins only when it explains every word", () => {
  assert.deepEqual(adds(parseVoiceOrder("one paneer tikka", MENU)), [["pt", 1, ""]]);
  assert.deepEqual(adds(parseVoiceOrder("one paneer tikka masala", MENU)), [["ptm", 1, ""]]);
});

test("ambiguous dish -> customer chooses, nothing added, quantity kept", () => {
  const r = parseVoiceOrder("two paneer", MENU);
  assert.deepEqual(kinds(r), ["choose"]);
  const c = r[0] as Extract<VoiceResult, { kind: "choose" }>;
  assert.equal(c.quantity, 2);
  assert.deepEqual(new Set(c.options.map((o) => o.itemId)), new Set(["pm", "pt", "ptm"]));
});

test("no quantity said means one", () => {
  assert.deepEqual(adds(parseVoiceOrder("butter naan", MENU)), [["bn", 1, ""]]);
  assert.deepEqual(adds(parseVoiceOrder("एक बटर नान, दाल मखनी", MENU)), [["bn", 1, ""], ["dm", 1, ""]]);
});

test("a word only one dish has is enough (no confirmation)", () => {
  assert.deepEqual(adds(parseVoiceOrder("two dal", MENU)), [["dm", 2, ""]]);
  assert.deepEqual(adds(parseVoiceOrder("one makhani", MENU)), [["dm", 1, ""]]);
  assert.deepEqual(adds(parseVoiceOrder("एक छाछ", MENU)), [["mc", 1, ""]]);
});

test("whole name heard plus an unknown word is still added", () => {
  assert.deepEqual(adds(parseVoiceOrder("one butter naan kadak", MENU)), [["bn", 1, ""]]);
});

test("words several dishes share still ask", () => {
  assert.equal(parseVoiceOrder("one biryani", MENU)[0].kind, "choose");
  assert.equal(parseVoiceOrder("one naan", MENU)[0].kind, "choose");
});

test("vague quantity ('some') -> ask", () => {
  assert.deepEqual(kinds(parseVoiceOrder("some garlic naan", MENU)), ["quantity"]);
});

test("Hindi trailing दो (also means 'give') is not taken as a quantity", () => {
  assert.deepEqual(adds(parseVoiceOrder("पनीर मटर दो", MENU)), [["pm", 1, ""]]);
});

test("item not on the menu is explained, nothing added", () => {
  const r = parseVoiceOrder("two pizza", MENU);
  assert.deepEqual(r.map((x) => [x.kind, reasonOf(x)]), [["unavailable", "not_on_menu"]]);
});

test("sold-out item is explained, nothing added", () => {
  const r = parseVoiceOrder("one gulab jamun", MENU);
  assert.deepEqual(r.map((x) => [x.kind, reasonOf(x)]), [["unavailable", "sold_out"]]);
});

test("item that needs an options choice is explained, nothing added", () => {
  const r = parseVoiceOrder("one veg thali", MENU);
  assert.deepEqual(r.map((x) => [x.kind, reasonOf(x)]), [["unavailable", "needs_choice"]]);
});

test("size/variant words and extras are explained, nothing added", () => {
  assert.equal(reasonOf(parseVoiceOrder("half chicken biryani", MENU)[0]), "variant");
  assert.equal(reasonOf(parseVoiceOrder("one butter naan with extra cheese", MENU)[0]), "modifier");
  assert.deepEqual(adds(parseVoiceOrder("one butter naan with extra cheese", MENU)), []);
});

test("extra spicy is an instruction, not an extra", () => {
  assert.deepEqual(adds(parseVoiceOrder("one veg biryani extra spicy", MENU)), [["vb", 1, "extra spicy"]]);
});

test("cut-off transcript asks instead of adding", () => {
  const r = parseVoiceOrder("2 butter na", MENU);
  assert.deepEqual(adds(r), []);
  assert.equal(r[0].kind, "choose");
  const r2 = parseVoiceOrder("एक चिकन", MENU);
  assert.equal(r2[0].kind, "choose");
  assert.deepEqual(optionIds(r2[0]), new Set(["cb", "cdp"]));
});

test("number word that is part of a dish name stays in the name", () => {
  assert.deepEqual(adds(parseVoiceOrder("one chicken do pyaza", MENU)), [["cdp", 1, ""]]);
});

test("repeated phrase from recognition collapses to one line", () => {
  assert.deepEqual(adds(parseVoiceOrder("two butter naan two butter naan", MENU)), [["bn", 2, ""]]);
});

test("unclear fragments are skipped, never added", () => {
  const r = parseVoiceOrder("mmm, two butter naan", MENU);
  assert.deepEqual(adds(r), [["bn", 2, ""]]);
  assert.ok(r.every((x) => x.kind === "add" || x.kind === "skipped"));
});

test("prices always come from the menu", () => {
  const r = parseVoiceOrder("2 butter naan", MENU)[0];
  assert.equal(r.kind === "add" ? r.unitPrice : null, 60);
});

test("quantity above the limit is asked again", () => {
  assert.deepEqual(kinds(parseVoiceOrder("99 butter naan", MENU)), ["quantity"]);
});

test("Hindi quantity words (तीन) with a Devanagari drink name", () => {
  assert.deepEqual(adds(parseVoiceOrder("तीन मसाला छाछ", MENU)), [["mc", 3, ""]]);
});

test("empty transcript or empty menu gives nothing", () => {
  assert.deepEqual(parseVoiceOrder("   ", MENU), []);
  assert.deepEqual(parseVoiceOrder("two butter naan", []), []);
});

test("utterance tracker: interim ignored, indices once, Android cumulative results, echoes", () => {
  const u = createUtteranceTracker(4000);
  assert.equal(u.accept(0, "two butter naan", false, 0), null); // interim
  assert.equal(u.accept(0, "two butter naan", true, 100), "two butter naan");
  assert.equal(u.accept(0, "two butter naan", true, 200), null); // same index again
  // Android: the next final repeats everything said so far
  assert.equal(u.accept(1, "two butter naan one paneer tikka", true, 900), "one paneer tikka");
  // an echo of the same phrase a moment later (new session) is ignored...
  u.reset();
  assert.equal(u.accept(0, "One paneer tikka.", true, 1500), null);
  // ...but saying it again later is a real new order
  assert.equal(u.accept(1, "one paneer tikka", true, 9000), "one paneer tikka");
});
