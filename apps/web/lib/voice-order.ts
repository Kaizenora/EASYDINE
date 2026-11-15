// Voice ordering for the guest QR menu: turns a speech transcript (English,
// Hindi or Marathi, from the browser's Web Speech API) into proposed cart
// lines, matched against ONLY this restaurant's loaded menu.
//
// A wrong add is worse than asking, but asking too often is frustrating, so:
// an item is added when exactly one dish on THIS menu fits what was said
// (the full name, or words that only one dish has). A missing quantity means
// one. The guest is asked only when several dishes fit equally well, and
// told when a dish is not on the menu, sold out, or needs options picked on
// screen. Prices always come from the menu, never from speech.

export type VoiceLocale = "en" | "hi" | "mr";

/** The app's locale drives the recognition language (no auto-detection). */
export const RECOGNITION_LANG: Record<VoiceLocale, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export interface VoiceMenuItem {
  id: string;
  name: string;
  price: string | number;
  category?: string;
  /** false = sold out. The public menu omits inactive items, so this is usually undefined. */
  available?: boolean;
  /** true when the item has a required option (size/variant) the guest must pick on screen. */
  needsChoice?: boolean;
}

export interface VoiceOption {
  itemId: string;
  name: string;
  unitPrice: number;
}

export interface VoiceAddLine {
  itemId: string;
  quantity: number;
  note: string;
}

export type VoiceResult =
  | {
      kind: "add";
      heard: string;
      itemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      variant?: string;
      note: string;
    }
  | {
      kind: "ask_quantity";
      heard: string;
      itemId: string;
      name: string;
      unitPrice: number;
      variant?: string;
      note: string;
      question: string;
    }
  | {
      kind: "quantity_only";
      heard: string;
      quantity: number;
    }
  | {
      kind: "not_found";
      heard: string;
    }
  | {
      kind: "unavailable";
      heard: string;
      reason: "not_on_menu" | "sold_out" | "needs_choice" | "modifier";
      itemId?: string;
      name?: string;
    }
  | { kind: "skipped"; heard: string; pendingQty?: number };

const MAX_QTY = 20;

// ---------------------------------------------------------------- numbers
const DEV_DIGITS = "०१२३४५६७८९";
const NUMBER_WORDS: Record<string, number> = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, a: 1, an: 1, single: 1, dozen: 12,
  // Hindi (Devanagari + common romanisations)
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "छे": 6, "सात": 7,
  "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12,
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  // Marathi
  "दोन": 2, "पाच": 5, "सहा": 6, "नऊ": 9, "दहा": 10, "अकरा": 11, "बारा": 12,
  don: 2, paach: 5, saha: 6, daha: 10,
};
/** Words that ask for an amount without giving one: ask the guest. */
const VAGUE_QTY = new Set(["couple", "few", "some", "kuch", "कुछ", "थोड़ा", "थोडा", "थोडे", "काही", "बहुत", "खूप"]);

function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
}

function numberOf(tok: string): number | null {
  const t = tok.replace(/^x(?=\d)|(?<=\d)x$/g, "");
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10);
  return NUMBER_WORDS[t] ?? null;
}

// ---------------------------------------------------------------- separators, fillers
const SEPARATORS = new Set([",", "and", "plus", "then", "also", "और", "aur", "फिर", "आणि", "ani", "व", "तसेच", "अजून"]);
export const MULTIPLIERS = new Set([
  "x", "X", "ex", "eks", "into", "times", "cross", "by", "star", "multiply", "multiplied",
  "गुना", "गुणा", "पट", "वेळा", "बार", "guna", "pat", "vela",
]);
const FILLERS = new Set([
  // English
  "i", "want", "would", "like", "please", "give", "me", "get", "us", "order", "the", "of", "plate", "plates",
  "piece", "pieces", "portion", "portions", "serving", "servings", "can", "have", "need", "we", "for", "bring",
  "just", "okay", "ok", "um", "uh", "hmm", "it", "that", "this", "nos", "number", "glass", "glasses", "bowl", "bowls",
  "wala", "wali", "wale", "one's", "ones", "item", "items", "dish", "dishes",
  "x", "ex", "into", "times", "cross", "by", "star", "multiply",
  // Hindi
  "मुझे", "हमें", "चाहिए", "दीजिए", "दीजिये", "दे", "देना", "दो", "लाओ", "लाना", "लाइए", "प्लेट", "प्लीज", "प्लीज़", "भी",
  "कृपया", "का", "की", "के", "को", "एक्स", "गिलास", "बाउल", "पीस", "बस", "और", "ठीक", "है", "हाँ", "हां",
  "गुना", "गुणा", "बार",
  "mujhe", "chahiye", "dijiye", "lao", "bhi", "ka", "ki", "ke", "वाला", "वाली", "वाले", "आइटम", "guna",
  // Marathi
  "मला", "आम्हाला", "हवे", "हवा", "हवी", "हवेत", "द्या", "द्यावा", "द्यावी", "पाहिजे", "पाहिजेत", "करा", "पण", "आणा",
  "ग्लास", "प्लेट्स", "ना", "हो", "पट", "वेळा", "mala", "have", "dya", "pat", "vela",
]);

