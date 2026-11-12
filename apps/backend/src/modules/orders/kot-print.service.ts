import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { tableLabel } from '@easydine/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { buildKotEscPosJob, resolveProfile } from './escpos-receipt';
import { buildKotHtml, type KotPaper } from './kot.html';
import { PrinterNotFoundError } from './escpos-usb';
import {
  sendToBranchPrinter,
  type BranchPrinterTarget,
} from './printer-transport';

export interface KotPrintResult {
  ok: true;
  printed: { id: string; ticketNumber: string; reprint: number }[];
  unsupportedChars: string[];
  /** Base64 ESC/POS data, only when the phone/tablet does the printing. */
  escpos?: string[];
  /** Rendered ticket pages (format=html), only when this device prints them. */
  html?: string[];
}

/**
 * How a device that prints the ticket itself wants it. Only used together
 * with toDevice=true.
 *  - format: raw ESC/POS for a thermal printer, or a page rendered through
 *    the printer's own driver (A4 / thermal printers without raw support).
 *  - paper: overrides the branch paper width for this device's printer.
 *  - timeZone: the printing device's zone, so the ticket shows local time.
 *  - track: the device will report the outcome (recordDeviceResult); until it
 *    does, the ticket honestly says the result is unknown.
 */
export interface DeviceKotOptions {
  format?: 'escpos' | 'html';
  paper?: KotPaper;
  timeZone?: string;
  track?: boolean;
}

export type DevicePrintOutcome = 'QUEUED' | 'FAILED' | 'UNKNOWN';

export interface DeviceKotResult {
  kotId: string;
  status: DevicePrintOutcome;
  error?: string | null;
}

/** Text left on a tracked ticket until the device reports back. */
export const AWAITING_DEVICE_RESULT =
  'Sent to the cashier PC; no print result received yet. Check the kitchen printer and use Reprint KOT if nothing came out.';

