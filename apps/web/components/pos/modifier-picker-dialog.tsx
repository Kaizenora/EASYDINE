"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Portion, PortionKind } from "@/components/pos/cart-line";

// Structural subset of an item, so both the staff POS menu and the public
// QR menu can use this picker.
export interface PickerItem {
  id: string;
  name: string;
  // Items with a halfPrice get a Half / Full (/ Custom) section; price is the full portion.
  price?: string;
  halfPrice?: string | null;
  modifierGroups: {
    modifierGroup: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      isRequired?: boolean;
      modifiers: { id: string; name: string; priceAdjustment: string; isDefault: boolean }[];
    };
  }[];
}

function defaultSelection(item: PickerItem): Record<string, Set<string>> {
  const defaults: Record<string, Set<string>> = {};
  for (const { modifierGroup } of item.modifierGroups) {
    const defaultIds = modifierGroup.modifiers.filter((m) => m.isDefault).map((m) => m.id);
    if (defaultIds.length > 0) defaults[modifierGroup.id] = new Set(defaultIds);
  }
  return defaults;
}

// Keyed by item.id from the parent so switching items mounts a fresh
// instance — that lets `selected`'s initial state be derived straight from
// `item` via useState's lazy initializer (a pure, one-time computation from
// props) instead of a useEffect + setState, which React's compiler-era
// lint rules flag as an avoidable derived-state effect.
function ModifierPickerBody({
  item,
  allowCustom,
  onConfirm,
}: {
  item: PickerItem;
  allowCustom: boolean;
  onConfirm: (modifierIds: string[], modifierLabel: string, portion?: Portion) => void;
}) {
  const hasPortions = item.halfPrice != null;
  const [portionKind, setPortionKind] = useState<PortionKind>("FULL");
  const [customLabel, setCustomLabel] = useState("");
  // Editable price per portion, pre-filled from the menu; staff can overwrite any of them.
  const [prices, setPrices] = useState<Record<PortionKind, string>>({
    HALF: item.halfPrice ?? "",
    FULL: item.price ?? "",
    CUSTOM: "",
  });
  const customPrice = prices[portionKind];
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => defaultSelection(item));
  const [cashierExtras, setCashierExtras] = useState<{ id: string; name: string; price: number }[]>([]);
  const [customExtraName, setCustomExtraName] = useState("");
  const [customExtraPrice, setCustomExtraPrice] = useState("40");

  const PRESET_EXTRAS = [
    { id: "ex-cheese", name: "Extra Cheese", price: 40 },
    { id: "ex-butter", name: "Extra Butter", price: 20 },
    { id: "ex-raita", name: "Extra Raita", price: 30 },
    { id: "ex-dip", name: "Extra Dip / Mayo", price: 25 },
    { id: "ex-roti", name: "Extra Pav / Roti", price: 25 },
    { id: "ex-spicy", name: "Extra Spicy", price: 0 },
    { id: "no-onion", name: "No Onion Garlic", price: 0 },
  ];

  const toggleCashierExtra = (extra: { id: string; name: string; price: number }) => {
    setCashierExtras((prev) => {
      const exists = prev.some((e) => e.name === extra.name);
      if (exists) {
        return prev.filter((e) => e.name !== extra.name);
      }
      return [...prev, extra];
    });
  };

  const addCustomExtra = () => {
    const name = customExtraName.trim();
    if (!name) return;
    const price = Math.max(0, Number(customExtraPrice) || 0);
    const newExtra = { id: `custom-${Date.now()}`, name, price };
    setCashierExtras((prev) => [...prev, newExtra]);
    setCustomExtraName("");
    setCustomExtraPrice("40");
  };

  const groups = item.modifierGroups.map((g) => g.modifierGroup);

  const toggle = (groupId: string, modifierId: string, maxSelect: number) => {
    setSelected((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(modifierId)) {
        current.delete(modifierId);
      } else {
        if (maxSelect === 1) current.clear();
        else if (current.size >= maxSelect) return prev;
        current.add(modifierId);
      }
      return { ...prev, [groupId]: current };
    });
  };

  const handleConfirm = () => {
    let portion: Portion | undefined;
    if (hasPortions) {
      const price = Number(customPrice);
      if (customPrice.trim() === "" || !Number.isFinite(price) || price < 0) {
        toast.error(`Enter a price for the ${portionKind.toLowerCase()} portion`);
        return;
      }
      portion =
        portionKind === "CUSTOM"
          ? { kind: "CUSTOM", customLabel: customLabel.trim() || undefined, customPrice: price }
          : { kind: portionKind, customPrice: price };
    }
    for (const group of groups) {
      const count = selected[group.id]?.size ?? 0;
      const min = Math.max(group.minSelect, group.isRequired ? 1 : 0);
      if (count < min) {
        toast.error(`Choose at least ${min} option(s) for ${group.name}`);
        return;
      }
    }
    const allSelected = groups.flatMap((g) => [...(selected[g.id] ?? [])]);
    const groupLabels = groups
      .flatMap((g) => [...(selected[g.id] ?? [])].map((id) => g.modifiers.find((m) => m.id === id)?.name))
      .filter(Boolean);
    
    const extraLabels = cashierExtras.map((e) => (e.price > 0 ? `${e.name} (+₹${e.price})` : e.name));
    const totalExtraPrice = cashierExtras.reduce((sum, e) => sum + e.price, 0);
    const finalLabel = [...groupLabels, ...extraLabels].filter(Boolean).join(", ");

    let finalPortion = portion;
    if (finalPortion) {
      finalPortion = {
        ...finalPortion,
        customPrice: (finalPortion.customPrice ?? Number(item.price || 0)) + totalExtraPrice,
      };
    } else if (totalExtraPrice > 0) {
      finalPortion = {
        kind: "CUSTOM",
        customPrice: Number(item.price || 0) + totalExtraPrice,
        customLabel: finalLabel || "With Extras",
      };
    }

    onConfirm(allSelected, finalLabel, finalPortion);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item.name}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-5 py-2">
        {hasPortions && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Portion</h3>
            <div className={cn("grid gap-2", allowCustom ? "grid-cols-3" : "grid-cols-2")}>
              {(
                [
                  { kind: "HALF", label: "Half", price: item.halfPrice },
                  { kind: "FULL", label: "Full", price: item.price },
                  ...(allowCustom ? [{ kind: "CUSTOM", label: "Custom", price: null }] : []),
                ] as { kind: PortionKind; label: string; price?: string | null }[]
              ).map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  aria-pressed={portionKind === opt.kind}
                  onClick={() => setPortionKind(opt.kind)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    portionKind === opt.kind
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <span>{opt.label}</span>
                  {opt.kind !== "CUSTOM" && prices[opt.kind] !== "" && (
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">
                      {formatCurrency(prices[opt.kind])}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className={cn("grid gap-2", portionKind === "CUSTOM" ? "grid-cols-[1fr_7rem]" : "grid-cols-1")}>
              {portionKind === "CUSTOM" && (
                <Input
                  placeholder="Label, e.g. Quarter"
                  maxLength={40}
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  aria-label="Custom portion label"
                />
              )}
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Price"
                value={customPrice}
                onChange={(e) => setPrices((p) => ({ ...p, [portionKind]: e.target.value }))}
                aria-label={`${portionKind.toLowerCase()} portion price`}
              />
            </div>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{group.name}</h3>
              <span className="text-xs text-muted-foreground">
                {group.maxSelect === 1 ? "Choose 1" : `Choose up to ${group.maxSelect}`}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {group.modifiers.map((mod) => {
                const isSelected = selected[group.id]?.has(mod.id) ?? false;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggle(group.id, mod.id, group.maxSelect)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border hover:bg-secondary",
                    )}
                  >
                    <span>{mod.name}</span>
                    {Number(mod.priceAdjustment) > 0 && (
                      <span className="text-xs text-muted-foreground">
                        +{formatCurrency(mod.priceAdjustment)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Cashier Extras & Add-ons (e.g. Extra Cheese ₹40) */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Extras & Add-ons</h3>
            <span className="text-xs text-muted-foreground">Cashier custom options</span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESET_EXTRAS.map((extra) => {
              const active = cashierExtras.some((e) => e.name === extra.name);
              return (
                <button
                  key={extra.id}
                  type="button"
                  onClick={() => toggleCashierExtra(extra)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer",
                    active
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  )}
                >
                  <span>{extra.name}</span>
                  {extra.price > 0 && (
                    <span className={active ? "text-primary-foreground/90 font-bold" : "text-primary font-semibold"}>
                      +₹{extra.price}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Extra Input */}
          <div className="mt-1 flex items-center gap-2 pt-1 border-t border-border/50">
            <Input
              placeholder="Custom extra (e.g. Extra Cheese)"
              value={customExtraName}
              onChange={(e) => setCustomExtraName(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="relative w-24 shrink-0">
              <span className="absolute left-2 top-2 text-xs text-muted-foreground">₹</span>
              <Input
                type="number"
                min="0"
                placeholder="40"
                value={customExtraPrice}
                onChange={(e) => setCustomExtraPrice(e.target.value)}
                className="h-8 pl-5 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addCustomExtra}
              disabled={!customExtraName.trim()}
              className="h-8 shrink-0 text-xs"
            >
              + Add
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={handleConfirm}>Add to cart</Button>
      </DialogFooter>
    </>
  );
}

export function ModifierPickerDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  allowCustom = false,
}: {
  item: PickerItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (modifierIds: string[], modifierLabel: string, portion?: Portion) => void;
  allowCustom?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {item && (
          <ModifierPickerBody
            key={item.id}
            item={item}
            allowCustom={allowCustom}
            onConfirm={(modifierIds, label, portion) => {
              onConfirm(modifierIds, label, portion);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
