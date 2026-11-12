"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
// Importing the module also registers the bill router used by openReceiptPrint.
import { setActivePrintScope, type PrintScope } from "@/lib/local-print";

/** Current tenant + branch, so printing finds THIS device's saved printers. */
export function usePrintScope(): PrintScope {
  const { data: me } = useCurrentUser();
  const { branchId } = useBranch();
  return { tenantId: me?.user?.restaurantId ?? null, branchId };
}

/** Mounted once in the dashboard layout. Renders nothing. */
export function LocalPrinterScope() {
  const { tenantId, branchId } = usePrintScope();
  useEffect(() => {
    setActivePrintScope({ tenantId, branchId });
  }, [tenantId, branchId]);
  return null;
}
