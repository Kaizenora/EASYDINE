"use client";

import type { SessionUser } from "@easydine/types";
import { Menu } from "lucide-react";
import { Suspense, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EntityDialogHost } from "@/components/layout/entity-dialog-host";
import { CashierVoice } from "@/components/pos/cashier-voice";
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
      restaurant.logoUrl !== "/custom-logo.png" &&
      !restaurant.logoUrl.startsWith("/brand/"))
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
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-xs font-bold text-primary-foreground">
          {initials}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-heading text-sm font-semibold tracking-[-0.02em] text-sidebar-foreground">
          {brandName}
        </span>
        <span className="truncate text-xs text-muted-foreground">Cashier</span>
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <RestaurantBrand />
        </div>
        <div className="px-3 pt-3">
          <BranchSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <Suspense fallback={null}>
            <SidebarNav user={user} />
          </Suspense>
        </div>
        <BrandFooter />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
            <RestaurantBrand />
          </div>
          <div className="px-3 pt-3">
            <BranchSwitcher />
          </div>
          <div className="flex-1 overflow-y-auto py-3">
            <Suspense fallback={null}>
              <SidebarNav user={user} onNavigate={() => setMobileOpen(false)} />
            </Suspense>
          </div>
          <BrandFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
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
            <CashierVoice user={user} />
            <LanguageSwitcher compact />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">{children}</main>
        <EntityDialogHost />
      </div>
      <MobileBottomNav user={user} onMore={() => setMobileOpen(true)} />
    </div>
  );
}
