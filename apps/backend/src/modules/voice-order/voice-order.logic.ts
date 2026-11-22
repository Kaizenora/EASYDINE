import { tableLabel } from '@easydine/types';
import { z } from 'zod';

// Pure parts of voice ordering: request/LLM schemas, keyterms, prompts and
// the server-side checks that turn an LLM answer into something safe to show.
// The LLM only ever sees short numbers (1..N) for dishes and tables; every
// number it returns is checked against the list we sent, so it can never
// invent a dish, a price or a table.

export const MAX_TRANSCRIPT_CHARS = 600;
export const MAX_QTY = 50;
/** Sarvam: up to 50 keyterms, 64 chars each. */
export const MAX_KEYTERMS = 50;
const MAX_KEYTERM_CHARS = 64;

export const transcriptBodySchema = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
});
export type TranscriptBody = z.infer<typeof transcriptBodySchema>;

export interface VoiceMenuRow {
  id: string;
  name: string;
  price: number;
}

/** Dish names (or table labels + command words) Sarvam should listen for. */
export function buildKeyterms(terms: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const t = raw.trim().slice(0, MAX_KEYTERM_CHARS);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === MAX_KEYTERMS) break;
  }
  return out;
}

// ------------------------------------------------------------ customer order

export const orderLlmSchema = z.object({
  items: z.array(
    z.object({
      /** 1-based number of the dish in the menu list we sent. */
      dish: z.number().int(),
      /** null when the guest did not clearly say how many. */
      quantity: z.number().int().nullable(),
      confidence: z.enum(['high', 'low']),
      specialInstructions: z.string().nullable(),
      heard: z.string(),
    }),
  ),
  unmatched: z.array(
    z.object({
      heard: z.string(),
      /** Up to 3 closest dish numbers, best first. */
      closest: z.array(z.number().int()),
    }),
  ),
});
export type OrderLlmOutput = z.infer<typeof orderLlmSchema>;

export function orderSystemPrompt(menu: readonly VoiceMenuRow[]): string {
  const list = menu.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  return [
    "You turn a restaurant guest's spoken order into JSON.",
    'The guest may speak English, Hindi, Marathi or a mix, in any script, with spelling mistakes from speech recognition.',
    'MENU (number. dish name):',
    list,
    '',
    'Rules:',
    '- First split the order into every separate dish the guest asked for, then handle each one on its own. One dish not being on the MENU must never drop the other dishes.',
    '- Use ONLY dish numbers from the MENU. Never invent a dish.',
    '- Match each spoken dish to the closest menu name even if misspelled, transliterated or code-mixed (e.g. "cheez nan" -> "Cheese Naan", "पनीर टिक्का" -> "Paneer Tikka").',
    '- quantity: the number the guest said for that dish (words like "do"/"दो"/"don" = 2, "ek" = 1, "teen" = 3). If no number was said for that dish, or it is vague ("kuch", "few"), quantity MUST be null. Never assume 1.',
    '- confidence: "high" when the dish match is clear, "low" when it is a guess between similar dishes or a loose match.',
    '- specialInstructions: cooking notes for that dish only ("thoda spicy", "less oil", "no onion"), in the guest\'s words; else null.',
    '- heard: the words the guest used for that dish.',
    '- If something the guest asked for has no reasonable match on the MENU, put it in "unmatched" with "closest": up to 3 most similar dish numbers. Do not guess it into "items".',
    '- Ignore greetings and filler. If nothing was ordered, return empty arrays.',
    'Example: if the MENU has "4. Masala Chai" but no biryani, "one chicken biryani and two masala chai" gives items [{dish: 4, quantity: 2, ...}] AND unmatched [{heard: "chicken biryani", ...}].',
    'Reply with JSON only.',
  ].join('\n');
}

export interface ParsedOrderItem {
  menuItemId: string;
  name: string;
  /** Always from the database, never from speech. */
  unitPrice: number;
  quantity: number | null;
  needsQuantity: boolean;
  confidence: 'high' | 'low';
  specialInstructions: string | null;
  heard: string;
}

export interface ParsedOrder {
  items: ParsedOrderItem[];
  unmatched: {
    heard: string;
    suggestions: { menuItemId: string; name: string; unitPrice: number }[];
  }[];
}

const cleanNote = (s: string | null): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return t || null;
};

