"use client";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = 32,
  withText = false,
  src = "/logo.png",
}: {
  className?: string;
  size?: number;
  withText?: boolean;
  src?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div
        className="relative flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-amber-500/10 p-0.5 border border-amber-500/20 shadow-sm"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Restaurant Logo"
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/logo.png";
          }}
        />
      </div>
      {withText && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-black tracking-tight text-foreground">
            Easy<span className="text-primary">Dine</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            EasyDine POS
          </span>
        </div>
      )}
    </div>
  );
}
