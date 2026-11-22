"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReceiptText } from "lucide-react";
import type { SessionUser } from "@easydine/types";
import { hasPermission } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { NavDot } from "./nav-dot";
import { NAV_ITEMS, type NavItem } from "./nav-items";

// Bills is a view of Orders (its History tab), so it lives only here and not
// in NAV_ITEMS, which also drives route permissions.
const BILLS: NavItem = { labelKey: "nav.bills", href: "/orders?view=bills", icon: ReceiptText, permission: "orders.create" };

// Grouped by the job at hand: service screens first, as the cashier uses them.
const GROUPS: { labelKey: string; hrefs: string[] }[] = [
  { labelKey: "nav.group.service", hrefs: ["/pos", "/tables", "/orders", BILLS.href, "/kds"] },
  { labelKey: "nav.group.restaurant", hrefs: ["/menu", "/reports", "/dashboard", "/reservations", "/customers"] },
  { labelKey: "nav.group.admin", hrefs: ["/team", "/accounting", "/settings"] },
];

export function SidebarNav({
  user,
  onNavigate,
}: {
  user?: SessionUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const billsView = useSearchParams()?.get("view") === "bills";
  const { t } = useI18n();
  const badges = useNavBadges();

  const all = [...NAV_ITEMS, BILLS].filter((item) => !item.permission || hasPermission(user, item.permission));
  const byHref = new Map(all.map((i) => [i.href, i]));
  const grouped = new Set(GROUPS.flatMap((g) => g.hrefs));
  // Anything new in NAV_ITEMS that no group names yet still shows, at the end.
  const extra = all.filter((i) => !grouped.has(i.href));

  const isActive = (href: string) => {
    if (href === BILLS.href) return pathname.startsWith("/orders") && billsView;
    if (href === "/orders") return pathname.startsWith("/orders") && !billsView;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav aria-label="Main" className="flex flex-col gap-4 px-3">
      {GROUPS.map((group, gi) => {
        const items = group.hrefs.map((h) => byHref.get(h)).filter(Boolean) as NavItem[];
        if (gi === GROUPS.length - 1) items.push(...extra);
        if (items.length === 0) return null;
        return (
          <div key={group.labelKey} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{t(group.labelKey)}</p>
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      : "font-medium text-sidebar-foreground/80 hover:bg-muted hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} />
                  <span className="truncate">{t(item.labelKey)}</span>
                  {badges.nav[item.href] && !active ? <NavDot /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
