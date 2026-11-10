"use client";

import type {
  BulkTableCreateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
} from "@easydine/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RestaurantTable {
  id: string;
  floorId: string;
  number: string;
  name: string | null;
  capacity: number;
  status: TableStatusDto;
  statusSince: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  shape: "square" | "round" | "rect";
  qrToken: string | null;
  assignedWaiter: { id: string; name: string } | null;
  customerName?: string | null;
  guestCount?: number | null;
  orderNumber?: string | null;
  orderId?: string | null;
  totalAmount?: string | null;
  dishesCount?: number;
  serviceRequest?: "WAITER" | "BILL" | null;
  hasPreparing?: boolean;
  allServed?: boolean;
  activeReservation?: {
    id: string;
    customerName: string;
    guestCount: number;
    reservedAt: string;
  } | null;
}

export interface Floor {
  id: string;
  name: string;
  sortOrder: number;
  tables: RestaurantTable[];
}

export function useFloors(branchId: string | null) {
  return useQuery({
    queryKey: ["floors", branchId],
    queryFn: ({ signal }) => api.get<Floor[]>(`/tables/floors?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
    refetchInterval: 10_000,
  });
}

export function useCreateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post(`/tables/floors?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/tables/floors/${id}?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useCreateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TableDto) => api.post(`/tables?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useBulkCreateTables(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkTableCreateDto) => api.post(`/tables/bulk?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: TableUpdateDto }) =>
      api.patch(`/tables/${id}?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableLayout(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: TableLayoutUpdateDto[]) =>
      api.patch(`/tables/layout?branchId=${branchId}`, updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["floors", branchId] });
      const previousFloors = queryClient.getQueryData<Floor[]>(["floors", branchId]);
      if (previousFloors) {
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        const nextFloors = previousFloors.map((floor) => ({
          ...floor,
          tables: floor.tables.map((table) => {
            const upd = updateMap.get(table.id);
            return upd ? { ...table, ...upd } : table;
          }),
        }));
        queryClient.setQueryData(["floors", branchId], nextFloors);
      }
      return { previousFloors };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFloors) {
        queryClient.setQueryData(["floors", branchId], context.previousFloors);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useDeleteTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableStatus(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatusDto }) =>
      api.patch(`/tables/${id}/status?branchId=${branchId}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["floors", branchId] });
      const previousFloors = queryClient.getQueryData<Floor[]>(["floors", branchId]);
      if (previousFloors) {
        const nextFloors = previousFloors.map((floor) => ({
          ...floor,
          tables: floor.tables.map((table) =>
            table.id === id ? { ...table, status, statusSince: new Date().toISOString() } : table,
          ),
        }));
        queryClient.setQueryData(["floors", branchId], nextFloors);
      }
      return { previousFloors };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFloors) {
        queryClient.setQueryData(["floors", branchId], context.previousFloors);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useRotateQrToken(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RestaurantTable>(`/tables/${id}/qr-token?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}