// ---------------------------------------------------------------- spoken instructions -> cooking note
// Matched as phrases on the spoken text. Kept as the guest said them.
const INSTRUCTIONS = [
  // English
  "less spicy", "not spicy", "not too spicy", "no spice", "non spicy", "mild", "medium spicy", "extra spicy", "more spicy",
  "very spicy", "spicy", "no onion", "without onion", "no onions", "without onions", "no garlic", "without garlic",
  "jain", "less oil", "no oil", "less salt", "no salt", "well done", "no ice", "less ice", "less sugar", "no sugar",
  "without sugar", "less sweet", "extra hot", "piping hot", "no cream", "less butter",
  // Hindi
  "कम तीखा", "कम तीखी", "कम मिर्च", "तीखा कम", "कम मसाला", "मसाला कम", "ज्यादा तीखा", "ज़्यादा तीखा", "ज्यादा मसाला",
  "बिना प्याज", "बिना प्याज़", "प्याज नहीं", "बिना लहसुन", "लहसुन नहीं", "जैन", "कम तेल", "तेल कम", "कम नमक",
  "बिना चीनी", "कम चीनी", "चीनी कम", "बिना बर्फ", "kam teekha", "kam tikha", "kam mirch", "bina pyaz", "bina pyaaz",
  // Marathi
  "तिखट नको", "कमी तिखट", "तिखट कमी", "जास्त तिखट", "कांदा नको", "कांदे नको", "लसूण नको", "तेल कमी", "कमी तेल",
  "मीठ कमी", "कमी मीठ", "साखर कमी", "कमी साखर", "साखर नको", "बर्फ नको", "tikhat nako", "kami tikhat", "kanda nako",
].sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);

/** Asking for extras/add-ons: not supported by voice (pick them on screen). */
const MODIFIER_MARKERS = new Set(["extra", "add", "with", "double", "topping", "toppings", "एक्स्ट्रा", "अतिरिक्त", "साथ", "सोबत", "जास्त", "ज्यादा", "ज़्यादा"]);
export const VARIANT_MAP: Record<string, string> = {
  half: "Half",
  haaf: "Half",
  haf: "Half",
  "हाफ": "Half",
  "आधा": "Half",
  "आधी": "Half",
  "अर्धा": "Half",
  "अर्धी": "Half",
  full: "Full",
  ful: "Full",
  "फुल": "Full",
  "पूरा": "Full",
  "पूर्ण": "Full",
};

// ---------------------------------------------------------------- Devanagari -> Latin (approximate, for matching only)
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
};
const NUKTA: Record<string, string> = { "क": "k", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ॲ": "e",
};
const MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};

export function transliterate(word: string): string {
  let out = "";
  let lastInherent = -1;
  const ch = [...word];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (CONS[c]) {
      let base = CONS[c];
      if (ch[i + 1] === "़") {
        base = NUKTA[c] ?? base;
        i++;
      }
      out += base;
      const nx = ch[i + 1];
      if (nx && MATRAS[nx]) {
        out += MATRAS[nx];
        i++;
      } else if (nx === "्") {
        i++;
      } else {
        out += "a";
        lastInherent = out.length - 1;
      }
    } else if (VOWELS[c]) out += VOWELS[c];
    else if (c === "ं" || c === "ँ") out += "n";
    else if (c === "ः") out += "h";
    else if (/[a-z0-9]/.test(c)) out += c;
  }
  // Schwa deletion: a final inherent "a" is silent (मटर -> matar, not matara).
  if (lastInherent === out.length - 1 && out.length > 2) out = out.slice(0, -1);
  return out;
}

export const IS_DEV = /[ऀ-ॿ]/;