/** Checks every number the LLM returned against the menu we sent. */
export function resolveOrder(
  menu: readonly VoiceMenuRow[],
  out: OrderLlmOutput,
): ParsedOrder {
  const at = (n: number) =>
    Number.isInteger(n) && n >= 1 && n <= menu.length ? menu[n - 1] : null;
  const items: ParsedOrderItem[] = [];
  const unmatched: ParsedOrder['unmatched'] = [];
  const suggest = (nums: readonly number[]) => {
    const seen = new Set<string>();
    const res: { menuItemId: string; name: string; unitPrice: number }[] = [];
    for (const n of nums) {
      const m = at(n);
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      res.push({ menuItemId: m.id, name: m.name, unitPrice: m.price });
      if (res.length === 3) break;
    }
    return res;
  };

  for (const it of out.items) {
    const m = at(it.dish);
    if (!m) {
      // A number outside the list is an invented dish: ask, never add.
      unmatched.push({ heard: it.heard, suggestions: [] });
      continue;
    }
    const qtyOk =
      it.quantity !== null && it.quantity >= 1 && it.quantity <= MAX_QTY;
    items.push({
      menuItemId: m.id,
      name: m.name,
      unitPrice: m.price,
      quantity: qtyOk ? it.quantity : null,
      needsQuantity: !qtyOk,
      confidence: it.confidence,
      specialInstructions: cleanNote(it.specialInstructions),
      heard: it.heard.slice(0, 120),
    });
  }
  for (const u of out.unmatched) {
    unmatched.push({
      heard: u.heard.slice(0, 120),
      suggestions: suggest(u.closest),
    });
  }
  return { items, unmatched };
}

// ------------------------------------------------------------ cashier commands

export const CASHIER_ACTIONS = [
  'openTable',
  'markPaid',
  'reprintKOT',
  'reprintBill',
  'bestSellers',
] as const;
export type CashierAction = (typeof CASHIER_ACTIONS)[number];

export const cashierLlmSchema = z.object({
  action: z.enum([...CASHIER_ACTIONS, 'unknown']),
  /** 1-based number of the table in the list we sent; null if none was said. */
  table: z.number().int().nullable(),
});
export type CashierLlmOutput = z.infer<typeof cashierLlmSchema>;

export const CASHIER_COMMAND_WORDS = [
  'table',
  'order',
  'paid',
  'bill',
  'KOT',
  'reprint',
  'best selling',
  'best seller',
];

export interface VoiceTableRow {
  id: string;
  number: string;
  name: string | null;
}

export const labelOf = (t: VoiceTableRow) => tableLabel(t.number, t.name);

export function cashierSystemPrompt(tables: readonly VoiceTableRow[]): string {
  const list = tables
    .map(
      (t, i) =>
        `${i + 1}. ${labelOf(t)}${t.name ? ` (table number ${t.number})` : ''}`,
    )
    .join('\n');
  return [
    "You turn a restaurant cashier's short spoken command into JSON.",
    'The cashier may speak English, Hindi, Marathi or a mix, in any script.',
    'TABLES (number. label):',
    list || '(none)',
    '',
    'Actions:',
    '- openTable: show a table\'s live order ("table 2", "table 2 ka order", "T2 order dikhao", "टेबल दोनची ऑर्डर दाखवा", "टेबल २ उघडा").',
    '- markPaid: the table has paid ("table 2 paid", "table 2 ka payment ho gaya", "टेबल 2 पेड", "टेबल दोनचे पैसे मिळाले", "टेबल दोन पेमेंट झाले").',
    '- reprintKOT: print the kitchen ticket again ("table 2 KOT reprint", "KOT dobara", "टेबल दोनचा KOT परत काढा").',
    '- reprintBill: print the bill again ("table 2 bill reprint", "bill print karo", "टेबल दोनचे बिल काढा").',
    '- bestSellers: today\'s best selling dishes ("best selling dish", "aaj ka best seller", "sabse zyada bikne wali dish", "आजची सर्वात जास्त विकली गेलेली डिश"). table is null.',
    '- unknown: anything else, including normal conversation between people that is not a command for the cashier screen, or if you are not sure.',
    'table: the number from TABLES whose label or table number the cashier said ("table do"/"टेबल दो"/"T2" = label T2). null if no table was said or it is not in TABLES. Never guess a table.',
    'Reply with JSON only.',
  ].join('\n');
}

export interface CashierCommand {
  action: CashierAction | 'unknown';
  table: { id: string; label: string } | null;
}

export function resolveCashier(
  tables: readonly VoiceTableRow[],
  out: CashierLlmOutput,
): CashierCommand {
  const t =
    out.table !== null && out.table >= 1 && out.table <= tables.length
      ? tables[out.table - 1]
      : null;
  const table = t ? { id: t.id, label: labelOf(t) } : null;
  if (out.action === 'unknown' || out.action === 'bestSellers')
    return { action: out.action, table: null };
  // Every other action is about one table; table null tells the UI to ask.
  return { action: out.action, table };
}

