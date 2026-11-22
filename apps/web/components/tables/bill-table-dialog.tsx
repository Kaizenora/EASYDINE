"use client";

import { CheckoutPanel } from "@/components/pos/checkout-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenOrdersForTable } from "@/hooks/use-orders";
import type { RestaurantTable } from "@/hooks/use-tables";

export function BillTableDialog({
  branchId,
  table,
  open,
  onOpenChange,
  onFreeTable,
}: {
  branchId: string | null;
  table: RestaurantTable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offered when the table has no open bill (e.g. a QR check-in that never ordered). */
  onFreeTable?: () => void;
}) {
  const { data: orders, isLoading } = useOpenOrdersForTable(branchId, open ? table.id : null);
  const order = orders?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bill {table.name ?? `Table ${table.number}`}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : !order ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-center text-sm text-muted-foreground">No open order found for this table.</p>
            {onFreeTable && (
              <Button
                onClick={() => {
                  onFreeTable();
                  onOpenChange(false);
                }}
              >
                Mark table free
              </Button>
            )}
          </div>
        ) : (
          <CheckoutPanel
            order={order}
            branchId={branchId}
            initialCustomer={order.customer}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
