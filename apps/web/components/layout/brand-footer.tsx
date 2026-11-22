import { EasyDineBadge } from "@/components/brand/easydine-logo";

export function BrandFooter() {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-center gap-2">
        <EasyDineBadge size={18} title="EasyDine" />
        <span className="truncate">Powered by EasyDine</span>
      </span>
      <span className="flex items-center gap-1.5 text-success">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        Online
      </span>
    </div>
  );
}
