"use client";

import React, { useState, useEffect } from "react";
import { Gamepad2, Check, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type GameSettings } from "@/components/order/games";

const DEFAULT_SETTINGS: GameSettings = {
  memoryEnabled: true,
  snacksEnabled: true,
  memoryImages: [],
  catchImages: [],
  avoidImages: [],
};

export function getStoredGameSettings(branchId: string | null): GameSettings {
  if (typeof window === "undefined" || !branchId) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(`easydine_games_settings_${branchId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fallback to defaults */
  }
  return DEFAULT_SETTINGS;
}

export function GamesSettingsDialog({ branchId }: { branchId: string | null }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (open && branchId) {
      setSettings(getStoredGameSettings(branchId));
    }
  }, [open, branchId]);

  const handleSave = () => {
    if (branchId) {
      try {
        localStorage.setItem(`easydine_games_settings_${branchId}`, JSON.stringify(settings));
        toast.success("Arcade & Table Games settings updated");
      } catch {
        toast.error("Failed to save settings");
      }
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-10 gap-1.5 px-3">
            <Gamepad2 className="h-4 w-4 text-primary" />
            <span>Games Settings</span>
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-primary" />
            <span>Table Games & Arcade Settings</span>
          </DialogTitle>
          <DialogDescription>
            Configure interactive mini-games available to guests while waiting for their food.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Food Memory Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-bold text-foreground">Food Memory Game (4×6)</p>
              <p className="text-xs text-muted-foreground">
                24 cards, 12 distinct pairs. Single player & 2-player pass-and-play.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.memoryEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, memoryEnabled: e.target.checked }))}
              className="h-5 w-5 rounded border-border accent-primary cursor-pointer"
            />
          </div>

          {/* Catch the Snacks Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-bold text-foreground">Catch the Snacks Game</p>
              <p className="text-xs text-muted-foreground">
                30s fast-action round. Catch delicious food, avoid burnt items.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.snacksEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, snacksEnabled: e.target.checked }))}
              className="h-5 w-5 rounded border-border accent-primary cursor-pointer"
            />
          </div>

          <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic">
            Note: Mini-games unlock exclusively after a customer places an active order, remain playable while being served, and automatically lock upon final payment.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="gap-1.5 font-bold">
            <Check className="h-4 w-4" />
            <span>Save Settings</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
