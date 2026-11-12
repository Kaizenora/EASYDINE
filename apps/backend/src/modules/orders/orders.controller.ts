import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  addOrderItemsSchema,
  billPreviewSchema,
  checkoutSchema,
  createOrderSchema,
  cancelOrderSchema,
  deleteOrdersSchema,
  mergeOrdersSchema,
  refundSchema,
  rejectOrderSchema,
  removeOrderItemSchema,
  updateOrderItemSchema,
  updateOrderSchema,
  type BillPreviewDto,
  type CheckoutDto,
  type RemoveOrderItemDto,
  type UpdateOrderDto,
  type UpdateOrderItemDto,
  type SessionUser,
  tableLabel,
} from '@easydine/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import {
  buildKotTestSlip,
  buildOpenDrawer,
  buildReceiptEscPosJob,
  buildTestSlip,
  resolveProfile,
  type EscposKotOrder,
  type EscposReceiptOrder,
  type PrintResult,
} from './escpos-receipt';
import { probeNetworkPrinter } from './escpos-network';
import {
  PrinterNotFoundError,
  findPrinterDescriptor,
  probeCharDevices,
} from './escpos-usb';
import { listWindowsPrinters } from './escpos-windows-spooler';
import { listComPorts } from './escpos-com-port';
import { KotPrintService, safeTimeZone } from './kot-print.service';
import { serverWindowsPrinters, spoolerTargetFor } from './server-printers';
import {
  deviceKotResultSchema,
  parseDeviceKotOptions,
  parseKotVia,
  parsePaper,
  type DeviceKotResultBody,
} from './device-print-params';
import { upiForBill } from './upi';
import {
  sendToBranchPrinter,
  type BranchPrinterTarget,
} from './printer-transport';
import { OrdersService } from './orders.service';
import { buildKotHtml } from './kot.html';
import { buildReceiptHtml } from './receipt.html';
import { VerifactuService } from '../verifactu/verifactu.service';

type ReceiptData = Awaited<ReturnType<OrdersService['getReceiptData']>>;

function branchPrinterProfile(branch: {
  printerPaperWidthMm: number;
  printerCodepage: string;
  printerColumns: number | null;
}) {
  return resolveProfile({
    paperWidthMm: branch.printerPaperWidthMm,
    codepage: branch.printerCodepage,
    columns: branch.printerColumns,
  });
}

/** "a,b,c" -> ids (at most 20, plain cuid-like tokens), or undefined when absent. */
export function parseKotIds(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw === '') return undefined;
  const ids = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  if (ids.length === 0 || ids.length > 20) throw new BadRequestException('kotIds is invalid');
  return ids;
}

function toKotOrder(order: ReceiptData): EscposKotOrder {
  return {
    orderNumber: order.orderNumber,
    type: order.type,
    createdAt: order.createdAt,
    table: order.table
      ? { label: tableLabel(order.table.number, order.table.name) }
      : null,
    customer: order.customer ? { name: order.customer.name ?? 'Guest' } : null,
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      kitchenNote: item.kitchenNote,
      modifiers: item.modifiers.map((m) => ({ nameSnapshot: m.nameSnapshot })),
    })),
  };
}

// Figures that replace the stored ones on a printed bill (an open order's
// bill is priced from what the cashier entered, not from what is saved yet).
type BillOverrides = {
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  tipAmount: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  isProvisional: boolean;
};

function toEscposOrder(
  order: ReceiptData,
  overrides?: BillOverrides,
): EscposReceiptOrder {
  return {
    orderNumber: order.orderNumber,
    type: order.type,
    createdAt: order.createdAt,
    table: order.table
      ? { label: tableLabel(order.table.number, order.table.name) }
      : null,
    customer: order.customer
      ? { name: order.customer.name ?? 'Guest', phone: order.customer.phone }
      : null,
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    taxAmount: Number(order.taxAmount),
    tipAmount: Number(order.tipAmount),
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
    loyaltyDiscountAmount: Number(order.loyaltyDiscountAmount),
    totalAmount: Number(order.totalAmount),
    ...overrides,
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceSnapshot: Number(item.unitPriceSnapshot),
      lineTotal: Number(item.lineTotal),
      taxRateSnapshot: Number(item.taxRateSnapshot),
      modifiers: item.modifiers.map((m) => ({
        nameSnapshot: m.nameSnapshot,
        priceAdjSnapshot: Number(m.priceAdjSnapshot),
      })),
    })),
    payments: order.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      tendered: p.tendered ? Number(p.tendered) : null,
      changeGiven: p.changeGiven ? Number(p.changeGiven) : null,
    })),
  };
}