/** A spelling-insensitive key: mutter/matar, paneer/panir, naan/nan, chicken/chikan... */
export function phoneticKey(raw: string): string {
  let w = (IS_DEV.test(raw) ? transliterate(raw) : raw).toLowerCase().replace(/[^a-z]/g, "");
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1); // naans, rotis
  w = w
    .replace(/ph/g, "f").replace(/chh/g, "C").replace(/ch/g, "C").replace(/sh/g, "s").replace(/th/g, "t")
    .replace(/dh/g, "d").replace(/bh/g, "b").replace(/gh/g, "g").replace(/kh/g, "k").replace(/jh/g, "j")
    .replace(/ck/g, "k").replace(/q/g, "k").replace(/c/g, "k").replace(/C/g, "c").replace(/w/g, "v")
    .replace(/z/g, "j").replace(/x/g, "ks")
    .replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/aa/g, "a").replace(/(.)\1+/g, "$1");
  if (w.length > 2) w = w.replace(/y$/, "i");
  return w;
}

function skeleton(key: string): string {
  return key ? key[0] + key.slice(1).replace(/[aeiouy]/g, "") : "";
}

// Common spelling/script variants of dish words. These make a word a CANDIDATE
// match only; the decision rules below still require a single clear winner.
const ALIAS_GROUPS = [
  ["paneer", "panir", "paner", "पनीर"], ["matar", "mutter", "mattar", "muttar", "मटर"],
  ["biryani", "biriyani", "briyani", "biriani", "बिर्याणी", "बिरयानी", "बिरियानी"], ["naan", "nan", "नान"],
  ["roti", "रोटी"], ["chicken", "chiken", "चिकन"], ["mutton", "matan", "मटन", "मटण"],
  ["veg", "vej", "वेज", "व्हेज", "vegetable"], ["dal", "daal", "दाल", "डाळ"], ["butter", "बटर"],
  ["tikka", "टिक्का", "टिका"], ["masala", "मसाला"], ["lassi", "लस्सी"], ["tea", "chai", "चाय", "चहा"],
  ["coffee", "कॉफी", "कॉफ़ी"], ["egg", "anda", "अंडा", "अंडे", "अंडी"], ["rice", "chawal", "चावल", "भात"],
  ["fried", "फ्राइड", "फ्राईड"], ["kulcha", "कुलचा"], ["paratha", "parantha", "पराठा", "पराठे"],
  ["thali", "थाली", "थाळी"], ["soda", "सोडा"], ["lime", "nimbu", "नींबू", "लिंबू"], ["cold", "कोल्ड"],
  ["spring", "स्प्रिंग"], ["roll", "रोल"], ["gobi", "gobhi", "गोबी", "गोभी"], ["aloo", "alu", "आलू", "बटाटा"],
  ["jeera", "jira", "जीरा", "जिरा"], ["kadai", "kadhai", "कढ़ाई", "कढाई"], ["korma", "कोरमा"], ["shahi", "शाही"],
  ["makhani", "मखनी", "मक्खनी"], ["tandoori", "तंदूरी", "तंदुरी"], ["chilli", "chili", "चिली"],
  ["manchurian", "मंचूरियन", "मंच्युरियन"], ["noodles", "नूडल्स"], ["pulao", "pulav", "पुलाव"], ["kheer", "खीर"],
  ["gulab", "गुलाब"], ["jamun", "जामुन"], ["ice", "आइस"], ["cream", "क्रीम"], ["mango", "aam", "आम", "आंबा"],
  ["chaas", "chhaas", "chaach", "छाछ", "ताक"], ["spicy", "तीखा"], ["sweet", "स्वीट"], ["fish", "मछली", "मासे"],
  ["prawns", "prawn", "कोळंबी", "झींगा"], ["soup", "सूप"], ["salad", "सलाद", "सॅलड"], ["sandwich", "सैंडविच", "सँडविच"],
  ["pizza", "पिज़्ज़ा", "पिझ्झा"], ["burger", "बर्गर"], ["fries", "फ्राइज़"], ["mojito", "मोहितो"], ["cola", "कोला"],
  ["cheese", "चीज", "चीज़"], ["garlic", "lahsun", "lasun", "लहसुन", "लसूण"],
  ["bisleri", "water", "mineral", "paani", "पानी", "बिसलेरी"], ["curd", "dahi", "दही"],
  ["raita", "रायता"], ["papad", "पापड़", "पापड", "पापडा"], ["chole", "chhole", "छोले", "चना", "chana"],
  ["pav", "पाव"], ["bhaji", "भाजी"], ["dosa", "dhosa", "डोसा"], ["idli", "इडली"],
  ["sambar", "sambhar", "सांभर"], ["vada", "wada", "वडा", "बड़ा"], ["kebab", "kabab", "kebabs", "kababs", "कबाब"],
  ["margherita", "margerita", "मार्गेरिटा"], ["pasta", "पास्ता"], ["hakka", "हक्का"],
  ["schezwan", "shezwan", "सेजवान", "शेजवान"], ["crispy", "क्रिस्पी"],
];
const ALIAS = new Map<string, string>();
for (const g of ALIAS_GROUPS) {
  const canon = phoneticKey(g[0]);
  for (const v of g) ALIAS.set(phoneticKey(v), canon);
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** How well one spoken word matches one menu-name word (0 = no match). */
export function wordScore(spoken: string, menuWord: string): number {
  const a = phoneticKey(spoken);
  const b = phoneticKey(menuWord);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ca = ALIAS.get(a) ?? a;
  const cb = ALIAS.get(b) ?? b;
  if (ca === cb) return 0.9;
  const sa = skeleton(ca);
  if (sa.length >= 3 && sa === skeleton(cb)) return 0.85;
  if (Math.min(ca.length, cb.length) >= 5 && lev(ca, cb) <= 1) return 0.7; // near, not confident
  return 0;
}

// ---------------------------------------------------------------- segmentation
interface Segment {
  heard: string[];
  qty: number | null;
  qtyVague: boolean;
  words: string[];
  notes: string[];
  modifier: boolean;
  variant: string | null;
}

function normalise(t: string): string {
  return toAsciiDigits(t.toLowerCase())
    .replace(/[।॥.;!?]/g, " , ")
    .replace(/,/g, " , ")
    .replace(/[^\p{L}\p{M}\p{N}\s,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INSTRUCTION_TOKENS = INSTRUCTIONS.map((p) => p.split(" "));

function pullInstructions(text: string): { rest: string; notes: string[] } {
  const toks = text ? text.split(" ") : [];
  const notes: string[] = [];
  let end = toks.length;
  while (end > 0) {
    let hit = 0;
    for (const p of INSTRUCTION_TOKENS) {
      if (p.length <= end && p.every((w, k) => toks[end - p.length + k] === w)) {
        hit = p.length;
        break; // INSTRUCTIONS is sorted longest-first
      }
    }
    if (hit) {
      notes.unshift(toks.splice(end - hit, hit).join(" "));
      end -= hit;
    } else end--;
  }
  return { rest: toks.join(" "), notes };
}

function splitSegments(transcript: string, menuWordKeys: Set<string>): Segment[] {
  const segs: Segment[] = [];
  const fresh = (): Segment => ({ heard: [], qty: null, qtyVague: false, words: [], notes: [], modifier: false, variant: null });
  const chunks = normalise(transcript)
    .split(/\s*,\s*/)
    .flatMap((c) => c.split(new RegExp(`\\s+(?:${[...SEPARATORS].filter((s) => s !== ",").join("|")})\\s+`)));
  for (const chunk of chunks) {
    const { rest, notes } = pullInstructions(chunk);
    let cur = fresh();
    cur.notes.push(...notes);
    cur.heard.push(chunk);
    const toks = rest ? rest.split(" ") : [];
    let prevWasMultiplier = false;
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      if (MULTIPLIERS.has(tok)) {
        prevWasMultiplier = true;
        continue;
      }
      const n = numberOf(tok);
      const isWordNumber = n !== null && !/^\d/.test(tok);
      const more = toks.slice(i + 1).some((t) => !FILLERS.has(t) && !MULTIPLIERS.has(t) && numberOf(t) === null);
      // "chicken do pyaza": a number word inside a dish name stays a word
      if (isWordNumber && more && cur.words.length > 0 && menuWordKeys.has(phoneticKey(tok))) {
        cur.words.push(tok);
        prevWasMultiplier = false;
        continue;
      }
      if (n !== null) {
        if (cur.words.length === 0) {
          if (cur.qty === null) {
            cur.qty = n;
          } else if (prevWasMultiplier || n === 1 || cur.qty === 1) {
            // e.g. "4 x 1", "4 into 1", "4 1", "1 x 4" -> keep 4
            if (n === 1) {
              // 4 x 1 -> 4
            } else if (cur.qty === 1) {
              // 1 x 4 -> 4
              cur.qty = n;
            } else {
              cur.qty = cur.qty * n;
            }
          }
          prevWasMultiplier = false;
          continue;
        }
        if (!more) {
          // trailing number: "paneer tikka two" -> postfix qty; Hindi "... दो" (give) -> ignore
          if (cur.qty === null && !["दो", "do", "दे"].includes(tok)) cur.qty = n;
          prevWasMultiplier = false;
          continue;
        }
        segs.push(cur);
        cur = fresh();
        cur.heard.push(chunk);
        cur.qty = n;
        prevWasMultiplier = false;
        continue;
      }
      if (VAGUE_QTY.has(tok)) {
        cur.qtyVague = true;
        prevWasMultiplier = false;
        continue;
      }
      if (VARIANT_MAP[tok]) {
        cur.variant = VARIANT_MAP[tok];
        prevWasMultiplier = false;
        continue;
      }
      if (MODIFIER_MARKERS.has(tok)) {
        cur.modifier = true;
        prevWasMultiplier = false;
        continue;
      }
      if (FILLERS.has(tok)) {
        prevWasMultiplier = false;
        continue;
      }
      cur.words.push(tok);
      prevWasMultiplier = false;
    }
    segs.push(cur);
  }
  // Instruction-only segment ("... and no onion") belongs to the dish before it.
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.words.length === 0 && s.qty === null && s.notes.length && out.length) out[out.length - 1].notes.push(...s.notes);
    else if (s.words.length || s.qty !== null || s.notes.length) out.push(s);
  }
  // Repeated recognition ("two naan two naan") collapses to one.
  return out.filter((s, i) => i === 0 || sig(s) !== sig(out[i - 1]));
}

function sig(s: Segment): string {
  return `${s.qty}|${s.words.map(phoneticKey).join(" ")}|${s.notes.join(",")}`;
}

// ---------------------------------------------------------------- matching
interface Scored {
  item: VoiceMenuItem;
  score: number;
  full: boolean; // every word of the dish name was heard (strongly)
  usedAll: boolean; // every spoken dish word is explained by this dish
  covers: boolean; // every spoken dish word strongly matches a word of this dish
}

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w) && w !== "and" && w !== "with");
}

