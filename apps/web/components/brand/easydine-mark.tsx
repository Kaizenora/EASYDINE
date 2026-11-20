import { cn } from "@/lib/utils";

/**
 * EasyDine's own brand mark: the teal circle badge plus the lowercase
 * wordmark. Tenant restaurants never use this for their own identity;
 * it appears on EasyDine's pages and as "Powered by EasyDine".
 */
export function EasyDineMark({
  size = 32,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset, no optimisation needed */}
      <img
        src="/easydine-badge-192.png"
        alt={withWordmark ? "" : "EasyDine"}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
      />
      {withWordmark && (
        <span
          className="font-heading text-primary font-bold leading-none tracking-[-0.02em]"
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          easydine
        </span>
      )}
    </span>
  );
}