// "Scan to pay" UPI QR for a bill that is not settled yet, when the
// restaurant has a UPI id (Settings). Null otherwise.
function upiFor(order: ReceiptData, overrides: BillOverrides) {
  const r = order.branch.restaurant;
  return upiForBill({
    vpa: r.upiVpa,
    payeeName: r.upiPayeeName ?? r.name,
    orderNumber: order.orderNumber,
    balanceDue: overrides.balanceDue,
    isProvisional: overrides.isProvisional,
  });
}

// Typing a discount or coupon onto a bill needs discounts.apply, whether it is
// being previewed, printed or charged.
function assertMayAdjust(user: SessionUser, adj: BillPreviewDto) {
  if (
    ((adj.discountPercent ?? 0) > 0 ||
      (adj.discountFlat ?? 0) > 0 ||
      !!adj.couponCode) &&
    !user.permissions.includes('discounts.apply')
  ) {
    throw new ForbiddenException(
      'Missing permission to apply a discount at checkout',
    );
  }
}

// Owners and administrators are never capped; other roles need the explicit
// discounts.unlimited grant (roles saved before it existed do not have it).
function mayExceedDiscountCap(user: SessionUser): boolean {
  return (
    user.roleName === 'OWNER' ||
    user.roleName === 'ADMINISTRATOR' ||
    user.permissions.includes('discounts.unlimited')
  );
}

