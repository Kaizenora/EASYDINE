"use client";

import type { SessionUser } from "@easydine/types";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EntityDialogHost } from "@/components/layout/entity-dialog-host";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useBranch } from "@/hooks/use-branch";
import { useDisplaySettings } from "@/hooks/use-settings";
import { BrandFooter } from "./brand-footer";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

function RestaurantBrand() {
  const { branchId } = useBranch();
  const { data } = useDisplaySettings(branchId);
  const restaurant = data?.restaurant;

  // Support custom uploaded restaurant logo from Settings (only when user actively uploads one)
  // Custom logo managed via restaurant settings

  const brandName = restaurant?.name ?? "EasyDine";
  // Fallback initial badge matching reference UI: "HS"
  const initials = brandName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ED";

  const hasUploadedLogo = Boolean(
    (restaurant?.logoUrl &&
      restaurant.logoUrl !== "/logo.png" &&
      restaurant.logoUrl !== "/designer-logo.png" &&
      restaurant.logoUrl !== "/custom-logo.png")
  );
  const logoSrc = restaurant?.logoUrl;

  return (
    <>
      {hasUploadedLogo && logoSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoSrc}
          alt={brandName}
          className="h-8 w-8 shrink-0 rounded-lg object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 font-black text-black text-xs shadow-sm">
          {initials}
        </div>
      )}
      <div className="flex flex-col truncate">
        <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
          {brandName}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
          CASHIER POS
        </span>
      </div>
    </>
  );
}

export function AppShell({
  user,
  children,
}: {
  user?: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <RestaurantBrand />
        </div>
        <div className="px-3 pb-3">
          <BranchSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav user={user} />
        </div>
        <BrandFooter />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center gap-2 px-5">
            <RestaurantBrand />
          </div>
          <div className="px-3 pb-3">
            <BranchSwitcher />
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <SidebarNav user={user} onNavigate={() => setMobileOpen(false)} />
          </div>
          <BrandFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">{children}</main>
        <EntityDialogHost />
      </div>
      <MobileBottomNav user={user} onMore={() => setMobileOpen(true)} />
    </div>
  );
}
