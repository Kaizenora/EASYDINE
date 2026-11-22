import { cn } from "@/lib/utils";

// Small dot next to a nav item / settings tab that has something the user
// should look at (a new order, an update, a failed backup). Flat, no glow.
export function NavDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? "Needs attention"}
      className={cn("ml-auto inline-flex size-2 shrink-0 rounded-full bg-primary", className)}
    />
  );
}
