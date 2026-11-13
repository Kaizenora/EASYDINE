/**
 * Small "Powered by EasyDine" badge with the logo, for the guest's QR pages.
 * Quiet on purpose: it sits under the content and never competes with the
 * restaurant's own name.
 */
export function PoweredByEasyDine({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const text = tone === "dark" ? "text-neutral-500" : "text-neutral-400";
  const ring = tone === "dark" ? "border-white/10 bg-white/5" : "border-black/5 bg-white";
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={18}
        height={18}
        className={`h-[18px] w-[18px] rounded-[5px] border object-contain p-[1px] ${ring}`}
      />
      <span className={`text-[10px] font-medium tracking-wide ${text}`}>
        Powered by <span className="font-semibold">EasyDine</span>
      </span>
    </div>
  );
}
