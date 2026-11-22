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
    '- openTable: show a table\'s live order ("table 2", "table 2 ka order", "T2 order dikhao").',
    '- markPaid: the table has paid ("table 2 paid", "table 2 ka payment ho gaya", "टेबल 2 पेड").',
    '- reprintKOT: print the kitchen ticket again ("table 2 KOT reprint", "KOT dobara").',
    '- reprintBill: print the bill again ("table 2 bill reprint", "bill print karo").',
    '- bestSellers: today\'s best selling dishes ("best selling dish", "aaj ka best seller", "sabse zyada bikne wali dish"). table is null.',
    '- unknown: anything else, or if you are not sure.',
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