function scoreItem(words: string[], item: VoiceMenuItem): Scored {
  const nw = nameWords(item.name);
  const used = new Set<number>();
  const strongUsed = new Set<number>();
  let total = 0;
  let strong = 0;
  for (const m of nw) {
    let best = 0;
    let bi = -1;
    words.forEach((w, i) => {
      if (used.has(i)) return;
      const sc = wordScore(w, m);
      if (sc > best) {
        best = sc;
        bi = i;
      }
    });
    if (bi >= 0) used.add(bi);
    if (bi >= 0 && best >= 0.85) strongUsed.add(bi);
    total += best;
    if (best >= 0.85) strong++;
  }
  const cover = nw.length ? total / nw.length : 0;
  const segCover = words.length ? used.size / words.length : 0;
  return {
    item,
    score: cover * (0.6 + 0.4 * segCover),
    full: nw.length > 0 && strong === nw.length,
    usedAll: used.size === words.length,
    covers: words.length > 0 && strongUsed.size === words.length,
  };
}

function priceOf(item: VoiceMenuItem): number {
  return typeof item.price === "number" ? item.price : parseFloat(item.price);
}

function opt(s: Scored): VoiceOption {
  return { itemId: s.item.id, name: s.item.name, unitPrice: priceOf(s.item) };
}

