import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

/**
 * The table QR card: what sits on each table and what guests scan.
 * Used in the landing-page mock now and meant for the printable cards in
 * the owner admin, so every internal size is in `em` and the whole card
 * scales from `width` alone (1em = width / 16).
 *
 * The restaurant's logo (or EasyDine's badge) sits in the centre of the
 * code; error correction "H" keeps it scannable with the centre covered.
 */
export function TableQrCard({
  url,
  table,
  restaurantName,
  logoSrc = "/easydine-badge-192.png",
  width = 192,
  className,
}: {
  url: string;
  table: string;
  restaurantName: string;
  logoSrc?: string;
  width?: number;
  className?: string;
}) {
  const qrPx = Math.round(width * 0.7);
  const logoPx = Math.round(qrPx * 0.22);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[0.75em] border border-border bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
        className,
      )}
      style={{ width, fontSize: width / 16 }}
    >
      <div className="px-[1.25em] pt-[1.1em] text-center">
        <p className="truncate font-heading text-[1.05em] leading-tight font-bold tracking-[-0.02em]">
          {restaurantName}
        </p>

        {/* code inside teal corner marks */}
        <div className="relative mx-auto mt-[0.9em] w-fit p-[0.55em]">
          {(["left-0 top-0 border-t-[0.14em] border-l-[0.14em] rounded-tl-[0.4em]",
            "right-0 top-0 border-t-[0.14em] border-r-[0.14em] rounded-tr-[0.4em]",
            "left-0 bottom-0 border-b-[0.14em] border-l-[0.14em] rounded-bl-[0.4em]",
            "right-0 bottom-0 border-b-[0.14em] border-r-[0.14em] rounded-br-[0.4em]"] as const).map((pos) => (
            <span key={pos} aria-hidden className={cn("absolute size-[1.3em] border-primary", pos)} />
          ))}
          <QRCodeSVG
            value={url}
            size={qrPx}
            level="H"
            fgColor="#1C1917"
            bgColor="#FFFFFF"
            marginSize={0}
            imageSettings={{ src: logoSrc, width: logoPx, height: logoPx, excavate: true }}
            className="block"
            style={{ width: `${(qrPx / width) * 16}em`, height: "auto" }}
          />
        </div>

        <p className="mt-[0.8em] text-[1em] leading-tight font-semibold">Scan to order</p>
        <p className="mt-[0.2em] text-[0.72em] leading-tight text-muted-foreground">
          Menu, order and bill on your phone
        </p>
      </div>

      <div className="mt-[1em] flex items-center justify-between bg-primary px-[1.25em] py-[0.6em] text-[#FBFAF7]">
        <span className="text-[0.7em] font-semibold tracking-[0.12em] uppercase">Table</span>
        <span className="tabular font-heading text-[1.6em] leading-none font-bold tracking-[-0.02em]">{table}</span>
      </div>
    </div>
  );
}
