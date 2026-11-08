"use client";

import { PERMISSIONS } from "@easydine/types";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useSetPermissionOverrides, type StaffMember } from "@/hooks/use-staff";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Choice = "DEFAULT" | "GRANT" | "DENY";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "DEFAULT", label: "Role" },
  { value: "GRANT", label: "Allow" },
  { value: "DENY", label: "Block" },
];

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/**
 * Per-person exceptions on top of their role: allow one extra thing, or block
 * one thing, optionally until a date. Everything else stays "Role" (inherit).
 */
export function StaffAccessDialog({ member }: { member: StaffMember }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useCurrentUser();
  const { data: roles } = useRoles();
  const save = useSetPermissionOverrides();

  const initial = useMemo(() => {
    const m: Record<string, Choice> = {};
    const overrides = Array.isArray(member?.permissionOverrides) ? member.permissionOverrides : [];
    for (const o of overrides) {
      const k = o?.permission?.key || (o as any)?.key;
      if (k && o?.effect) m[k] = o.effect;
    }
    return m;
  }, [member?.permissionOverrides]);

  const [choices, setChoices] = useState<Record<string, Choice>>(initial);
  const [until, setUntil] = useState(() => {
    const overrides = Array.isArray(member?.permissionOverrides) ? member.permissionOverrides : [];
    return overrides.find((o) => o?.expiresAt)?.expiresAt?.slice(0, 10) ?? "";
  });
  const [reason, setReason] = useState(() => {
    const overrides = Array.isArray(member?.permissionOverrides) ? member.permissionOverrides : [];
    return overrides.find((o) => o?.reason)?.reason ?? "";
  });

  const roleKeys = useMemo(() => {
    const role = roles?.find((r) => r.id === member?.roleId);
    if (!role || !Array.isArray(role.permissions)) return new Set<string>();
    return new Set(
      role.permissions
        .map((p: any) => p?.permission?.key || (typeof p === "string" ? p : p?.key))
        .filter(Boolean) as string[],
    );
  }, [roles, member?.roleId]);

  const myKeys = useMemo(() => new Set(me?.user?.permissions ?? []), [me]);

  const groups = useMemo(() => {
    const map = new Map<string, (typeof PERMISSIONS)[number][]>();
    for (const p of PERMISSIONS) map.set(p.category, [...(map.get(p.category) ?? []), p]);
    return [...map.entries()];
  }, []);

  const changed = Object.entries(choices).filter(([, v]) => v !== "DEFAULT");
  const isOwner = member?.role?.name === "OWNER" || member?.role?.name === "ADMIN";

  const onOpenChange = (next: boolean) => {
    if (next) setChoices(initial);
    setOpen(next);
  };

  const onSave = () => {
    const expiresAt = until ? new Date(`${until}T23:59:59`).toISOString() : undefined;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      toast.error("Pick an end date in the future");
      return;
    }
    save.mutate(
      {
        id: member.id,
        overrides: changed.map(([permissionKey, effect]) => ({
          permissionKey,
          effect: effect as "GRANT" | "DENY",
          reason: reason.trim() || undefined,
          expiresAt,
        })),
      },
      {
        onSuccess: () => {
          toast.success(`${member.name}'s access updated`);
          setOpen(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Edit access overrides"
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5 text-primary" />
            Access
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Access overrides</span>
            <Badge variant="outline" className="text-xs font-normal">
              {member.name}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Grant or deny specific permissions on top of {member.name}&apos;s role (
            <strong>{member.role?.label ?? member.role?.name ?? "Staff"}</strong>). Leave at
            &ldquo;Role&rdquo; to inherit.
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {member.name} has the <strong>{member.role?.name}</strong> role which grants full system
            access by default. Overrides are rarely needed.
          </p>
        )}

        <div className="flex flex-col gap-5 py-2">
          {groups.map(([category, perms]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {perms.map((p) => {
                  const roleHas = roleKeys.has(p.key);
                  const current = choices[p.key] ?? "DEFAULT";
                  const canGrant = myKeys.has("*") || myKeys.has(p.key);

                  return (
                    <div
                      key={p.key}
                      className="flex items-center justify-between gap-3 p-3 text-xs"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{p.label}</span>
                        {"description" in p && <span className="text-muted-foreground">{(p as any).description}</span>}
                        <span className="text-[10px] text-muted-foreground/75">
                          Role default:{" "}
                          <strong className={roleHas ? "text-primary" : "text-muted-foreground"}>
                            {roleHas ? "Allowed" : "Not allowed"}
                          </strong>
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center rounded-lg border border-border bg-muted/40 p-0.5">
                        {CHOICES.map((c) => {
                          const disabled = c.value === "GRANT" && !canGrant;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                setChoices((prev) => ({
                                  ...prev,
                                  [p.key]: c.value,
                                }))
                              }
                              className={cn(
                                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                                current === c.value
                                  ? c.value === "GRANT"
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : c.value === "DENY"
                                    ? "bg-destructive text-destructive-foreground shadow-sm"
                                    : "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground",
                                disabled && "cursor-not-allowed opacity-40",
                              )}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {changed.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Override details
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="until-date" className="text-xs">
                    Temporary until (optional)
                  </Label>
                  <Input
                    id="until-date"
                    type="date"
                    min={tomorrow()}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Leave blank to keep overrides active indefinitely.
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason-input" className="text-xs">
                    Reason / audit note
                  </Label>
                  <Input
                    id="reason-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Covering supervisor shift"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? "Saving..." : "Save overrides"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
