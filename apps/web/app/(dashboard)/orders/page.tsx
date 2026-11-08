"use client";

import { Suspense } from "react";
import { MasterDetailOrders } from "@/components/orders/master-detail-orders";
import { TableRequestsBar } from "@/components/tables/table-requests-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import { useAllOrders, useManagedOrders } from "@/hooks/use-orders";

function OrdersView() {
  const { branchId } = useBranch();
  const { data: allOrders, isLoading, refetch } = useAllOrders(branchId);
  const { data: pendingOrders } = useManagedOrders(branchId, "pending");

  // Fallback combine
  const orders = allOrders && allOrders.length > 0 ? allOrders : (pendingOrders ?? []);

  return (
    <div className="flex flex-col gap-6">
      <TableRequestsBar branchId={branchId} />
      <MasterDetailOrders
        branchId={branchId}
        orders={orders}
        isLoading={isLoading}
        onRefresh={() => void refetch()}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <OrdersView />
    </Suspense>
  );
}
