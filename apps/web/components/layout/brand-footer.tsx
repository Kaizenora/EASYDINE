import { Sparkles } from "lucide-react";

export function BrandFooter() {
  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-3.5 py-3">
      {/* Clean Designer Credit with Logo only — no 'SG' text as requested */}
      <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/50 p-2 border border-sidebar-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/designer-logo.png"
          alt="Designer"
          className="h-7 w-7 rounded-lg object-contain shrink-0 p-0.5 border border-amber-500/30 bg-background/50"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 font-semibold">
            <Sparkles className="h-2.5 w-2.5 text-amber-500" />
            Designed by
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>EasyDine POS</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Online
        </span>
      </div>
    </div>
  );
}
