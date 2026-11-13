"use client";

import { EasyDineWordmark } from "@/components/brand/easydine-logo";
import { cn } from "@/lib/utils";

/**
 * EasyDine product logo for public pages (auth, landing, docs): the approved
 * horizontal wordmark. `size` is the visual height in px. The restaurant's
 * own uploaded logo is shown by the app shell instead and is unaffected.
 */
export function Logo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
  /** @deprecated kept for older call sites; the wordmark already contains the name. */
  withText?: boolean;
  /** @deprecated product logo only; restaurant logos live in the app shell. */
  src?: string;
}) {
  return (
    <span className={cn("inline-flex select-none items-center", className)}>
      <EasyDineWordmark height={size} />
    </span>
  );
}