function decide(seg: Segment, menu: VoiceMenuItem[]): VoiceResult {
  const heard = seg.heard.join(" ").trim();
  const note = [...new Set(seg.notes)].join(", ");
  if (seg.words.length === 0) {
    if (seg.qty !== null) return { kind: "quantity_only", heard, quantity: seg.qty };
    return { kind: "skipped", heard, pendingQty: seg.qty ?? undefined };
  }

  const scored = menu
    .map((it) => scoreItem(seg.words, it))
    .filter((s) => s.score >= 0.28)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { kind: "not_found", heard };
  }

  // Modifiers (e.g. "with extra cheese"): not supported by voice, pick on screen
  if (seg.modifier && scored[0].full) {
    const it = scored[0].item;
    return { kind: "unavailable", heard, reason: "modifier", itemId: it.id, name: it.name };
  }

  // Closest match auto-add: take the single top-scoring dish
  const top = scored[0];
  const it = top.item;

  if (it.available === false) {
    return { kind: "unavailable", heard, reason: "sold_out", itemId: it.id, name: it.name };
  }
  if (it.needsChoice) {
    return { kind: "unavailable", heard, reason: "needs_choice", itemId: it.id, name: it.name };
  }

  const base = {
    heard,
    itemId: it.id,
    name: it.name,
    unitPrice: priceOf(it),
    variant: seg.variant ?? undefined,
    note,
  };

  // Missing or unclear quantity: NEVER assume 1! Ask by dish name on screen.
  if (seg.qty === null || seg.qtyVague) {
    const dishLabel = seg.variant ? `${seg.variant} ${it.name}` : it.name;
    return {
      kind: "ask_quantity",
      ...base,
      question: `Kitne ${dishLabel}?`,
    };
  }

  return {
    kind: "add",
    ...base,
    quantity: seg.qty,
  };
}

