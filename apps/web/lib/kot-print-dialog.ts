// Kitchen ticket (KOT) through the cashier PC's normal browser print dialog —
// the route for the hosted setup (web on Vercel, API on Railway), where the
// server cannot reach a printer in the restaurant.
//
// The cashier picks their installed kitchen printer in the dialog. Nothing is
// pre-selected: no printer name, model or address is assumed, and the Windows
// default is not treated as "the kitchen printer".
//
// No popup window is used: the ticket is printed from a hidden, same-origin
// frame, which popup blockers do not touch. The frame is reserved on the click
// itself and filled only after the order was accepted.
//
// Honesty: a browser cannot tell whether paper came out, and `afterprint`
// fires for both Print and Cancel. So the result is only ever "print dialog
// opened" (requested), never "printed". Reprint KOT stays available.

export type KotDialogStatus = "REQUESTED" | "FAILED";

export interface KotDialogResult {
  status: KotDialogStatus;
  message: string;
}

export interface KotPrintSlot {
  readonly frame: HTMLIFrameElement;
  /** Removes the reserved frame without printing (e.g. acceptance failed). */
  release(): void;
}

export type KotPaper = "58mm" | "80mm" | "A4";

const FRAME_ATTR = "data-easydine-kot-frame";

/** Must be called synchronously from the click. Never prints by itself. */
export function reserveKotPrintFrame(): KotPrintSlot {
  const frame = document.createElement("iframe");
  frame.setAttribute(FRAME_ATTR, "reserved");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.title = "Kitchen ticket";
  // A real box (far off-screen) so the ticket lays out at its true width.
  Object.assign(frame.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: "420px",
    height: "800px",
    border: "0",
  });
  document.body.appendChild(frame);
  let released = false;
  return {
    frame,
    release() {
      if (released) return;
      released = true;
      frame.remove();
    },
  };
}

export function kotPageUrl(
  orderId: string,
  branchId: string,
  opts: { reprint?: boolean; paper?: KotPaper; timeZone?: string; kotIds?: string[] },
): string {
  const q = new URLSearchParams({ branchId, paper: opts.paper ?? "80mm" });
  if (opts.timeZone) q.set("tz", opts.timeZone);
  if (opts.reprint) q.set("reprint", "1");
  // Only these tickets (the round just sent / one KDS ticket).
  if (opts.kotIds?.length) q.set("kotIds", opts.kotIds.join(","));
  q.set("t", String(Date.now())); // never a cached copy
  return `/api/v1/orders/${encodeURIComponent(orderId)}/kot?${q.toString()}`;
}

export const KOT_REQUESTED_MESSAGE =
  "Print dialog opened for the KOT — choose your kitchen printer there. EasyDine cannot see whether it printed: check the kitchen printer and use Reprint KOT if nothing came out.";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    // rAF can be paused in a background tab: the timer is the fallback.
    const timer = setTimeout(resolve, 50);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    }
  });
}

/**
 * Loads the KOT page into the reserved frame and opens the print dialog.
 * Resolves once the dialog was requested (or failed to open).
 */
export async function printKotInFrame(
  slot: KotPrintSlot,
  orderId: string,
  branchId: string,
  opts: {
    reprint?: boolean;
    paper?: KotPaper;
    timeZone?: string;
    kotIds?: string[];
    fetchImpl?: typeof fetch;
    /** The KOT page already in hand (sent back with Accept): no request is made. */
    html?: string;
  } = {},
): Promise<KotDialogResult> {
  let html: string;
  if (opts.html) {
    html = opts.html;
  } else {
    const doFetch = opts.fetchImpl ?? fetch;
    try {
      const res = await doFetch(kotPageUrl(orderId, branchId, opts), { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "not allowed for this branch" : `server answered ${res.status}`);
      html = await res.text();
    } catch (e) {
      slot.release();
      return { status: "FAILED", message: `KOT not printed: could not load the ticket (${e instanceof Error ? e.message : "network error"}). Use Reprint KOT.` };
    }
  }

  const win = slot.frame.contentWindow;
  const doc = slot.frame.contentDocument;
  if (!win || !doc) {
    slot.release();
    return { status: "FAILED", message: "KOT not printed: the print frame was closed. Use Reprint KOT." };
  }
  doc.open();
  doc.write(html);
  doc.close();
  slot.frame.setAttribute(FRAME_ATTR, "loaded");

  // One frame for layout before the dialog snapshots the ticket. The page
  // uses system fonts only, so there is nothing to download first.
  await nextFrame();
  try {
    win.addEventListener(
      "afterprint",
      () => {
        // Print or Cancel — indistinguishable. Only tidy up.
        slot.frame.setAttribute(FRAME_ATTR, "dialog-closed");
        setTimeout(() => slot.release(), 1000);
      },
      { once: true },
    );
    win.focus();
    win.print();
    slot.frame.setAttribute(FRAME_ATTR, "print-requested");
    return { status: "REQUESTED", message: KOT_REQUESTED_MESSAGE };
  } catch (e) {
    slot.release();
    return { status: "FAILED", message: `KOT print dialog could not open (${e instanceof Error ? e.message : "blocked"}). Use Reprint KOT.` };
  }
}
