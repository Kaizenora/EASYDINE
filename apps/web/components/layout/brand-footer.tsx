import { Sparkles } from "lucide-react";

export function BrandFooter() {
  return (
    <div className="flex flex-col gap-2.5 border-t border-sidebar-border px-4 py-3">
      {/* Designer & Agency Brand Credit */}
      <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 p-2.5 border border-sidebar-border shadow-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/designer-logo.png"
          alt="SG Logo"
          className="h-8 w-8 rounded-lg object-contain shrink-0 bg-background/40 p-0.5 border border-amber-500/30"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5 text-amber-500" />
            Designed by
          </span>
          <span className="text-xs font-bold text-foreground">
            SG Design &amp; Tech
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>EasyDine POS</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Cloud Synced
        </span>
      </div>
    </div>
  );
}
