// Query/body parsing for "this cashier PC prints it" requests (the EasyDine
// Windows app's local print bridge). Kept separate from the controller so the
// rules are unit-tested: anything unexpected falls back to the old behaviour
// (server-side printing) instead of being guessed.
import { z } from 'zod';
import type { DeviceKotOptions } from './kot-print.service';
import type { KotPaper } from './kot.html';

/**
 * server  – branch printer configured on the server (old behaviour)
 * device  – the EasyDine Windows app on the cashier PC prints it
 * spooler – the cashier PC IS the server PC: print on the Windows printer
 *           the cashier chose there (no install needed)
 * browser – hosted setup: the cashier PC prints the KOT page through its
 *           normal browser print dialog; the server never tries a printer
 * none    – the cashier's saved printer is missing: print nowhere
 */
export type KotVia = 'server' | 'device' | 'spooler' | 'browser' | 'none';

export function parseKotVia(v: unknown): KotVia {
  return v === 'device' || v === 'none' || v === 'spooler' || v === 'browser'
    ? v
    : 'server';
}

export function parsePaper(v: unknown): KotPaper | undefined {
  return v === '58mm' || v === '80mm' || v === 'A4' ? v : undefined;
}

export function parseDeviceKotOptions(q: {
  format?: unknown;
  paper?: unknown;
  tz?: unknown;
}): DeviceKotOptions {
  const paper = parsePaper(q.paper);
  // A4 has no raw ESC/POS form; it is always a rendered page.
  const format = q.format === 'html' || paper === 'A4' ? 'html' : 'escpos';
  return {
    format,
    paper,
    timeZone: typeof q.tz === 'string' ? q.tz : undefined,
  };
}

export const deviceKotResultSchema = z.object({
  reprint: z.boolean().default(false),
  printerName: z.string().trim().min(1).max(200),
  deviceId: z.string().trim().max(64).nullable().optional(),
  results: z
    .array(
      z.object({
        kotId: z.string().min(1).max(64),
        status: z.enum(['QUEUED', 'FAILED', 'UNKNOWN']),
        error: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type DeviceKotResultBody = z.infer<typeof deviceKotResultSchema>;