@ApiTags('orders')
@Controller('v1/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly branchAccess: BranchAccessService,
    private readonly kotPrint: KotPrintService,
    private readonly verifactu: VerifactuService,
  ) {}

  @Auth('orders.create')
  @Get()
  async listOpen(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('tableId') tableId?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.listOpen(branchId, tableId);
  }

  @Auth('orders.create')
  @Get('manage')
  async listForManagement(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('tab') tab?: 'pending' | 'active' | 'history' | 'all',
    @Query('channel') channel?: 'STAFF' | 'ONLINE',
    @Query('type') type?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.listForManagement(branchId, {
      tab,
      channel,
      type,
    });
  }

  @Auth('orders.create')
  @Get(':id')
  async getOrder(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.getOrder(branchId, id);
  }

  @Auth('orders.create')
  @Post()
  @UsePipes(new ZodValidationPipe(createOrderSchema))
  async createOrder(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.createOrder(branchId, user.id, body as never);
  }

  @Auth('orders.edit')
  @Post(':id/items')
  @UsePipes(new ZodValidationPipe(addOrderItemsSchema))
  async addItems(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { items } = body as { items: never };
    return this.ordersService.addItems(branchId, id, items);
  }

  // kotVia=device: the cashier PC prints the tickets on its own saved Kitchen
  // printer (kotFormat=escpos|html, kotPaper=58mm|80mm|A4, tz=IANA zone).
  // kotVia=none: accept without printing anywhere (that PC's saved printer is
  // missing). Default: the branch printer on the server, as before.
  @Auth('orders.accept')
  @Post(':id/accept')
  async accept(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Query('kotVia') kotVia?: string,
    @Query('kotFormat') kotFormat?: string,
    @Query('kotPaper') kotPaper?: string,
    @Query('tz') tz?: string,
    @Query('kotPrinter') kotPrinter?: string,
  ) {
    // Without a branch the order lookup would not be scoped to this tenant.
    if (!branchId) throw new BadRequestException('branchId is required');
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.acceptOrder(branchId, id, user.id, {
      via: parseKotVia(kotVia),
      device: parseDeviceKotOptions({
        format: kotFormat,
        paper: kotPaper,
        tz,
      }),
      printer: kotPrinter,
    });
  }

  @Auth('orders.accept')
  @Post(':id/reject')
  @UsePipes(new ZodValidationPipe(rejectOrderSchema))
  async reject(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { reason } = body as { reason: string };
    return this.ordersService.rejectOrder(branchId, id, user.id, reason);
  }

  @Auth('orders.cancel')
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body?: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { reason, confirmStarted, source } = cancelOrderSchema
      .partial()
      .parse(body ?? {});
    return this.ordersService.cancelOrder(branchId, id, user.id, reason, {
      confirmStarted,
      source,
    });
  }

  // --- Bill corrections (open bills only) -----------------------------------
  // Paid bills are never edited in place: they go through refund (money and,
  // where chosen, stock), which keeps the ledger and audit trail intact.

  @Auth('orders.edit')
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateOrderSchema))
  async update(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.updateOrder(
      branchId,
      id,
      user.id,
      body as UpdateOrderDto,
    );
  }

  @Auth('orders.edit')
  @Patch(':id/items/:itemId')
  @UsePipes(new ZodValidationPipe(updateOrderItemSchema))
  async updateItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.updateOrderItem(
      branchId,
      id,
      itemId,
      user.id,
      body as UpdateOrderItemDto,
    );
  }

  @Auth('orders.edit')
  @Post(':id/items/:itemId/remove')
  @UsePipes(new ZodValidationPipe(removeOrderItemSchema))
  async removeItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.removeOrderItem(
      branchId,
      id,
      itemId,
      user.id,
      (body as RemoveOrderItemDto).reason,
    );
  }

  // What discount checkout would apply right now (happy hour and/or a
  // coupon), so the bill screen shows the real amount due before paying.
  @Auth('bills.print')
  @Post(':id/discount-preview')
  async discountPreview(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: { couponCode?: string },
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    if (body?.couponCode && !user.permissions.includes('discounts.apply')) {
      throw new ForbiddenException('Missing permission to apply a coupon');
    }
    return this.ordersService.previewDiscount(branchId, id, body?.couponCode);
  }

  // The bill as it would settle right now, priced by the server. Read-only.
  @Auth('bills.print')
  @Post(':id/bill-preview')
  @UsePipes(new ZodValidationPipe(billPreviewSchema))
  async billPreview(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const adj = body as BillPreviewDto;
    assertMayAdjust(user, adj);
    return this.ordersService.previewBill(branchId, id, adj);
  }

  @Auth('bills.print')
  @Post(':id/checkout')
  @UsePipes(new ZodValidationPipe(checkoutSchema))
  async checkout(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const dto = body as CheckoutDto;
    assertMayAdjust(user, dto);
    // `bills.print` (required above) only covers settling a bill at its
    // already-priced total — discounting it further is a distinct,
    // separately-grantable permission (see packages/types/src/permissions.ts;
    // WAITER holds bills.print but not discounts.apply by default). Without
    // this check, any role that can checkout could zero out a bill via
    // discountPercent=100, bypassing the manager/cashier-only control.
    // A coupon code is a discount too, so it needs the same permission
    // (the automatic happy-hour discount does not — no one chooses it).
    if (
      ((dto.discountPercent ?? 0) > 0 ||
        (dto.discountFlat ?? 0) > 0 ||
        !!dto.couponCode) &&
      !user.permissions.includes('discounts.apply')
    ) {
      throw new ForbiddenException(
        'Missing permission to apply a discount at checkout',
      );
    }
    return this.ordersService.checkout(
      branchId,
      id,
      user.id,
      dto,
      mayExceedDiscountCap(user),
    );
  }

  // The bill / receipt page. For an open order it is the BILL as priced from
  // the adjustments in the query (same fields as bill-preview) and says
  // "payment pending"; for a paid order it is the receipt. Either way it only
  // reads: printing it any number of times never charges or closes anything.
  @Auth('bills.print')
  @Get('sample-receipt')
  async sampleReceipt(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('paperSize') paperSizeQuery: string,
    @Res() res: Response,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const branch = await this.ordersService.getBranchForReceipt(branchId);
    const paperSize = paperSizeQuery === '58mm' || paperSizeQuery === 'A4' ? paperSizeQuery : '80mm';
    const html = buildReceiptHtml({
      isTest: true,
      paperSize,
      restaurantName: branch.restaurant.name,
      currency: branch.restaurant.currency,
      branch: {
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        gstNumber: branch.gstNumber,
        taxRegime: branch.taxRegime,
        taxMode: branch.taxMode,
        taxLabel: branch.taxLabel,
        taxId: branch.taxId,
      },
      order: {
        orderNumber: 'TEST-0001',
        type: 'DINE_IN',
        createdAt: new Date(),
        table: { label: 'Table Test' },
        customer: { name: 'Sample Customer', phone: '+91 98765 43210' },
        isProvisional: true,
        subtotal: 360,
        discountAmount: 0,
        taxAmount: branch.taxMode === 'EXCLUSIVE' ? 18 : 17.14,
        tipAmount: 0,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
        totalAmount: 360,
        items: [
          {
            nameSnapshot: 'Paneer Mutter',
            quantity: 1,
            unitPriceSnapshot: 300,
            lineTotal: 360,
            taxRateSnapshot: 5,
            modifiers: [
              { nameSnapshot: 'Extra Cheese', priceAdjSnapshot: 40 },
              { nameSnapshot: 'Extra Butter', priceAdjSnapshot: 20 },
            ],
          },
        ],
        payments: [],
      },
    });
    res.type('html').send(html);
  }

  @Auth('bills.print')
  @Get(':id/receipt')
  async receipt(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const adj = billPreviewSchema.parse(query);
    assertMayAdjust(user, adj);
    const { order, overrides } = await this.ordersService.getBillForPrint(
      branchId,
      id,
      adj,
    );
    if (overrides.isProvisional) {
      await this.ordersService.recordBillPrinted(branchId, id, user.id);
    }
    const paperSize = query.paperSize === '58mm' || query.paperSize === 'A4' ? query.paperSize : '80mm';
    const html = buildReceiptHtml({
      paperSize,
      restaurantName: order.branch.restaurant.name,
      currency: order.branch.restaurant.currency,
      branch: {
        name: order.branch.name,
        address: order.branch.address,
        phone: order.branch.phone,
        gstNumber: order.branch.gstNumber,
        taxRegime: order.branch.taxRegime,
        taxMode: order.branch.taxMode,
        taxLabel: order.branch.taxLabel,
        taxId: order.branch.taxId,
      },
      order: {
        ...toEscposOrder(order, overrides),
        verifactu: overrides.isProvisional
          ? null
          : await this.verifactu.qrForOrder(order.id),
        upi: upiFor(order, overrides),
      },
    });
    res.type('html').send(html);
  }

  // Kitchen ticket page (no prices), printed through the cashier PC's own
  // browser print dialog. Read-only: opening or printing it marks nothing as
  // printed, because a browser cannot confirm paper. tz = the cashier PC's
  // time zone (the server may run in UTC), paper = 58mm | 80mm | A4,
  // reprint=1 stamps the copy as a REPRINT.
  @Auth('orders.create')
  @Get(':id/kot')
  async kot(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('tz') tz?: string,
    @Query('paper') paper?: string,
    @Query('reprint') reprint?: string,
    @Query('kotIds') kotIdsRaw?: string,
  ) {
    if (!branchId) throw new BadRequestException('branchId is required');
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const order = await this.ordersService.getReceiptData(branchId, id);
    const kotOrder = toKotOrder(order);
    // kotIds: only those kitchen tickets (the round just sent, or the one
    // ticket a KDS screen reprints), never the rest of the order.
    const kotIds = parseKotIds(kotIdsRaw);
    const only = kotIds ? await this.kotPrint.ticketLines(branchId, id, kotIds) : null;
    if (only && only.tickets.length === 0) throw new NotFoundException('KOT not found');
    const html = buildKotHtml({
      branchName: order.branch.name,
      // Cancelled lines never go to the kitchen.
      order: {
        ...kotOrder,
        items: kotOrder.items.filter(
          (_, i) =>
            order.items[i]?.status !== 'CANCELLED' &&
            (!only || only.orderItemIds.has(order.items[i]!.id)),
        ),
      },
      ticket:
        only && only.tickets.length === 1
          ? { number: only.tickets[0]!.number, station: only.tickets[0]!.station, reprint: 0 }
          : undefined,
      paper: parsePaper(paper) ?? '80mm',
      timeZone: safeTimeZone(tz),
      copyLabel: reprint === '1' || reprint === 'true' ? 'REPRINT' : undefined,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html);
  }

  // --- Direct-USB thermal printing (ESC/POS) ---------------------------------
  // Ported from easydine-pos, which has real hardware to verify against; this
  // app's transport/byte-building code is identical in structure (see
  // escpos-usb.ts/escpos-receipt.ts file comments) but has only been
  // structurally verified here (module loads, correct 503 with no printer
  // attached) — no physical thermal printer in this dev environment.

  @Auth('bills.print')
  @Get('print/diagnostics')
  async printDiagnostics(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId?: string,
  ) {
    const lpDevices = await probeCharDevices();
    const libusbPrinter = findPrinterDescriptor();
    let network: {
      host: string;
      port: number;
      reachable: boolean;
      error: string | null;
    } | null = null;
    let connection = 'USB';
    if (branchId) {
      await this.branchAccess.assertAccess(user.restaurantId, branchId);
      const target = await this.ordersService.printerTarget(branchId);
      connection = target.printerConnection;
      if (connection === 'NETWORK' && target.printerHost) {
        network = {
          host: target.printerHost,
          port: target.printerPort,
          ...(await probeNetworkPrinter({
            host: target.printerHost,
            port: target.printerPort,
          })),
        };
      }
    }
    const canPrint =
      connection === 'NETWORK'
        ? network?.reachable === true
        : lpDevices.length > 0 || libusbPrinter !== null;
    return {
      connection,
      lpDevices,
      libusbPrinter,
      network,
      canPrint,
      notes: canPrint
        ? []
        : connection === 'NETWORK'
          ? [
              network
                ? `Cannot reach ${network.host}:${network.port} from the server${network.error ? ` (${network.error})` : ''}.`
                : 'Network printing is selected but no printer address is set.',
            ]
          : [
              'No printer detected. On the till, check `lsusb` lists it and `ls -l /dev/usb/lp0` exists; the backend container needs the USB passthrough from docker-compose.yml (Linux host only). A server in the cloud cannot reach a USB or LAN printer - use a network printer the server can reach, or the browser print buttons.',
            ],
    };
  }

  // Test slip. kind=kot prints a sample kitchen ticket so the kitchen printer
  // can be checked end to end (paper width, code page, wording).
  @Auth('bills.print')
  @Post('print/test')
  async printTest(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId?: string,
    @Query('kind') kind?: string,
    @Query('via') via?: string,
    @Query('width') width?: string,
    @Query('printer') printer?: string,
  ) {
    let profile = resolveProfile();
    let target: BranchPrinterTarget = {
      printerConnection: 'USB',
      printerHost: null,
      printerPort: 9100,
    };
    if (branchId) {
      await this.branchAccess.assertAccess(user.restaurantId, branchId);
      profile = await this.ordersService.printerProfile(branchId);
      target = await this.ordersService.printerTarget(branchId);
    }
    // A cashier PC testing its own printer uses its own paper width.
    if ((via === 'device' || via === 'spooler') && (width === '58' || width === '80')) {
      profile = resolveProfile({
        paperWidthMm: Number(width),
        codepage: profile.codepage,
      });
    }
    const buffer =
      kind === 'kot'
        ? buildKotTestSlip(profile).buffer
        : buildTestSlip(profile);
    if (via === 'device') {
      return { ok: true, profile, escpos: [buffer.toString('base64')] };
    }
    if (via === 'spooler') {
      // A printer chosen on this server PC; must be installed, never a fallback.
      await this.deliver(await this.chosenPrinter(printer), buffer);
      return { ok: true, profile };
    }
    await this.deliver(target, buffer);
    return { ok: true, profile };
  }

  // Opens the cash drawer wired to the thermal printer ("No sale" / test).
  @Auth('bills.print')
  @Post('print/drawer')
  async openDrawer(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId?: string,
    @Query('via') via?: string,
  ) {
    let target: BranchPrinterTarget = {
      printerConnection: 'USB',
      printerHost: null,
      printerPort: 9100,
    };
    if (branchId) {
      await this.branchAccess.assertAccess(user.restaurantId, branchId);
      target = await this.ordersService.printerTarget(branchId);
    }
    if (via === 'device') {
      return { ok: true, escpos: [buildOpenDrawer().toString('base64')] };
    }
    await this.deliver(target, buildOpenDrawer());
    return { ok: true };
  }

  // Bill on the thermal printer: native ESC/POS text, branch paper width and
  // code page (`width` = 58|80 overrides the branch setting for this job).
  @Auth('bills.print')
  @Post(':id/print/usb')
  async printUsb(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Query('width') width?: string,
    @Query('drawer') drawer?: string,
    @Query('via') via?: string,
    @Query() query: Record<string, string> = {},
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const adj = billPreviewSchema.parse(query);
    assertMayAdjust(user, adj);
    const { order, overrides } = await this.ordersService.getBillForPrint(
      branchId,
      id,
      adj,
    );
    if (overrides.isProvisional) {
      await this.ordersService.recordBillPrinted(branchId, id, user.id);
    }
    const stored = branchPrinterProfile(order.branch);
    const profile =
      width === '58' || width === '80'
        ? resolveProfile({
            paperWidthMm: Number(width),
            codepage: stored.codepage,
          })
        : stored;
    const job = buildReceiptEscPosJob({
      restaurantName: order.branch.restaurant.name,
      currency: order.branch.restaurant.currency,
      branch: {
        name: order.branch.name,
        address: order.branch.address,
        phone: order.branch.phone,
        gstNumber: order.branch.gstNumber,
        taxRegime: order.branch.taxRegime,
        taxMode: order.branch.taxMode,
        taxLabel: order.branch.taxLabel,
        taxId: order.branch.taxId,
      },
      order: {
        ...toEscposOrder(order, overrides),
        verifactu: overrides.isProvisional
          ? null
          : await this.verifactu.qrForOrder(order.id),
        upi: upiFor(order, overrides),
      },
      profile,
      // A bill handed over before payment never pops the till.
      openDrawer: drawer === 'true' && !overrides.isProvisional,
    });
    // via=device: hand the print data to the phone/tablet instead of printing
    // on the server's own printer (Bluetooth printers, phones, tablets).
    if (via === 'device') return this.deviceJob(job);
    if (via === 'spooler') {
      return this.sendJob(job, await this.chosenPrinter(query.printer));
    }
    const billTarget = await this.ordersService.billPrinterTarget(order.branch.id);
    if (!billTarget) {
      throw new BadRequestException('Bill printer not set');
    }
    return this.sendJob(job, billTarget);
  }

  // Kitchen tickets of an order on the thermal printer: one ticket per kitchen
  // round/station, only those not printed yet. A repeat call answers 409
  // ALREADY_PRINTED instead of printing a duplicate; `reprint=true` prints
  // every ticket again, stamped REPRINT.
  @Auth('orders.create')
  @Post(':id/print/kot')
  async printKot(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Query('reprint') reprint?: string,
    @Query('via') via?: string,
    @Query('format') format?: string,
    @Query('paper') paper?: string,
    @Query('tz') tz?: string,
    @Query('track') track?: string,
    @Query('printer') printer?: string,
    @Query('kotIds') kotIdsRaw?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const kotIds = parseKotIds(kotIdsRaw);
    if (via === 'spooler') {
      // KOT on the Windows printer chosen on this server PC (exact name only).
      const target = await this.chosenPrinter(printer);
      return this.kotPrint.printOrder(
        branchId,
        id,
        reprint === 'true',
        false,
        { ...parseDeviceKotOptions({ paper, tz }), format: 'escpos' },
        target,
        kotIds,
      );
    }
    return this.kotPrint.printOrder(
      branchId,
      id,
      reprint === 'true',
      via === 'device',
      via === 'device'
        ? {
            ...parseDeviceKotOptions({ format, paper, tz }),
            track: track === 'true',
          }
        : {},
      undefined,
      kotIds,
    );
  }

  // Printers installed in Windows on the PC that runs this server. Shown in
  // Settings only when the browser is open on that same PC, so the cashier can
  // pick the Bill / Kitchen printer without installing anything.
  @Auth('bills.print')
  @Get('print/local/printers')
  async localPrinters(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId?: string,
  ) {
    if (branchId) await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { supported, printers } = await serverWindowsPrinters(true);
    return { supported, printers: printers.map((name) => ({ name })) };
  }

  // The cashier PC reports what its local print bridge did with tickets it
  // was handed (QUEUED / FAILED / UNKNOWN). Records only; never re-sends.
  @Auth('orders.create')
  @Post(':id/print/kot/device-result')
  async printKotDeviceResult(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deviceKotResultSchema)) body: DeviceKotResultBody,
  ) {
    if (!branchId) throw new BadRequestException('branchId is required');
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kotPrint.recordDeviceResult(branchId, id, {
      results: body.results,
      reprint: body.reprint,
      printerName: body.printerName,
      deviceId: body.deviceId ?? null,
    });
  }

  // Kept for older clients; same behaviour as POST :id/print/kot.
  @Auth('orders.create')
  @Post(':id/print/kot/usb')
  async printKotUsb(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Query('reprint') reprint?: string,
  ) {
    return this.printKot(user, branchId, id, reprint);
  }

  private async deliver(target: BranchPrinterTarget, buffer: Buffer) {
    try {
      await sendToBranchPrinter(target, buffer);
    } catch (err) {
      if (err instanceof PrinterNotFoundError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
  }

  private async chosenPrinter(name: string | undefined) {
    try {
      return await spoolerTargetFor(name);
    } catch (err) {
      if (err instanceof PrinterNotFoundError) {
        throw new ServiceUnavailableException({
          code: 'PRINTER_MISSING',
          message: err.message,
        });
      }
      throw err;
    }
  }

  private deviceJob(job: PrintResult) {
    return {
      ok: true,
      unsupportedChars: job.unsupportedChars,
      escpos: [job.buffer.toString('base64')],
    };
  }

  private async sendJob(job: PrintResult, target: BranchPrinterTarget) {
    await this.deliver(target, job.buffer);
    return {
      ok: true,
      // Non-empty when the code page could not represent some characters;
      // the ticket says so on paper and the UI offers the browser fallback.
      unsupportedChars: job.unsupportedChars,
    };
  }

  @Auth('refunds.process')
  @Post(':id/refund')
  @UsePipes(new ZodValidationPipe(refundSchema))
  async refund(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.ordersService.refund(branchId, id, user.id, body as never);
  }

  @Auth('orders.delete')
  @Post('delete-bulk')
  @UsePipes(new ZodValidationPipe(deleteOrdersSchema))
  async deleteBulk(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { orderIds, password } = body as {
      orderIds: string[];
      password: string;
    };
    return this.ordersService.deleteFinishedOrders(
      branchId,
      user,
      orderIds,
      password,
    );
  }

  @Auth('orders.edit')
  @Post(':id/merge')
  @UsePipes(new ZodValidationPipe(mergeOrdersSchema))
  async merge(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { sourceOrderId } = body as { sourceOrderId: string };
    return this.ordersService.mergeOrders(branchId, id, sourceOrderId);
  }
}
