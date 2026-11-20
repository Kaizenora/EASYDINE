import { z } from "zod";

// The restaurant's brand name renders in the app shell's top-of-sidebar
// header (fixed-width column, next to the logo) — a name much past this
// starts wrapping/truncating there, so the settings form enforces the same
// limit the layout was built around rather than letting it overflow.
export const RESTAURANT_NAME_MAX_LENGTH = 40;

// A web address that is safe to open from the customer menu: http(s) only (no
// javascript:, data: etc.). Blank means "not set" and is stored as null.
export const optionalWebUrl = z
  .union([z.literal(""), z.string().trim().max(2048)])
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => {
      if (v === null) return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Enter a full web address starting with https://" },
  )
  .optional()
  .nullable();

// Reusable WhatsApp messages. {name} and {points} are filled from the customer.
export const WHATSAPP_TEMPLATE_KEYS = ["greeting", "offer", "points"] as const;
export const whatsappTemplatesSchema = z.object({
  greeting: z.string().max(1000).optional(),
  offer: z.string().max(1000).optional(),
  points: z.string().max(1000).optional(),
});
export type WhatsappTemplates = z.infer<typeof whatsappTemplatesSchema>;

export const DEFAULT_WHATSAPP_TEMPLATES: Required<WhatsappTemplates> = {
  greeting: "Hi {name}, thank you for dining with us! We'd love to see you again soon.",
  offer: "Hi {name}, we have a new offer for you. Visit us soon and enjoy it!",
  points: "Hi {name}, you have {points} loyalty points with us. Use them on your next visit!",
};

/** Fill {name} / {points}; unknown {tokens} are left as typed. */
export function renderWhatsappTemplate(
  template: string,
  vars: { name?: string | null; points?: number | null },
): string {
  return template
    .replace(/\{name\}/gi, (vars.name ?? "").trim() || "there")
    .replace(/\{points\}/gi, String(vars.points ?? 0));
}

export const restaurantSettingsSchema = z.object({
  name: z.string().min(1).max(RESTAURANT_NAME_MAX_LENGTH).optional(),
  legalName: z.string().optional(),
  // Shown in place of the product logo in the app shell header and on the
  // login screen once set. Square, ~256x256px+ PNG/SVG with a transparent
  // background reads best in that slot — see the settings page hint text.
  logoUrl: z.string().max(2048).optional().nullable(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  // UPI id such as "name@okbank" (VPA format per NPCI: handle@psp).
  upiVpa: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/, "Enter a valid UPI id like name@bank")
    .optional()
    .nullable(),
  upiPayeeName: z.string().trim().max(60).optional().nullable(),
  loyaltyPointValue: z.coerce.number().min(0).optional(),
  loyaltyEarnPerCurrency: z.coerce.number().int().positive().optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyMinOrderAmount: z.coerce.number().min(0).max(1000000).optional(),
  loyaltyMinRedeemPoints: z.coerce.number().int().min(0).max(1000000).optional(),
  // 0 = points never expire.
  loyaltyExpiryDays: z.coerce.number().int().min(0).max(3650).optional(),
  // Customer-menu extras. Links must be web addresses and are opened in a new
  // tab; empty clears the field.
  deliveryRedirectEnabled: z.boolean().optional(),
  zomatoUrl: optionalWebUrl,
  swiggyUrl: optionalWebUrl,
  reviewUrl: optionalWebUrl,
  whatsappTemplates: whatsappTemplatesSchema.optional().nullable(),
  referralEnabled: z.boolean().optional(),
  referralSharerPoints: z.coerce.number().int().min(0).max(100000).optional(),
  referralReferredPoints: z.coerce.number().int().min(0).max(100000).optional(),
  referralMinPurchase: z.coerce.number().min(0).max(1000000).optional(),
  onlineMinOrderAmount: z.coerce.number().min(0).max(1000000).optional(),
  // Website / app-ordering prices: PERCENT or AMOUNT, negative = cheaper, positive = costlier.
  onlinePriceAdjustKind: z.enum(["PERCENT", "AMOUNT"]).optional(),
  onlinePriceAdjustValue: z.coerce.number().min(-100000).max(100000).optional(),
  maxManualDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  requireDiscountReason: z.boolean().optional(),
});
export type RestaurantSettingsDto = z.infer<typeof restaurantSettingsSchema>;

import { TAX_MODES, TAX_REGIMES } from "./tax";

export const branchSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  gstNumber: z.string().optional(),
  // Multi-region tax config — see tax.ts for the regime presets this
  // pairs with (label, default mode, CGST/SGST split).
  country: z.string().length(2).optional(),
  taxRegime: z.enum(TAX_REGIMES).optional(),
  taxMode: z.enum(TAX_MODES).optional(),
  taxLabel: z.string().max(30).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  // Online order / table-booking handling (false = staff accept manually).
  autoConfirmOrders: z.boolean().optional(),
  autoConfirmReservations: z.boolean().optional(),
  // Self-service kiosk: which service-mode buttons the start screen offers.
  kioskDineInEnabled: z.boolean().optional(),
  kioskTakeawayEnabled: z.boolean().optional(),
  // Thermal printer (direct ESC/POS): paper, code page and column override.
  printerPaperWidthMm: z.union([z.literal(58), z.literal(80)]).optional(),
  printerCodepage: z.enum(["CP437", "CP850", "CP858", "CP1252"]).optional(),
  printerColumns: z.number().int().min(20).max(64).nullable().optional(),
  // How the server reaches the thermal printer: USB attached to the server,
  // or a network printer (raw ESC/POS over TCP, normally port 9100).
  printerConnection: z.enum(["USB", "NETWORK"]).optional(),
  printerHost: z
    .string()
    .trim()
    .max(253)
    .regex(/^[A-Za-z0-9.-]+$/, "Use an IP address or host name")
    .nullable()
    .optional(),
  printerPort: z.number().int().min(1).max(65535).optional(),
  qrBaseUrl: z.string().url().optional().nullable(),
});
export type BranchSettingsDto = z.infer<typeof branchSettingsSchema>;
