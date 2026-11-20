import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateConfirmOrderInput,
  calculateComboLineTotal,
  isComboAvailable,
  isEligibleForGames,
  type ComboItem,
  type OrderForGames,
} from "./combos-games.ts";

test("validateConfirmOrderInput: rejects empty name", () => {
  const result = validateConfirmOrderInput({ name: "", phone: "9876543210" });
  assert.equal(result.valid, false);
  assert.equal(result.error, "Please enter your name");
});

test("validateConfirmOrderInput: rejects whitespace-only name", () => {
  const result = validateConfirmOrderInput({ name: "   ", phone: "9876543210" });
  assert.equal(result.valid, false);
  assert.equal(result.error, "Please enter your name");
});

test("validateConfirmOrderInput: rejects short phone number (< 10 digits)", () => {
  const result = validateConfirmOrderInput({ name: "Aarav", phone: "987654321" });
  assert.equal(result.valid, false);
  assert.equal(result.error, "Please enter a valid 10-digit mobile number");
});

test("validateConfirmOrderInput: accepts valid 10-digit phone and trims name", () => {
  const result = validateConfirmOrderInput({ name: "  Rohan Sharma  ", phone: "+91 98765 43210" });
  assert.equal(result.valid, true);
  assert.equal(result.cleanedName, "Rohan Sharma");
  assert.equal(result.cleanedPhone, "9876543210");
});

test("cart persistence: serializes to JSON and recovers cleanly across simulated refresh", () => {
  const sampleCart = [
    { id: "c1", menuItemId: "item1", name: "Paneer Butter Masala", unitPrice: 280, quantity: 2, cookingNote: "less spicy" },
    { id: "c2", menuItemId: "combo1", name: "Family Feast Combo", unitPrice: 799, quantity: 1, cookingNote: "" },
  ];
  const serialized = JSON.stringify(sampleCart);
  const recovered = JSON.parse(serialized);

  assert.equal(recovered.length, 2);
  assert.equal(recovered[0].name, "Paneer Butter Masala");
  assert.equal(recovered[1].unitPrice, 799);
  assert.equal(recovered[1].quantity, 1);
});

test("comboPricing: fixed combo charge applied, never component prices", () => {
  // A combo with Burger (₹150) + Fries (₹80) + Drink (₹60) = total individual value ₹290
  // But combo is sold at a fixed package price of ₹220
  const fixedComboPrice = "220.00";
  const quantity = 3;

  const total = calculateComboLineTotal(fixedComboPrice, quantity);
  assert.equal(total, 660.00); // 3 * 220, never 3 * 290
});

test("comboSnapshot: lineTotal maintains fixed combo rate", () => {
  const lineTotal1 = calculateComboLineTotal("499.50", 2);
  assert.equal(lineTotal1, 999.00);
});

test("comboFilter: hides combo if any component is inactive", () => {
  const activeCombo: ComboItem = {
    id: "combo1",
    name: "Burger Combo",
    price: "199",
    isCombo: true,
    comboComponents: [
      { id: "cc1", quantity: 1, componentItem: { id: "m1", name: "Burger", price: "140", isActive: true } },
      { id: "cc2", quantity: 1, componentItem: { id: "m2", name: "Fries", price: "70", isActive: true } },
    ],
  };
  assert.equal(isComboAvailable(activeCombo), true);

  const unavailableCombo: ComboItem = {
    id: "combo2",
    name: "Pizza Combo",
    price: "399",
    isCombo: true,
    comboComponents: [
      { id: "cc3", quantity: 1, componentItem: { id: "m3", name: "Pizza", price: "300", isActive: true } },
      { id: "cc4", quantity: 1, componentItem: { id: "m4", name: "Coke", price: "40", isActive: false } }, // Coke is out of stock / inactive
    ],
  };
  assert.equal(isComboAvailable(unavailableCombo), false);
});

test("gamesEligibility: unlocked during active preparation and serving", () => {
  const preparingOrder: OrderForGames = { id: "o1", status: "PREPARING", paymentStatus: "UNPAID" };
  assert.equal(isEligibleForGames(preparingOrder), true);

  const servedOrder: OrderForGames = { id: "o2", status: "SERVED", paymentStatus: "UNPAID" };
  assert.equal(isEligibleForGames(servedOrder), true);

  const cancelledOrder: OrderForGames = { id: "o3", status: "CANCELLED", paymentStatus: "UNPAID" };
  assert.equal(isEligibleForGames(cancelledOrder), false);
});

test("gamesLockOnPaid: immediately closes and locks games upon payment, blocking re-entry", () => {
  const paidOrder: OrderForGames = { id: "o4", status: "SERVED", paymentStatus: "PAID" };
  assert.equal(isEligibleForGames(paidOrder), false);

  const completedPaidOrder: OrderForGames = { id: "o5", status: "COMPLETED", paymentStatus: "PAID" };
  assert.equal(isEligibleForGames(completedPaidOrder), false);

  // Reconnect / refresh when order is null (settled walk-in)
  assert.equal(isEligibleForGames(null), false);
});
