/**
 * Validation and business rules for guest order confirmation, combo pricing, and table games.
 */

import { normalizePhone } from "@easydine/types";

export interface ConfirmOrderInput {
  name: string;
  phone: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  cleanedName?: string;
  cleanedPhone?: string;
}

/**
 * Validates guest checkout input:
 * - Empty or whitespace name is rejected.
 * - Phone must be a valid 10-digit mobile number.
 */
export function validateConfirmOrderInput(input: ConfirmOrderInput): ValidationResult {
  const trimmedName = (input.name ?? "").trim();
  if (!trimmedName) {
    return { valid: false, error: "Please enter your name" };
  }

  const normalized = normalizePhone(input.phone ?? "");
  if (!normalized || normalized.length !== 10) {
    return { valid: false, error: "Please enter a valid 10-digit mobile number" };
  }

  return {
    valid: true,
    cleanedName: trimmedName,
    cleanedPhone: normalized,
  };
}

export interface ComboComponentItem {
  id: string;
  name: string;
  price: string;
  isActive: boolean;
}

export interface ComboItem {
  id: string;
  name: string;
  price: string; // Fixed combo price
  isCombo: boolean;
  comboComponents: {
    id: string;
    quantity: number;
    componentItem: ComboComponentItem;
  }[];
}

/**
 * Calculates line total for an item. For combo meals, uses the fixed combo price,
 * never the sum of individual component prices.
 */
export function calculateComboLineTotal(comboPrice: string | number, quantity: number): number {
  const rate = typeof comboPrice === "string" ? parseFloat(comboPrice) : comboPrice;
  return Math.round(rate * quantity * 100) / 100;
}

/**
 * Determines whether a combo is currently available. A combo is hidden
 * if any of its required components is inactive or missing.
 */
export function isComboAvailable(combo: ComboItem): boolean {
  if (!combo.isCombo) return true;
  if (!combo.comboComponents || combo.comboComponents.length === 0) return true;
  return combo.comboComponents.every(
    (c) => c.componentItem && c.componentItem.isActive === true
  );
}

export type OrderStatus = "NEW" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "REFUNDED";

export interface OrderForGames {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

/**
 * Table games eligibility rule:
 * - Unlocks ONLY from customer's own active order.
 * - Served status stays eligible while guests finish their meal.
 * - PAID immediately closes and locks games (and prevents re-entry after refresh/reconnect).
 * - Cancelled orders are not eligible.
 */
export function isEligibleForGames(order: OrderForGames | null | undefined): boolean {
  if (!order) return false;
  if (order.status === "CANCELLED") return false;
  if (order.paymentStatus === "PAID") return false;
  return ["NEW", "CONFIRMED", "PREPARING", "READY", "SERVED"].includes(order.status);
}