// ------------------------------------------------------------ fast path
// Plain commands ("table 2 paid", "टेबल दोन पेड", "T3 KOT") are recognised
// here without the LLM, which saves its round trip. Anything less clear
// returns null and goes to the LLM as before.

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  don: 2,
  tin: 3,
  pach: 5,
  paach: 5,
  saha: 6,
  daha: 10,
  एक: 1,
  दो: 2,
  दोन: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  पाच: 5,
  छह: 6,
  सहा: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  नऊ: 9,
  दस: 10,
  दहा: 10,
  अकरा: 11,
  ग्यारह: 11,
  बारा: 12,
  बारह: 12,
};
const TABLE_WORDS = new Set([
  'table',
  'tables',
  'टेबल',
  'टेबलं',
  'टेबलचा',
  'टेबलची',
  'टेबलचे',
  'टेबलला',
]);
const SKIP_WORDS = new Set(['no', 'number', 'नंबर', 'क्रमांक']);
/** Words that leave "table N" meaning just "open table N". */
const OPEN_FILLERS = new Set([
  'order',
  'ka',
  'ki',
  'ke',
  'ko',
  'kholo',
  'khol',
  'dikhao',
  'dikha',
  'open',
  'show',
  'please',
  'ऑर्डर',
  'का',
  'की',
  'के',
  'खोलो',
  'दिखाओ',
  'चा',
  'ची',
  'चे',
  'उघडा',
  'दाखवा',
  'प्लीज',
]);
const NEGATION =
  /\b(nahi|nahin|mat|cancel|don'?t|not)\b|नहीं|नही|नाही|मत|कॅन्सल|रद्द/;
const DEV_DIGITS = '०१२३४५६७८९';

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .replace(/\bt\s*-?\s*(\d{1,3})\b/g, 'table $1')
    .replace(/(टेबल)(\d)/g, '$1 $2')
    .replace(/(\d)(चा|ची|चे|ला|का|की)/g, '$1 $2')
    .replace(/[.,!?।]/g, ' ');
}

function numberToken(tok: string): number | null {
  if (/^\d{1,3}$/.test(tok)) return parseInt(tok, 10);
  const bare = tok.replace(/(चा|ची|चे|ला|ं)$/u, '');
  return NUMBER_WORDS[tok] ?? NUMBER_WORDS[bare] ?? null;
}

export function quickCashierCommand(
  transcript: string,
  tables: readonly VoiceTableRow[],
): CashierCommand | null {
  const text = normalise(transcript);
  if (NEGATION.test(text)) return null;
  if (
    /best\s*sell|bestseller|बेस्ट\s*सेल|सबसे\s*ज़?्?यादा\s*बिक|sabse\s*zyada\s*bik|सर्वात\s*जास्त\s*विक/.test(
      text,
    )
  ) {
    return { action: 'bestSellers', table: null };
  }

  const toks = text.split(/\s+/).filter(Boolean);
  let tableNo: number | null = null;
  let tableEnd = -1;
  for (let i = 0; i < toks.length; i++) {
    if (!TABLE_WORDS.has(toks[i])) continue;
    let j = i + 1;
    while (j < toks.length && SKIP_WORDS.has(toks[j])) j++;
    const n = j < toks.length ? numberToken(toks[j]) : null;
    if (n === null) continue;
    if (tableNo !== null && tableNo !== n) return null; // two tables: let the LLM decide
    tableNo = n;
    tableEnd = j;
  }
  if (tableNo === null) return null;
  const hits = tables.filter(
    (t) =>
      labelOf(t) === `T${tableNo}` ||
      t.number.replace(/^[Tt]+/, '') === String(tableNo),
  );
  if (hits.length !== 1) return null;
  const table = { id: hits[0].id, label: labelOf(hits[0]) };

  if (/\bkot\b|के\s*ओ\s*टी|केओटी|\bk\s*o\s*t\b/.test(text))
    return { action: 'reprintKOT', table };
  if (
    /\bpaid\b|\bpay(ment)?\b|पेड|पेमेंट|पैसे\s*(मिळाले|मिल\s*गए|आले)/.test(text)
  )
    return { action: 'markPaid', table };
  if (/\bbill\b|बिल/.test(text)) return { action: 'reprintBill', table };

  const rest = toks.filter(
    (t, i) => i !== tableEnd && !TABLE_WORDS.has(t) && !SKIP_WORDS.has(t),
  );
  if (rest.every((t) => OPEN_FILLERS.has(t)))
    return { action: 'openTable', table };
  return null;
}
