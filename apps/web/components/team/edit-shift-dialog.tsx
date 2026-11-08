"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import type { Shift, PayRow } from "@/hooks/use-hr";

interface EditShiftDialogProps {
  shift: Shift | null;
  staffList: PayRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: {
    id: string;
    userId: string;
    startsAt: string;
    endsAt: string;
    clockIn: string | null;
    clockOut: string | null;
    note: string | null;
  }) => Promise<void>;
}

export function EditShiftDialog({
  shift,
  staffList,
  open,
  onOpenChange,
  onSave,
}: EditShiftDialogProps) {
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [note, setNote] = useState("");
  const [customStaffName, setCustomStaffName] = useState("");
  const [isTypingName, setIsTypingName] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (shift) {
      setUserId(shift.userId || "");
      setCustomStaffName(shift.user?.name || "");
      setIsTypingName(false);
      const d = shift.startsAt ? new Date(shift.startsAt) : new Date();
      setDate(d.toISOString().slice(0, 10));
      setStart(shift.startsAt ? new Date(shift.startsAt).toTimeString().slice(0, 5) : "09:00");
      setEnd(shift.endsAt ? new Date(shift.endsAt).toTimeString().slice(0, 5) : "17:00");
      setClockIn(shift.clockIn ? new Date(shift.clockIn).toTimeString().slice(0, 5) : "");
      setClockOut(shift.clockOut ? new Date(shift.clockOut).toTimeString().slice(0, 5) : "");
      setNote(shift.note || "");
      setConfirmStep(false);
    }
  }, [shift]);

  const handleProceed = () => {
    const chosenName = isTypingName ? customStaffName.trim() : (staffList.find(s => s.userId === userId)?.name || shift?.user?.name);
    if (!userId && !chosenName) return toast.error("Select or type staff member");
    if (!date) return toast.error("Select date");
    setConfirmStep(true);
  };

  const handleConfirmSave = async () => {
    if (!shift) return;
    setIsSaving(true);
    try {
      const startsAt = new Date(`${date}T${start}`).toISOString();
      const endsAt = new Date(`${date}T${end}`).toISOString();
      const resolvedClockIn = clockIn ? new Date(`${date}T${clockIn}`).toISOString() : null;
      const resolvedClockOut = clockOut ? new Date(`${date}T${clockOut}`).toISOString() : null;

      await onSave({
        id: shift.id,
        userId,
        startsAt,
        endsAt,
        clockIn: resolvedClockIn,
        clockOut: resolvedClockOut,
        note: note.trim() || null,
      });
      toast.success("Shift updated successfully");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update shift");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStaff = staffList.find((s) => s.userId === userId) || shift?.user;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirmStep ? "Confirm Shift Changes" : `Edit Shift — ${shift?.user.name || "Staff"}`}
          </DialogTitle>
        </DialogHeader>

        {!confirmStep ? (
          <div className="flex flex-col gap-3 py-2 text-sm">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
                <span>Staff Member</span>
                <button
                  type="button"
                  onClick={() => setIsTypingName(!isTypingName)}
                  className="text-primary hover:underline font-semibold"
                >
                  {isTypingName ? "Pick from list" : "+ Type custom name"}
                </button>
              </div>
              {isTypingName ? (
                <Input
                  placeholder="Staff member name..."
                  value={customStaffName}
                  onChange={(e) => setCustomStaffName(e.target.value)}
                />
              ) : (
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select staff member...</option>
                  {staffList.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Shift Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Scheduled Start</label>
                <Input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Scheduled End</label>
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actual Attendance (In / Out Details)
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Clock In (Time)</label>
                  <Input
                    type="time"
                    value={clockIn}
                    onChange={(e) => setClockIn(e.target.value)}
                    className="mt-1"
                    placeholder="--:--"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Clock Out (Time)</label>
                  <Input
                    type="time"
                    value={clockOut}
                    onChange={(e) => setClockOut(e.target.value)}
                    className="mt-1"
                    placeholder="--:--"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Shift Notes / Station</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Counter 1, Dining Hall, Kitchen Expo"
                className="mt-1"
              />
            </div>

            <DialogFooter className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleProceed}>Review & Confirm →</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2 text-sm">
            <p className="text-muted-foreground">
              Please confirm the updated shift details for <strong>{selectedStaff?.name}</strong>:
            </p>
            <div className="rounded-lg bg-secondary/40 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium text-foreground">{date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled Hours:</span>
                <span className="font-medium text-foreground">
                  {start} – {end}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clock In / Out:</span>
                <span className="font-medium text-foreground">
                  {clockIn ? `In: ${clockIn}` : "Not clocked in"} ·{" "}
                  {clockOut ? `Out: ${clockOut}` : "Not clocked out"}
                </span>
              </div>
              {note && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notes:</span>
                  <span className="font-medium text-foreground">{note}</span>
                </div>
              )}
            </div>

            <DialogFooter className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setConfirmStep(false)} disabled={isSaving}>
                Back
              </Button>
              <Button onClick={handleConfirmSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "✓ Confirm & Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteShiftConfirmDialog({
  shift,
  open,
  onOpenChange,
  onConfirm,
}: {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      toast.success("Shift removed");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove shift");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Shift Confirmation</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to remove the shift for <strong>{shift?.user.name}</strong> on{" "}
          {shift?.startsAt ? new Date(shift.startsAt).toLocaleDateString() : ""}?
        </p>
        <DialogFooter className="mt-3 flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Removing..." : "Yes, Remove Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