/** Only real IANA zones are passed on to the date formatter. */
export function safeTimeZone(tz: string | undefined | null): string | undefined {
  if (!tz || tz.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

// Prints kitchen tickets (KOTs) on the branch's thermal printer.
//
// Duplicate guard: a first print "claims" the ticket with a conditional
// UPDATE (printedCount 0 -> 1) before any bytes are sent, so two taps, two
// tablets or a client retry can never both print the same ticket. If the
// printer then fails, the claim is released so a retry prints it. A copy of a
// ticket that was already printed only happens with reprint=true, and is
// stamped "*** REPRINT #n ***" on paper.
@Injectable()
export class KotPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private load(branchId: string, where: { id?: string; orderId?: string }) {
    return this.prisma.kot.findMany({
      where: {
        ...where,
        order: { branchId },
        status: { not: 'CANCELLED' },
      },
      include: {
        station: true,
        order: {
          include: {
            table: true,
            customer: true,
            branch: true,
          },
        },
        items: {
          where: { status: { not: 'CANCELLED' } },
          include: { orderItem: { include: { modifiers: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async printTicket(branchId: string, kotId: string, reprint: boolean) {
    const kots = await this.load(branchId, { id: kotId });
    if (kots.length === 0) throw new NotFoundException('KOT not found');
    return this.run(branchId, kots, reprint);
  }

  async printOrder(
    branchId: string,
    orderId: string,
    reprint: boolean,
    toDevice = false,
    device: DeviceKotOptions = {},
    /** A specific printer chosen on the cashier PC (server prints there instead of the branch printer). */
    target?: BranchPrinterTarget,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, branchId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const kots = await this.load(branchId, { orderId });
    if (kots.length === 0) {
      throw new ConflictException({
        code: 'NO_TICKETS',
        message: 'This order has no kitchen tickets to print',
      });
    }
    return this.run(branchId, kots, reprint, toDevice, device, target);
  }

  private async run(
    branchId: string,
    kots: Awaited<ReturnType<KotPrintService['load']>>,
    reprint: boolean,
    toDevice = false,
    device: DeviceKotOptions = {},
    target?: BranchPrinterTarget,
  ): Promise<KotPrintResult> {
    // A cashier-PC choice (device printing, or a printer picked on the server
    // PC) brings its own paper width and time zone.
    const custom = toDevice || !!target;
    const format = toDevice && device.format === 'html' ? 'html' : 'escpos';
    const timeZone = custom ? safeTimeZone(device.timeZone) : undefined;
    const devicePaperMm =
      custom && device.paper === '58mm'
        ? 58
        : custom && device.paper === '80mm'
          ? 80
          : null;
    const todo = reprint ? kots : kots.filter((k) => k.printedCount === 0);
    if (todo.length === 0) {
      throw new ConflictException({
        code: 'ALREADY_PRINTED',
        message:
          'This ticket was already printed. Choose Reprint if you really need another copy.',
      });
    }

    const result: KotPrintResult = {
      ok: true,
      printed: [],
      unsupportedChars: [],
      ...(toDevice && format === 'escpos' ? { escpos: [] as string[] } : {}),
      ...(toDevice && format === 'html' ? { html: [] as string[] } : {}),
    };
    for (const kot of todo) {
      if (!reprint) {
        const claimed = await this.prisma.kot.updateMany({
          where: { id: kot.id, printedCount: 0 },
          data: {
            printedCount: 1,
            printedAt: new Date(),
            ...(toDevice && device.track
              ? { lastPrintError: AWAITING_DEVICE_RESULT }
              : {}),
          },
        });
        if (claimed.count === 0) continue; // someone else just printed it
      }

      const branch = kot.order.branch;
      const copy = reprint ? kot.printedCount : 0; // REPRINT #n on paper
      const ticketInfo = {
        number: kot.ticketNumber,
        station: kot.station?.name ?? null,
        reprint: copy,
      };
      const kotOrder = {
          orderNumber: kot.order.orderNumber,
          type: kot.order.type,
          createdAt: kot.order.createdAt,
          table: kot.order.table
            ? {
                label: tableLabel(kot.order.table.number, kot.order.table.name),
              }
            : null,
          customer: kot.order.customer
            ? { name: kot.order.customer.name ?? 'Guest' }
            : kot.order.guestName
              ? { name: kot.order.guestName }
              : null,
          notes: null, // Customer voice/preference notes are cashier-only; never sent to kitchen tickets
          items: kot.items.map(({ orderItem }) => ({
            nameSnapshot: orderItem.nameSnapshot,
            quantity: orderItem.quantity,
            kitchenNote: orderItem.kitchenNote,
            modifiers: orderItem.modifiers.map((m) => ({
              nameSnapshot: m.nameSnapshot,
            })),
          })),
      };
      const job =
        format === 'html'
          ? { buffer: Buffer.alloc(0), unsupportedChars: [] as string[] }
          : buildKotEscPosJob({
              branchName: branch.name,
              profile: resolveProfile({
                paperWidthMm: devicePaperMm ?? branch.printerPaperWidthMm,
                codepage: branch.printerCodepage,
                // A device's own paper width picks its own column count.
                columns: devicePaperMm ? null : branch.printerColumns,
              }),
              ticket: ticketInfo,
              order: kotOrder,
              timeZone,
            });

      try {
        if (toDevice && format === 'html') {
          result.html?.push(
            buildKotHtml({
              branchName: branch.name,
              order: kotOrder,
              ticket: ticketInfo,
              paper: device.paper ?? '80mm',
              timeZone,
            }),
          );
        } else if (toDevice) {
          // The phone/tablet prints it (Bluetooth or system print), so the
          // server only hands over the bytes and records the ticket as printed.
          result.escpos?.push(job.buffer.toString('base64'));
        } else {
          await sendToBranchPrinter(target ?? branch, job.buffer);
          if ((this.prisma as any).printJob) {
            await (this.prisma as any).printJob.create({
              data: {
                branchId,
                orderId: kot.order.id,
                kotId: kot.id,
                jobType: 'KOT',
                target: target
                  ? `WINDOWS_SPOOLER:${target.printerName}`
                  : `${branch.printerConnection}:${branch.printerName || branch.printerHost || branch.printerComPort || 'USB'}`,
                status: 'SENT',
                attempts: 1,
                reprint,
              },
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Printing failed';
        if ((this.prisma as any).printJob) {
          await (this.prisma as any).printJob.create({
            data: {
              branchId,
              orderId: kot.order.id,
              kotId: kot.id,
              jobType: 'KOT',
              target: target
                ? `WINDOWS_SPOOLER:${target.printerName}`
                : `${branch.printerConnection}:${branch.printerName || branch.printerHost || branch.printerComPort || 'USB'}`,
              status: 'FAILED',
              attempts: 1,
              error: message.slice(0, 300),
              reprint,
            },
          }).catch(() => undefined);
        }
        await this.prisma.kot.update({
          where: { id: kot.id },
          data: {
            lastPrintError: message.slice(0, 300),
            // Release the first-print claim so a retry can print it.
            ...(reprint ? {} : { printedCount: 0, printedAt: null }),
          },
        });
        if (err instanceof PrinterNotFoundError) {
          throw new ServiceUnavailableException(err.message);
        }
        throw new ServiceUnavailableException(
          `Kitchen printer error: ${message}`,
        );
      }

      const updated = await this.prisma.kot.update({
        where: { id: kot.id },
        data: {
          // A tracked device job is not "printed" until the device reports.
          lastPrintError:
            toDevice && device.track ? AWAITING_DEVICE_RESULT : null,
          ...(reprint
            ? { printedCount: { increment: 1 }, printedAt: new Date() }
            : {}),
        },
      });
      result.printed.push({
        id: kot.id,
        ticketNumber: kot.ticketNumber,
        reprint: copy,
      });
      result.unsupportedChars.push(...job.unsupportedChars);
      this.realtime.emitToBranch(branchId, 'kot.reprinted', {
        id: updated.id,
        printedCount: updated.printedCount,
      });
    }
    if (result.printed.length === 0) {
      // Every ticket was claimed by a concurrent request.
      throw new ConflictException({
        code: 'ALREADY_PRINTED',
        message: 'These tickets were just printed by another request.',
      });
    }
    result.unsupportedChars = [...new Set(result.unsupportedChars)];
    return result;
  }

  /**
   * The cashier PC reports what its local print bridge did with tickets it
   * was handed (toDevice + track). Nothing is ever re-sent from here:
   *  - QUEUED: the Windows print queue accepted the job. That is NOT proof of
   *    paper, so nothing claims "printed" beyond the existing printedCount.
   *  - FAILED: nothing reached the queue. A first print's claim is released
   *    so an explicit Print/Reprint can send it; the error stays visible.
   *  - UNKNOWN: it may or may not have printed; the claim is kept so only an
   *    explicit Reprint (stamped REPRINT) makes another copy.
   */
  async recordDeviceResult(
    branchId: string,
    orderId: string,
    input: {
      results: DeviceKotResult[];
      reprint: boolean;
      printerName: string;
      deviceId: string | null;
    },
  ) {
    const ids = [...new Set(input.results.map((r) => r.kotId))];
    const kots = await this.prisma.kot.findMany({
      where: { id: { in: ids }, orderId, order: { branchId } },
      select: { id: true, printedCount: true },
    });
    const known = new Map(kots.map((k) => [k.id, k]));
    const recorded: { kotId: string; status: DevicePrintOutcome }[] = [];
    for (const r of input.results) {
      const kot = known.get(r.kotId);
      if (!kot) continue; // not this order / branch: ignored, never trusted
      const error = (r.error ?? '').slice(0, 250) || null;
      const lastPrintError =
        r.status === 'QUEUED'
          ? null
          : r.status === 'FAILED'
            ? `Print failed on the cashier PC: ${error ?? 'unknown error'}`
            : `Print status unknown on the cashier PC${error ? `: ${error}` : ''}. Check the kitchen printer; use Reprint KOT if nothing came out.`;
      await this.prisma.kot.update({
        where: { id: kot.id },
        data: {
          lastPrintError: lastPrintError?.slice(0, 300) ?? null,
          ...(r.status === 'FAILED' && !input.reprint && kot.printedCount === 1
            ? { printedCount: 0, printedAt: null }
            : {}),
        },
      });
      if ((this.prisma as any).printJob) {
        await (this.prisma as any).printJob
          .create({
            data: {
              branchId,
              orderId,
              kotId: kot.id,
              jobType: 'KOT',
              target: `DEVICE:${input.printerName.slice(0, 120)}${input.deviceId ? `@${input.deviceId.slice(0, 40)}` : ''}`,
              status: r.status,
              attempts: 1,
              error,
              reprint: input.reprint,
            },
          })
          .catch(() => undefined);
      }
      recorded.push({ kotId: kot.id, status: r.status });
    }
    this.realtime.emitToBranch(branchId, 'kot.updated', { orderId });
    return { ok: true as const, recorded };
  }
}