/** Parse one final transcript against the restaurant's loaded menu. */
export function parseVoiceOrder(transcript: string, menu: VoiceMenuItem[]): VoiceResult[] {
  if (!transcript || !transcript.trim() || menu.length === 0) return [];
  const menuWordKeys = new Set(menu.flatMap((m) => nameWords(m.name).map(phoneticKey)));
  return splitSegments(transcript, menuWordKeys).map((s) => decide(s, menu));
}

export function parseQuantityOnly(text: string): number | null {
  const cleaned = toAsciiDigits(text.toLowerCase())
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .trim();
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const IGNORED = new Set([
    "plate", "plates", "portion", "portions", "serving", "servings",
    "piece", "pieces", "bowl", "bowls", "glass", "glasses", "nos", "number",
    "sirf", "bas", "only", "bhai", "please", "chahiye", "rakho", "kardo", "kar",
    "de", "dijiye", "lao", "bhi", "dya", "hawa",
    "कृपया", "बस", "सिर्फ", "प्लेट", "पीस", "ग्लास", "बाउल", "कप", "चाहिए", "दीजिए", "लाइए", "लाओ", "द्या",
  ]);

  const numValues: number[] = [];
  for (const w of words) {
    if (/^\d{1,2}$/.test(w)) {
      numValues.push(parseInt(w, 10));
    } else if (NUMBER_WORDS[w] !== undefined) {
      numValues.push(NUMBER_WORDS[w]);
    } else if (!IGNORED.has(w)) {
      return null;
    }
  }

  if (numValues.length === 1) {
    return numValues[0];
  }
  return null;
}

export interface PendingDish {
  id: string;
  itemId: string;
  name: string;
  unitPrice: number;
  variant?: string;
  note: string;
  question: string;
}

export interface VoiceSessionOutput {
  added: { itemId: string; name: string; quantity: number; note: string; unitPrice: number; variant?: string }[];
  question: string | null;
  notFound: string[];
}

export class VoiceOrderSession {
  private menu: VoiceMenuItem[];
  private onAdd?: (lines: VoiceAddLine[]) => void;
  private pendingQueue: PendingDish[] = [];
  private tracker = createUtteranceTracker();

  constructor(menu: VoiceMenuItem[], onAdd?: (lines: VoiceAddLine[]) => void) {
    this.menu = menu;
    this.onAdd = onAdd;
  }

  setMenu(menu: VoiceMenuItem[]) {
    this.menu = menu;
  }

  getQuestion(): string | null {
    return this.pendingQueue.length > 0 ? this.pendingQueue[0].question : null;
  }

  getPendingList(): PendingDish[] {
    return [...this.pendingQueue];
  }

  resolveActiveQuestion(qty: number): VoiceSessionOutput {
    if (this.pendingQueue.length === 0 || qty < 1) {
      return { added: [], question: this.getQuestion(), notFound: [] };
    }
    const current = this.pendingQueue.shift()!;
    const noteWithVariant = current.variant
      ? current.note
        ? `${current.variant} portion, ${current.note}`
        : `${current.variant} portion`
      : current.note;
    const line: VoiceAddLine = {
      itemId: current.itemId,
      quantity: qty,
      note: noteWithVariant,
    };
    if (this.onAdd) this.onAdd([line]);
    return {
      added: [
        {
          itemId: current.itemId,
          name: current.name,
          quantity: qty,
          note: noteWithVariant,
          unitPrice: current.unitPrice,
          variant: current.variant,
        },
      ],
      question: this.getQuestion(),
      notFound: [],
    };
  }

