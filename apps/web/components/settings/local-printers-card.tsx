"use client";

import { AlertTriangle, Link2, Monitor, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusNote, useStatusNote } from "@/components/ui/status-note";
import { usePrintScope } from "@/components/settings/local-printer-scope";
import { browserStorage, getMappings, listServerPrinters, onServerPc, testLocalPrinter } from "@/lib/local-print";
import {
  bridgeKind,
  detectBridge,
  getHelperPairing,
  HELPER_DEFAULT_PORT,
  listInstalledPrinters,
  pairHelper,
  unpairHelper,
} from "@/lib/local-printer-bridge";
import {
  clearMapping,
  saveMapping,
  type DevicePrinterMappings,
  type InstalledPrinter,
  type PaperSize,
  type PrintMethod,
  type PrinterMapping,
  type PrinterRole,
  type PrintTransport,
} from "@/lib/printer-routing";

const ROLES: { role: PrinterRole; title: string; hint: string }[] = [
  { role: "bill", title: "Bill printer", hint: "Bills and receipts printed from this computer." },
  { role: "kitchen", title: "Kitchen printer", hint: "One KOT when you click Accept & KOT. No prices are printed." },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50";

/**
 * checking → "bridge" (EasyDine Windows app), "helper" (EasyDine Print Helper
 * paired and answering), "server" (this PC runs the EasyDine server), or
 * "absent" (plain browser: print dialog; the helper can be paired).
 */
type Mode = "checking" | "bridge" | "helper" | "server" | "absent";

/**
 * "This computer's printers": pick the Bill and Kitchen printers from the
 * printers already installed in Windows on THIS cashier PC → Test → Save.
 * Saved per device, restaurant and branch. Works with nothing to install when
 * the browser is open on the PC that runs the EasyDine server (the server
 * prints there), or inside the EasyDine Windows app (its print bridge). A
 * plain browser on any other PC cannot list or silently use installed
 * printers, so there it explains the honest fallback instead.
 */
const noSubscribe = () => () => undefined;

/**
 * Hosted users (e.g. Vercel + Railway) are never told to pick printers that
 * the hosted server would print to: that server cannot reach a printer in the
 * restaurant. Without the Windows app or the optional Print Helper they get
 * the print dialog, and this card says so.
 */
export function LocalPrintersCard() {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  return mounted ? <LocalPrintersCardInner /> : null;
}

function LocalPrintersCardInner() {
  const scope = usePrintScope();
  const [bridge, setBridge] = useState<Mode>(bridgeKind() || onServerPc() ? "checking" : "absent");
  const [helperDown, setHelperDown] = useState(false);
  const [pairingVersion, setPairingVersion] = useState(0);
  const [serverUnsupported, setServerUnsupported] = useState(false);
  const [printers, setPrinters] = useState<InstalledPrinter[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumped after Save / Remove so the saved state is re-read from storage.
  const [savedVersion, setSavedVersion] = useState(0);
  const mappings: DevicePrinterMappings = useMemo(
    () => getMappings(scope),
    [scope.tenantId, scope.branchId, savedVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const kind = bridgeKind();
      if (await detectBridge()) {
        setHelperDown(false);
        setBridge(kind === "helper" ? "helper" : "bridge");
        setPrinters(await listInstalledPrinters());
      } else if (onServerPc()) {
        const r = await listServerPrinters(scope.branchId);
        setServerUnsupported(!r.supported);
        setBridge(r.supported ? "server" : "absent");
        if (r.supported) setPrinters(r.printers);
      } else {
        setHelperDown(kind === "helper");
        setBridge("absent");
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not read this computer's printers.");
    } finally {
      setLoading(false);
    }
  }, [scope.branchId, pairingVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = bridge === "bridge" || bridge === "helper" || bridge === "server";
  const transport: PrintTransport = bridge === "server" ? "server" : "bridge";
  const thermalOnly = bridge === "server" || bridge === "helper";

  useEffect(() => {
    // Ask the bridge once the card is on screen (async, outside render).
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Monitor className="h-4 w-4" /> This computer&apos;s printers
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose the Bill printer and Kitchen printer from the printers installed on this cashier PC, test, and save. Saved only for
            this computer and this branch. Works with printers that have a Windows driver (USB, network or Bluetooth paired in Windows).
          </p>
        </div>
        {ready && (
          <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="Refresh printer list">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        )}
      </div>

      {bridge === "checking" && <p className="text-sm text-muted-foreground">Looking for this computer&apos;s printers…</p>}

      {bridge === "server" && (
        <p className="text-xs text-muted-foreground">
          This browser is on the PC that runs the EasyDine server, so the server prints straight to the printer you choose here — nothing to
          install. Thermal printers (58 mm / 80 mm) only.
        </p>
      )}

      {bridge === "helper" && (
        <p className="text-xs text-muted-foreground">
          Printing through the <strong>EasyDine Print Helper</strong> on this PC (thermal 58 mm / 80 mm printers). Keep its window open while
          billing; if it is closed, Accept &amp; KOT and bills open the print dialog instead.
        </p>
      )}

      {bridge === "absent" && (
        <div className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            {helperDown
              ? "The EasyDine Print Helper is paired with this browser but is not answering. Start it on this PC (and allow this site to access apps on this device if the browser asks), then refresh. "
              : serverUnsupported
                ? "This EasyDine server is not running directly on Windows, so it cannot use this PC's installed printers. "
                : "A web browser cannot list this computer's printers or print to one without asking. "}
            Until then, <strong>Accept &amp; KOT opens the print dialog</strong> and so do bills — you choose the printer there each time.
            EasyDine cannot see whether paper came out.
          </span>
        </div>
      )}

      {(bridge === "absent" || bridge === "helper") && (
        <HelperPairingPanel paired={!!getHelperPairing()} onChange={() => setPairingVersion((v) => v + 1)} />
      )}

      {ready && listError && (
        <StatusNote note={{ kind: "error", text: listError }} onClear={() => setListError(null)} />
      )}

      {ready && printers && printers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No printers are installed in Windows on this PC. Install the printer&apos;s Windows driver first (Windows Settings › Printers &amp;
          scanners), then refresh.
        </p>
      )}

      {ready && printers && scope.tenantId && scope.branchId &&
        ROLES.map((r) => (
          <RoleRow
            key={`${r.role}-${scope.branchId}-${transport}`}
            transport={transport}
            thermalOnly={thermalOnly}
            role={r.role}
            title={r.title}
            hint={r.hint}
            printers={printers}
            saved={mappings[r.role]?.transport === transport ? mappings[r.role] : undefined}
            branchId={scope.branchId!}
            onSave={(m) => {
              const storage = browserStorage();
              if (!storage || !scope.tenantId || !scope.branchId) throw new Error("This browser blocked saving settings.");
              saveMapping(storage, scope.tenantId, scope.branchId, r.role, { ...m, transport });
              setSavedVersion((v) => v + 1);
            }}
            onClear={() => {
              const storage = browserStorage();
              if (!storage || !scope.tenantId || !scope.branchId) return;
              clearMapping(storage, scope.tenantId, scope.branchId, r.role);
              setSavedVersion((v) => v + 1);
            }}
          />
        ))}
    </Card>
  );
}

function RoleRow({
  transport,
  thermalOnly,
  role,
  title,
  hint,
  printers,
  saved,
  branchId,
  onSave,
  onClear,
}: {
  transport: PrintTransport;
  /** Server-on-this-PC and the Print Helper send thermal commands only (no A4, no driver pages). */
  thermalOnly: boolean;
  role: PrinterRole;
  title: string;
  hint: string;
  printers: InstalledPrinter[];
  saved: PrinterMapping | undefined;
  branchId: string;
  onSave: (m: { printerName: string; paper: PaperSize; method: PrintMethod }) => void;
  onClear: () => void;
}) {
  // A saved printer that is no longer installed is not pre-selected: it must be chosen again.
  const [printerName, setPrinterName] = useState(
    saved && printers.some((p) => p.name === saved.printerName) ? saved.printerName : "",
  );
  const [paper, setPaper] = useState<PaperSize>(saved && !(thermalOnly && saved.paper === "A4") ? saved.paper : "80mm");
  const [method, setMethod] = useState<PrintMethod>(saved?.method ?? "escpos");
  const [testing, setTesting] = useState(false);
  const { note, show, clear } = useStatusNote();

  const savedMissing = !!saved && !printers.some((p) => p.name === saved.printerName);
  const effectiveMethod: PrintMethod = thermalOnly ? "escpos" : paper === "A4" ? "driver" : method;
  const draft: PrinterMapping | null = printerName
    ? { printerName, paper, method: effectiveMethod, transport, savedAt: "" }
    : null;
  const dirty =
    !saved || saved.printerName !== printerName || saved.paper !== paper || saved.method !== effectiveMethod;

  const runTest = async () => {
    if (!draft) return;
    setTesting(true);
    try {
      const e = await testLocalPrinter(role, draft, branchId);
      show(e.status === "QUEUED" ? "success" : "error", e.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Printer className="h-4 w-4" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {saved && !savedMissing && <Badge variant="secondary">Saved: {saved.printerName}</Badge>}
        {!saved && <Badge variant="outline">Not set on this PC</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {savedMissing && (
        <StatusNote
          note={{
            kind: "error",
            text: `The saved printer "${saved!.printerName}" is not installed on this PC any more. Nothing will print on it, and no other printer is used — choose a printer again and save.`,
          }}
          onClear={() => undefined}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`lp-${role}-printer`}>Printer</Label>
          <select id={`lp-${role}-printer`} className={selectClass} value={printerName} onChange={(e) => setPrinterName(e.target.value)}>
            <option value="">Choose a printer…</option>
            {printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`lp-${role}-paper`}>Paper</Label>
          <select id={`lp-${role}-paper`} className={selectClass} value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
            <option value="80mm">80 mm roll</option>
            <option value="58mm">58 mm roll</option>
            {!thermalOnly && <option value="A4">A4 page</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`lp-${role}-method`}>Send as</Label>
          <select
            id={`lp-${role}-method`}
            className={selectClass}
            value={effectiveMethod}
            disabled={paper === "A4" || thermalOnly}
            onChange={(e) => setMethod(e.target.value as PrintMethod)}
          >
            <option value="escpos">Thermal printer commands</option>
            <option value="driver">Through Windows driver</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {thermalOnly
          ? "If the test prints garbage or nothing, this printer's Windows driver does not accept thermal printer commands; use a thermal printer's own driver (or \"Generic / Text Only\")."
          : "If the test prints garbage or nothing on a thermal printer, choose \"Through Windows driver\"."}
      </p>

      <StatusNote note={note} onClear={clear} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!draft || testing} onClick={() => void runTest()}>
          {testing ? "Sending test…" : "Test"}
        </Button>
        <Button
          size="sm"
          disabled={!draft || !dirty}
          onClick={() => {
            if (!draft) return;
            try {
              onSave({ printerName: draft.printerName, paper: draft.paper, method: draft.method });
              show("success", `${title} saved for this computer: "${draft.printerName}".`);
            } catch (e) {
              show("error", e instanceof Error ? e.message : "Could not save.");
            }
          }}
        >
          Save
        </Button>
        {saved && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setPrinterName("");
              show("info", `${title} removed from this computer. Printing goes back to the previous behaviour.`);
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Optional EasyDine Print Helper: a small program on this PC that lets this
 * browser print to a saved printer without the dialog. One-time pairing with
 * the code shown in the helper's window, so other websites cannot use it.
 */
function HelperPairingPanel({ paired, onChange }: { paired: boolean; onChange: () => void }) {
  const [code, setCode] = useState("");
  const [port, setPort] = useState(String(getHelperPairing()?.port ?? HELPER_DEFAULT_PORT));
  const [busy, setBusy] = useState(false);
  const { note, show, clear } = useStatusNote();

  const pair = async () => {
    setBusy(true);
    clear();
    try {
      await pairHelper(code, Number(port));
      setCode("");
      show("success", "Paired with the EasyDine Print Helper on this PC. Now choose the Bill and Kitchen printers, test each, and save.");
      onChange();
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Link2 className="h-4 w-4" /> Optional: print without the dialog
      </div>
      {paired ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Paired with the Print Helper (port {getHelperPairing()?.port})</Badge>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void unpairHelper()
                .then(() => {
                  show("info", "Unpaired. Accept & KOT and bills use the print dialog again.");
                  onChange();
                })
                .finally(() => setBusy(false));
            }}
          >
            Unpair
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Start the <strong>EasyDine Print Helper</strong> (EasyDinePrintHelper.exe) on this cashier PC, then type the 6-digit code shown
            in its window. The browser may ask to let this site access apps on this device: choose Allow. Without the helper nothing
            changes: the print dialog is used.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="helper-code">Pairing code</Label>
              <Input
                id="helper-code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={7}
                className="w-32"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123 456"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="helper-port">Port</Label>
              <Input id="helper-port" inputMode="numeric" className="w-24" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
            <Button size="sm" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={() => void pair()}>
              {busy ? "Pairing…" : "Pair"}
            </Button>
          </div>
        </>
      )}
      <StatusNote note={note} onClear={clear} />
    </div>
  );
}
