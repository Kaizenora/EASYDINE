"use client";

import { Pencil, Trash2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  useDeleteTable,
  useUpdateTableLayout,
  type RestaurantTable,
} from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TableShapeIcon } from "./table-shape-icon";

export function EditableTableTile({
  table,
  branchId,
  onEdit,
}: {
  table: RestaurantTable;
  branchId: string | null;
  onEdit: () => void;
}) {
  const updateLayout = useUpdateTableLayout(branchId);
  const deleteTable = useDeleteTable(branchId);

  // Local position persists during and after drag without jumping back
  const [localPos, setLocalPos] = useState({ x: table.posX, y: table.posY });
  const isDragging = useRef(false);
  const dragStart = useRef<{ pointerX: number; pointerY: number; posX: number; posY: number } | null>(
    null,
  );

  // Sync with table updates when not dragging
  useEffect(() => {
    if (!isDragging.current) {
      setLocalPos({ x: table.posX, y: table.posY });
    }
  }, [table.posX, table.posY]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      posX: localPos.x,
      posY: localPos.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !dragStart.current) return;
    const { pointerX, pointerY, posX: startX, posY: startY } = dragStart.current;
    const nextX = Math.max(0, Math.round(startX + (e.clientX - pointerX)));
    const nextY = Math.max(0, Math.round(startY + (e.clientY - pointerY)));
    setLocalPos({ x: nextX, y: nextY });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const finalX = Math.max(0, Math.round(localPos.x));
    const finalY = Math.max(0, Math.round(localPos.y));

    updateLayout.mutate(
      [
        {
          id: table.id,
          posX: finalX,
          posY: finalY,
          width: table.width,
          height: table.height,
          rotation: table.rotation,
        },
      ],
      {
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Could not save position");
          setLocalPos({ x: table.posX, y: table.posY });
        },
      },
    );
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${table.name ?? `Table ${table.number}`}?`)) return;
    deleteTable.mutate(table.id, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete table"),
    });
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "absolute flex cursor-grab touch-none select-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-amber-500/50 bg-[#18181c] text-xs font-medium text-white shadow-md transition-shadow active:cursor-grabbing hover:border-amber-400 hover:shadow-lg",
      )}
      style={{
        left: `${localPos.x}px`,
        top: `${localPos.y}px`,
        width: `${table.width}px`,
        height: `${table.height}px`,
      }}
    >
      <TableShapeIcon shape={table.shape} capacity={table.capacity} className="h-6 w-6 text-amber-400" />
      <span className="text-sm font-bold text-white">{table.name ?? `T${table.number}`}</span>
      {table.customerName && (
        <span
          className="truncate max-w-[85%] text-[10px] font-semibold text-amber-200 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40"
          title={`Guest: ${table.customerName}`}
        >
          👤 {table.customerName}
        </span>
      )}
      <span className="flex items-center gap-1 text-[11px] text-neutral-400">
        <Users className="h-3 w-3" />
        {table.capacity}
      </span>
      <div className="absolute -top-3 right-1 flex gap-1">
        <Button
          variant="secondary"
          size="icon"
          className="h-6 w-6 rounded-md bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white shadow"
          onClick={(e: any) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-6 w-6 rounded-md bg-red-950/80 text-red-400 hover:bg-red-900 hover:text-red-200 shadow"
          onClick={handleDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