  dismissActiveQuestion(): string | null {
    if (this.pendingQueue.length > 0) {
      this.pendingQueue.shift();
    }
    return this.getQuestion();
  }

  processTranscript(transcript: string, isFinal = true, resultIndex = 0, nowMs = Date.now()): VoiceSessionOutput {
    const cleanText = this.tracker.accept(resultIndex, transcript, isFinal, nowMs);
    if (!cleanText) {
      return { added: [], question: this.getQuestion(), notFound: [] };
    }

    // 1. If we are currently waiting for a quantity answer:
    if (this.pendingQueue.length > 0) {
      const q = parseQuantityOnly(cleanText);
      if (q !== null && q >= 1) {
        return this.resolveActiveQuestion(q);
      }
    }

    // 2. Parse transcript as dish orders
    const results = parseVoiceOrder(cleanText, this.menu);
    const addedLines: VoiceAddLine[] = [];
    const addedSummary: { itemId: string; name: string; quantity: number; note: string; unitPrice: number; variant?: string }[] = [];
    const notFound: string[] = [];

    for (const r of results) {
      if (r.kind === "add") {
        const noteWithVariant = r.variant
          ? r.note
            ? `${r.variant} portion, ${r.note}`
            : `${r.variant} portion`
          : r.note;
        addedLines.push({ itemId: r.itemId, quantity: r.quantity, note: noteWithVariant });
        addedSummary.push({
          itemId: r.itemId,
          name: r.name,
          quantity: r.quantity,
          note: noteWithVariant,
          unitPrice: r.unitPrice,
          variant: r.variant,
        });
      } else if (r.kind === "ask_quantity") {
        this.pendingQueue.push({
          id: `${r.itemId}-${Date.now()}-${Math.random()}`,
          itemId: r.itemId,
          name: r.name,
          unitPrice: r.unitPrice,
          variant: r.variant,
          note: r.note,
          question: r.question,
        });
      } else if (r.kind === "not_found") {
        notFound.push(r.heard);
      }
    }

    if (addedLines.length > 0 && this.onAdd) {
      this.onAdd(addedLines);
    }

    return {
      added: addedSummary,
      question: this.getQuestion(),
      notFound,
    };
  }

  reset() {
    this.pendingQueue = [];
    this.tracker.reset();
  }
}

function tokensOf(text: string): string[] {
  return normalise(text).split(/\s+/).filter(Boolean);
}

function isSuffixOf(smaller: string[], larger: string[]): boolean {
  if (smaller.length > larger.length) return false;
  for (let k = 0; k < smaller.length; k++) {
    if (smaller[smaller.length - 1 - k] !== larger[larger.length - 1 - k]) return false;
  }
  return true;
}

/**
 * Turns a stream of recognition results into new spoken text, once each:
 * interim results are ignored, each final result index is used once, some
 * Android browsers repeat everything said so far in each new result (only
 * the new words are kept), and an identical phrase echoed within a few
 * seconds is ignored. Call reset() when a new recognition session starts.
 */
export function createUtteranceTracker(repeatWindowMs = 4000) {
  const seen = new Set<number>();
  let lastFinal: string[] = [];
  let lastDelta = "";
  let lastAt = -Infinity;
  return {
    reset() {
      seen.clear();
      lastFinal = [];
    },
    accept(resultIndex: number, text: string, isFinal: boolean, nowMs: number): string | null {
      if (!isFinal || seen.has(resultIndex)) return null;
      const toks = tokensOf(text);
      if (!toks.length) return null;
      seen.add(resultIndex);
      let delta = toks;
      if (lastFinal.length && lastFinal.length < toks.length && lastFinal.every((t, k) => toks[k] === t)) {
        delta = toks.slice(lastFinal.length);
      } else if (nowMs - lastAt < repeatWindowMs && lastFinal.length > 0 && isSuffixOf(toks, lastFinal)) {
        // Recognition tail echo within repeat window: suppress duplicate addition
        lastFinal = toks;
        return null;
      }
      lastFinal = toks;
      const key = delta.join(" ");
      if (!key) return null;
      if (key === lastDelta && nowMs - lastAt < repeatWindowMs) return null;
      lastDelta = key;
      lastAt = nowMs;
      return key;
    },
  };
}
