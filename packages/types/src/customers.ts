import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  birthday: z.coerce.date().optional(),
  anniversary: z.coerce.date().optional(),
  allergies: z.string().optional(),
  notes: z.string().optional(),
  marketingOptOut: z.boolean().optional(),
});
export type CustomerDto = z.infer<typeof customerSchema>;

export const customerAddressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(1, "House / building is required").max(200),
  street: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, "Enter a valid PIN / postal code")
    .optional(),
  instructions: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
});
export type CustomerAddressDto = z.infer<typeof customerAddressSchema>;
export const customerAddressUpdateSchema = customerAddressSchema.partial();
export type CustomerAddressUpdateDto = z.infer<typeof customerAddressUpdateSchema>;

/** One printable line for an order's delivery address snapshot. */
export function formatCustomerAddress(a: {
  line1: string;
  street?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  return [a.line1, a.street, a.landmark ? `Near ${a.landmark}` : null, a.city, a.state]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Canonical form of a phone number used to recognise the same customer twice:
 * digits only, no 00 / +CC prefix, no national trunk 0. Indian numbers (the
 * stored format is a 10-digit mobile) reduce to those 10 digits whether typed
 * as "98765 43210", "+91 98765-43210", "919876543210" or "09876543210".
 * Returns null when what is left cannot be a phone number (7-15 digits).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** A phone field's text is acceptable when it only holds phone characters and reduces to a real number. */
export function isValidPhoneInput(raw: string): boolean {
  return /^\+?[\d\s\-()]+$/.test(raw.trim()) && normalizePhone(raw) !== null;
}
