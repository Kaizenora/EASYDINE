import { cn } from "@/lib/utils";

/**
 * The EasyDine product marks (approved artwork in /public/brand). The
 * wordmark has a light-background and a dark-background version; the
 * badge is the compact mark (favicon, small headers). Natural proportions
 * are kept: set the height, the width follows.
 *
 * Restaurant logos and the designer credit are separate and unchanged.
 */
const WORDMARK_RATIO = 832 / 205;

export function EasyDineWordmark({
  height = 32,
  className,
  title = "EasyDine",
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  const width = Math.round(height * WORDMARK_RATIO);
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} style={{ height, width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/easydine-wordmark.png" alt={title} width={width} height={height} className="h-full w-full object-contain dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/easydine-wordmark-dark.png" alt={title} width={width} height={height} className="hidden h-full w-full object-contain dark:block" />
    </span>
  );
}

export function EasyDineBadge({ size = 32, className, title = "EasyDine" }: { size?: number; className?: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/easydine-badge.png"
      alt={title}
      width={size}
      height={size}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
