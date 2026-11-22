// Voice ordering client: audio goes to our backend (which calls Sarvam STT
// with automatic language detection, then the LLM), never to a third party
// from the browser. Prices and dish names always come from the server's menu.

export type VoiceLocale = "en" | "hi" | "mr";

/** Browser speech language for the cooking-note mic on the QR page (not the voice order). */
export const RECOGNITION_LANG: Record<VoiceLocale, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export interface Transcription {
  transcript: string;
  languageCode: string | null;
  languageProbability: number | null;
}

export interface ParsedVoiceItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number | null;
  needsQuantity: boolean;
  confidence: "high" | "low";
  specialInstructions: string | null;
  heard: string;
}

export interface VoiceSuggestion {
  menuItemId: string;
  name: string;
  unitPrice: number;
}

export interface ParsedVoiceOrder {
  items: ParsedVoiceItem[];
  unmatched: { heard: string; suggestions: VoiceSuggestion[] }[];
}

/** One reviewed line the guest confirmed; goes into the normal cart. */
export interface VoiceAddLine {
  itemId: string;
  quantity: number;
  note: string;
}

export type CashierAction = "openTable" | "markPaid" | "reprintKOT" | "reprintBill" | "bestSellers" | "unknown";

export interface CashierCommandResult {
  heard: string;
  action: CashierAction;
  table: { id: string; label: string } | null;
  order: { id: string; orderNumber: string; status: string } | null;
}

export const MAX_RECORDING_MS = 25_000;
export const MAX_VOICE_QTY = 50;

export function audioForm(blob: Blob): FormData {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `speech.${ext}`);
  return form;
}

// ---------------------------------------------------------------- spoken numbers
const DEV_DIGITS = "०१२३४५६७८९";
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7,
  "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  "दोन": 2, "पाच": 5, "सहा": 6, "नऊ": 9, "दहा": 10, "अकरा": 11, "बारा": 12,
  don: 2, paach: 5, saha: 6, daha: 10,
};

/**
 * The quantity in a short spoken answer to "Kitne …?" ("teen", "३", "2 plate").
 * Returns null when no single clear number was said: the guest is asked again,
 * never defaulted to 1.
 */
export function spokenQuantity(text: string): number | null {
  const ascii = text.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d))).toLowerCase();
  const found = new Set<number>();
  for (const tok of ascii.split(/[^\p{L}\p{M}\d]+/u)) {
    if (!tok) continue;
    const n = /^\d{1,3}$/.test(tok) ? parseInt(tok, 10) : NUMBER_WORDS[tok];
    if (n !== undefined) found.add(n);
  }
  if (found.size !== 1) return null;
  const [n] = [...found];
  return n >= 1 && n <= MAX_VOICE_QTY ? n : null;
}
