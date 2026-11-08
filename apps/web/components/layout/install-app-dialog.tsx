"use client";

import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone, Check, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<"pc" | "android">("pc");

  useEffect(() => {
    // Check if already installed
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setDeferredPrompt(null);
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Install EasyDine Cashier App
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          {isInstalled ? (
            <div className="rounded-lg bg-emerald-500/10 p-3 text-center text-emerald-500 font-medium">
              ✓ EasyDine is already running as an installed standalone app on this device.
            </div>
          ) : (
            <>
              {deferredPrompt && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Direct installation is available for your browser!
                  </p>
                  <Button
                    className="mt-2 w-full gap-2 font-semibold"
                    onClick={handleInstallClick}
                  >
                    <Download className="h-4 w-4" /> Install App Now
                  </Button>
                </div>
              )}

              <div className="flex rounded-lg bg-secondary/50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("pc")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    activeTab === "pc"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" /> PC / Windows / Mac
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("android")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    activeTab === "android"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Android / Tablet
                </button>
              </div>

              {activeTab === "pc" ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground text-sm">
                    How to install on Windows PC / Desktop:
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      1
                    </span>
                    <span>
                      Open this URL (<code>http://localhost:1995</code>) in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      2
                    </span>
                    <span>
                      Look at the right side of the address bar at the top, click the <strong>Install EasyDine</strong> icon (a computer monitor with down arrow or ⊕ symbol).
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      3
                    </span>
                    <span>
                      Click <strong>Install</strong>. EasyDine will launch in a dedicated borderless window and create a desktop shortcut for one-click cashier launch.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground text-sm">
                    How to install on Android phone / tablet:
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      1
                    </span>
                    <span>
                      Connect your Android tablet/phone to the restaurant Wi-Fi and open Chrome.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      2
                    </span>
                    <span>
                      Tap the <strong>three dots menu (⋮)</strong> in the top right corner of Chrome.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      3
                    </span>
                    <span>
                      Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      4
                    </span>
                    <span>
                      Tap <strong>Install</strong>. The EasyDine POS icon will appear on your Android home screen and open in full-screen offline-ready mode.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
