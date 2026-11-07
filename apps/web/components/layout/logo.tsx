import { cn } from "@/lib/utils";

export function Logo({ className, size = 32, withText = false }: { className?: string; size?: number; withText?: boolean }) {
  return (
    <div className={cn("inline-flex items-center gap-2 select-none", className)}>
      <div
        className="flex items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 text-white shadow-md shadow-red-500/20 shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: size * 0.58, height: size * 0.58 }}
        >
          {/* Chef Hat & Cutlery */}
          <path d="M6 13.8V4a2 2 0 0 1 4 0v9.8" />
          <path d="M14 13.8V4a2 2 0 0 1 4 0v9.8" />
          <path d="M4 10h16" />
          <path d="M5 14a7 7 0 0 0 14 0" />
          <path d="M12 21v-4" />
        </svg>
      </div>
      {withText && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-black tracking-tight text-foreground">
            Easy<span className="text-red-500">Dine</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Restaurant POS
          </span>
        </div>
      )}
    </div>
  );
}
