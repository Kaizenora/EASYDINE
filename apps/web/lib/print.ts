import { canPrintOnDevice, printHtmlOnDevice } from "@/lib/device-print";
import { toast } from "@/lib/toast";
import {
  applyReceiptPrintLayout,
  getReceiptPrintLayout,
} from "@/lib/receipt-print-layout";

/** Bill figures the cashier has typed but not yet saved (see receipt route). */
export type BillQuery = Record<string, string | number | undefined>;

export function billQueryString(adj: BillQuery = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(adj)) {
    if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `&${s}` : "";
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 15_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitForImages(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map(async (image) => {
      if (!image.src) return;
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener(
            "error",
            () => reject(new Error("A receipt image could not be loaded.")),
            { once: true },
          );
        });
      }
      if (image.naturalWidth === 0) {
        throw new Error("A receipt image could not be loaded.");
      }
      if (image.decode) await image.decode();
    }),
  );
}

async function printInHiddenFrame(html: string, name: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Printing is only available in a browser.");
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;top:-10000px;left:-10000px;width:800px;height:1200px;border:0;";
  document.body.appendChild(frame);
  let printStarted = false;

  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () =>
          reject(new Error(`Could not load the ${name.toLowerCase()} for printing.`));
        frame.srcdoc = html;
      }),
      `The ${name.toLowerCase()} took too long to load for printing.`,
    );

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Could not prepare the receipt preview for printing.");

    await withTimeout(
      Promise.all([doc.fonts?.ready, waitForImages(doc)]).then(() => undefined),
      `The ${name.toLowerCase()} content did not finish loading.`,
    );

    if (typeof win.print !== "function") {
      throw new Error("This browser cannot open the print dialog.");
    }
    try {
      win.focus();
      win.print();
      printStarted = true;
    } catch (error) {
      throw new Error("The browser could not open the print dialog. Check the printer driver and try again.", {
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Could not load the ${name.toLowerCase()} for printing.`, { cause: error });
  } finally {
    if (printStarted) setTimeout(() => frame.remove(), 60_000);
    else frame.remove();
  }
}

/** Prints a self-contained receipt document; browser output never prints the app page. */
export async function printHtmlDocument(
  html: string,
  name: string,
  receipt = false,
): Promise<void> {
  const documentHtml = receipt
    ? applyReceiptPrintLayout(html, getReceiptPrintLayout())
    : html;
  if (canPrintOnDevice()) {
    await printHtmlOnDevice(documentHtml, name);
    return;
  }
  await printInHiddenFrame(documentHtml, name);
}

async function printPage(url: string, name: string, receipt = false): Promise<void> {
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load the ${name.toLowerCase()} (${response.status}).`);
    }
    await printHtmlDocument(await response.text(), name, receipt);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not open the print dialog.");
  }
}

/** Browser print of the bill (open order) or receipt (paid order). Read-only. */
export function openReceiptPrint(
  orderId: string,
  branchId: string,
  adj: BillQuery = {},
) {
  void printPage(
    `/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}`,
    "Bill",
    true,
  );
}

export function openKotPrint(orderId: string, branchId: string) {
  void printPage(
    `/api/v1/orders/${orderId}/kot?branchId=${branchId}`,
    "Kitchen ticket",
  );
}
