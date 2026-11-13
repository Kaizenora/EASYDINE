"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import { browserStorage } from "@/lib/local-print";
import { deviceId } from "@/lib/printer-routing";
import { loadQueue, queueVersion, removeEntry, subscribeQueue, type QueueScope, type QueuedOrder } from "@/lib/order-queue";
import { browserLock, flushQueue, type SyncedOrder } from "@/lib/order-sync";
import { useCurrentUser } from "@/hooks/use-auth";

const FLUSH_EVERY_MS = 20_000;

/** This browser's new-order queue for the signed-in user, branch and device. */
export function useOrderQueue(branchId: string | null) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const storage = typeof window === "undefined" ? null : browserStorage();
  const dev = useMemo(() => deviceId(storage), [storage]);
  const scope: QueueScope | null =
    me?.user && branchId && dev
      ? { tenantId: me.user.restaurantId, branchId, userId: me.user.id, deviceId: dev }
      : null;
  const scopeKey = scope ? `${scope.tenantId}:${scope.branchId}:${scope.userId}:${scope.deviceId}` : "";

  const version = useSyncExternalStore(subscribeQueue, queueVersion, () => 0);
  const entries: QueuedOrder[] = useMemo(
    () => (scope ? loadQueue(storage, scope) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, version],
  );

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!scope || flushing.current) return null;
    flushing.current = true;
    try {
      const r = await flushQueue({
        storage,
        scope,
        whoAmI: async () => {
          try {
            const res = await api.get<{ user: { id: string; restaurantId: string } }>("/auth/me");
            return { userId: res.user.id, restaurantId: res.user.restaurantId };
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
            throw e;
          }
        },
        findByRequestId: async (b, rid) => {
          try {
            return await api.get<SyncedOrder>(`/orders/by-request?branchId=${b}&requestId=${encodeURIComponent(rid)}`);
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) return null;
            throw e;
          }
        },
        createOrder: (b, dto) => api.post<SyncedOrder>(`/orders?branchId=${b}`, dto),
        withLock: browserLock,
        serverDedups: async () => {
          const r = await fetch("/api/health", { cache: "no-store" });
          const h = (await r.json()) as { features?: string[] };
          return Array.isArray(h.features) && h.features.includes("order-dedup");
        },
      });
      if (r.confirmed.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["floors", scope.branchId] });
        queryClient.invalidateQueries({ queryKey: ["kds"] });
      }
      return r;
    } finally {
      flushing.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, queryClient]);

  const hasPending = entries.some((e) => e.status === "pending" || e.status === "syncing");
  useEffect(() => {
    if (!scope) return;
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const t = hasPending ? setInterval(() => void flush(), FLUSH_EVERY_MS) : null;
    if (hasPending) void flush();
    return () => {
      window.removeEventListener("online", onOnline);
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, hasPending, flush]);

  /**
   * Discard an entry staff decided not to send. The server is asked first: if
   * it already has the order, the entry becomes Confirmed instead.
   */
  const discard = useCallback(
    async (requestId: string): Promise<"discarded" | "already-saved" | "offline"> => {
      if (!scope) return "offline";
      try {
        const found = await api.get<SyncedOrder>(
          `/orders/by-request?branchId=${scope.branchId}&requestId=${encodeURIComponent(requestId)}`,
        );
        if (found) {
          const { updateEntry } = await import("@/lib/order-queue");
          updateEntry(storage, scope, requestId, { status: "confirmed", orderId: found.id, orderNumber: found.orderNumber });
          return "already-saved";
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) return "offline";
      }
      removeEntry(storage, scope, requestId);
      return "discarded";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  const dismiss = useCallback(
    (requestId: string) => {
      if (scope) removeEntry(storage, scope, requestId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  return { scope, storage, entries, flush, discard, dismiss };
}
