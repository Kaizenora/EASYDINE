/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- supertest bodies are untyped by design */
// Customer-after-payment (Part B) and the pricing / print / time / auto-print /
// live-update regression guards (Part E), against a REAL migrated + seeded Postgres.
// Opt-in:
//   REGRESSION_E2E=1 DATABASE_URL=... JWT_SECRET=x npx jest --config ./test/jest-e2e.json --runInBand payment-customer-regression
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { KotPrintService } from './../src/modules/orders/kot-print.service';
import { OrdersService } from './../src/modules/orders/orders.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { RealtimeGateway } from './../src/realtime/realtime.gateway';

jest.setTimeout(60000);
const run = process.env.REGRESSION_E2E ? describe : describe.skip;
const BRANCH = 'demo-branch';
const q = `?branchId=${BRANCH}`;
const tag = randomUUID().slice(0, 6);
const phoneDigits = () =>
  '9' + Math.floor(Math.random() * 1e9).toString().padStart(9, '0');

run('Customer after payment + regression guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let kotPrint: KotPrintService;
  let agent: ReturnType<typeof request.agent>;
  let isoBranchId: string | null = null;
  const events: { event: string; payload: any }[] = [];
  const items: Record<string, string> = {};

  const post = (p: string, b?: object) => agent.post(`/api/v1${p}`).send(b);
  const get = (p: string) => agent.get(`/api/v1${p}`);

  const newOrder = async (
    lines: { key: string; quantity?: number }[] = [{ key: 'p300' }],
  ) => {
    const res = await post(`/orders${q}`, {
      type: 'TAKEAWAY',
      items: lines.map((l) => ({
        menuItemId: items[l.key],
        quantity: l.quantity ?? 1,
        modifierIds: [],
      })),
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body;
  };
  const pay = (orderId: string, extra: object = {}, amount = 300) =>
    post(`/orders/${orderId}/checkout${q}`, {
      payments: [{ method: 'CASH', amount }],
      ...extra,
    });
  // Matches by digits, so legacy rows saved as "+91 98765-43210" are found too.
  const customersWithPhone = async (phone: string) =>
    (
      await prisma.customer.findMany({
        where: { branchId: BRANCH, phone: { contains: phone.slice(-5) } },
      })
    ).filter((c) => (c.phone ?? '').replace(/\D/g, '').endsWith(phone));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: [] });
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    kotPrint = app.get(KotPrintService);

    const gateway = app.get(RealtimeGateway);
    const emit = gateway.emitToBranch.bind(gateway);
    jest
      .spyOn(gateway, 'emitToBranch')
      .mockImplementation((b: string, event: string, payload: unknown) => {
        events.push({ event, payload });
        emit(b, event, payload);
      });

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);

    const cats = (await get(`/menu/categories${q}`).expect(200)).body;
    const mk = async (key: string, price: number) => {
      items[key] = (
        await post(`/menu/items${q}`, {
          categoryId: cats[0].id,
          name: `${key}-${tag}`,
          price,
          taxRatePercent: 0,
        }).expect(201)
      ).body.id;
    };
    await mk('p300', 300);
    await mk('p40', 40);
    await mk('p20', 20);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    // the throwaway second branch must not linger in the demo restaurant
    if (isoBranchId) await prisma.branch.delete({ where: { id: isoBranchId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------- Part B
  describe('customer record after payment', () => {
    it('name + phone typed at payment creates one customer and links it to the paid order', async () => {
      const phone = phoneDigits();
      const o = await newOrder();
      const since = events.length;
      const res = await pay(o.id, {
        customerName: 'Asha Verma',
        customerPhone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      }).expect(201);
      expect(res.body.settlement.fullyPaid).toBe(true);
      const rows = await customersWithPhone(phone);
      expect(rows).toHaveLength(1);
      expect(rows[0].phone).toBe(phone); // stored in the normalized 10-digit form
      expect(rows[0].name).toBe('Asha Verma');
      const paid = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(paid.customerId).toBe(rows[0].id);
      // live update: the Customers page is told to refresh
      expect(
        events.slice(since).filter((e) => e.event === 'customer.updated').length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('the same phone in a different format reuses the customer (and a legacy-format row)', async () => {
      const phone = phoneDigits();
      const legacy = await prisma.customer.create({
        data: {
          branchId: BRANCH,
          name: null,
          phone: `+91 ${phone.slice(0, 5)}-${phone.slice(5)}`,
        },
      });
      const o = await newOrder();
      await pay(o.id, { customerName: 'Legacy Lal', customerPhone: phone }).expect(201);
      const rows = await customersWithPhone(phone);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(legacy.id);
      const o2 = await newOrder();
      await pay(o2.id, { customerPhone: `0${phone}` }).expect(201);
      expect(await customersWithPhone(phone)).toHaveLength(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).customerId,
      ).toBe(legacy.id);
    });

    it('two simultaneous checkouts for the same new phone create exactly one customer', async () => {
      const phone = phoneDigits();
      const [a, b] = [await newOrder(), await newOrder()];
      const [ra, rb] = await Promise.all([
        pay(a.id, { customerName: 'Racer', customerPhone: phone }),
        pay(b.id, { customerName: 'Racer', customerPhone: phone }),
      ]);
      expect([ra.status, rb.status]).toEqual([201, 201]);
      const rows = await customersWithPhone(phone);
      expect(rows).toHaveLength(1);
      const [oa, ob] = await Promise.all(
        [a, b].map((x) => prisma.order.findUniqueOrThrow({ where: { id: x.id } })),
      );
      expect(oa.customerId).toBe(rows[0].id);
      expect(ob.customerId).toBe(rows[0].id);
    });

    it('a name alone never merges: two "Rahul" checkouts stay two different people', async () => {
      const [a, b] = [await newOrder(), await newOrder()];
      await pay(a.id, { customerName: `Rahul-${tag}` }).expect(201);
      await pay(b.id, { customerName: `Rahul-${tag}` }).expect(201);
      const [oa, ob] = await Promise.all(
        [a, b].map((x) => prisma.order.findUniqueOrThrow({ where: { id: x.id } })),
      );
      expect(oa.customerId).toBeTruthy();
      expect(ob.customerId).toBeTruthy();
      expect(oa.customerId).not.toBe(ob.customerId);
      const rows = await prisma.customer.findMany({
        where: { branchId: BRANCH, name: `Rahul-${tag}` },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.phone === null)).toBe(true);
    });

    it('a name never attaches to an existing same-name customer that has a phone', async () => {
      const existing = await prisma.customer.create({
        data: { branchId: BRANCH, name: `Meera-${tag}`, phone: phoneDigits() },
      });
      const o = await newOrder();
      await pay(o.id, { customerName: `Meera-${tag}` }).expect(201);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(after.customerId).not.toBe(existing.id);
    });

    it('is strictly per branch: the same phone in two branches is two customers', async () => {
      const phone = phoneDigits();
      const other = await prisma.branch.create({
        data: { restaurantId: 'demo-restaurant', name: `Iso-${tag}` },
      });
      isoBranchId = other.id;
      const a = await orders.resolveOrCreateCustomer(BRANCH, { phone, name: 'X' });
      const b = await orders.resolveOrCreateCustomer(other.id, { phone, name: 'X' });
      const a2 = await orders.resolveOrCreateCustomer(BRANCH, { phone });
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
      expect(a2).toBe(a);
      const bRow = await prisma.customer.findUniqueOrThrow({ where: { id: b! } });
      expect(bRow.branchId).toBe(other.id);
    });

    it('a repeated checkout of the same order is idempotent and creates no duplicates', async () => {
      const phone = phoneDigits();
      const o = await newOrder();
      const requestId = `req-${randomUUID()}`;
      const body = { customerName: 'Once', customerPhone: phone, requestId };
      await pay(o.id, body).expect(201);
      const again = await pay(o.id, body); // same requestId: answered with the original result
      expect(again.status).toBe(201);
      const third = await pay(o.id, { customerPhone: phone }); // already paid
      expect(third.status).toBe(400);
      expect(await customersWithPhone(phone)).toHaveLength(1);
      expect(
        await prisma.payment.count({ where: { orderId: o.id } }),
      ).toBe(1);
    });

    it('a walk-in with no details creates no customer', async () => {
      const before = await prisma.customer.count({ where: { branchId: BRANCH } });
      const o = await newOrder();
      await pay(o.id).expect(201);
      expect(await prisma.customer.count({ where: { branchId: BRANCH } })).toBe(before);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).customerId,
      ).toBeNull();
    });

    it('rejects a malformed phone with a validation error and does not take payment', async () => {
      const o = await newOrder();
      for (const bad of ['abc', '12ab5678901']) {
        expect((await pay(o.id, { customerPhone: bad })).status).toBe(400);
      }
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe('OPEN');
    });

    it('an explicitly picked customer wins over typed details', async () => {
      const picked = await prisma.customer.create({
        data: { branchId: BRANCH, name: `Picked-${tag}`, phone: phoneDigits() },
      });
      const phone = phoneDigits();
      const o = await newOrder();
      await pay(o.id, { customerId: picked.id, customerName: 'Typed', customerPhone: phone }).expect(201);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).customerId,
      ).toBe(picked.id);
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------- Part E
  describe('regression guards', () => {
    it('pricing: 300 + 40 + 20 = 360 before tax/discount, and quantity 2 prices per unit', async () => {
      const o = await newOrder([{ key: 'p300' }, { key: 'p40' }, { key: 'p20' }]);
      const bill = (await post(`/orders/${o.id}/bill-preview${q}`, {}).expect(201)).body;
      expect(Number(bill.subtotal)).toBe(360);
      expect(Number(bill.totalDue)).toBe(360);
      const two = await newOrder([{ key: 'p300', quantity: 2 }]);
      const bill2 = (await post(`/orders/${two.id}/bill-preview${q}`, {}).expect(201)).body;
      expect(Number(bill2.subtotal)).toBe(600);
      const checkout = await pay(o.id, {}, 360).expect(201);
      expect(Number(checkout.body.totalAmount)).toBe(360);
    });

    it('print / reprint works for an active and a paid order and never changes status or payments', async () => {
      const o = await newOrder();
      const snap = async () => {
        const d = await prisma.order.findUniqueOrThrow({
          where: { id: o.id },
          include: { payments: true },
        });
        return { status: d.status, paid: d.payments.length, total: String(d.totalAmount) };
      };
      const before = await snap();
      const p1 = await post(`/orders/${o.id}/print/usb${q}&via=device`);
      expect([200, 201]).toContain(p1.status);
      expect(await snap()).toEqual(before); // active order: untouched
      await pay(o.id).expect(201);
      const paid = await snap();
      expect(paid.status).not.toBe('OPEN');
      const p2 = await post(`/orders/${o.id}/print/usb${q}&via=device`);
      expect([200, 201]).toContain(p2.status);
      const p3 = await post(`/orders/${o.id}/print/usb${q}&via=device`);
      expect([200, 201]).toContain(p3.status);
      expect(await snap()).toEqual(paid); // paid history: reprints are read-only
    });

    it('timestamps: stored as UTC instants and served as ISO strings', async () => {
      const o = await newOrder();
      const detail = (await get(`/orders/${o.id}${q}`).expect(200)).body;
      expect(detail.createdAt).toMatch(/Z$/);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(new Date(detail.createdAt).getTime()).toBe(row.createdAt.getTime());
      expect(Math.abs(Date.now() - row.createdAt.getTime())).toBeLessThan(120_000);
    });

    it('auto-print: accepting an online order fires the kitchen print exactly once', async () => {
      const spy = jest
        .spyOn(kotPrint, 'printOrder')
        .mockResolvedValue({ ok: true } as any);
      const online = await orders.createOrder(
        BRANCH,
        (await prisma.user.findFirstOrThrow({ where: { email: 'owner@demo.local' } })).id,
        {
          type: 'TAKEAWAY',
          guestName: 'Web Guest',
          items: [{ menuItemId: items.p20, quantity: 1, modifierIds: [] }],
        } as any,
        { channel: 'ONLINE', requireAcceptance: true },
      );
      expect(spy).not.toHaveBeenCalled(); // nothing prints before the cashier accepts
      const accepted = await post(`/orders/${online.id}/accept${q}`).expect(201);
      expect(accepted.body.printStatus).toBe('SENT');
      expect(spy).toHaveBeenCalledTimes(1);
      const second = await post(`/orders/${online.id}/accept${q}`);
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(spy).toHaveBeenCalledTimes(1);
      // checking out does not trigger another kitchen print
      await pay(online.id, {}, 20).expect(201);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('live invalidation: checkout broadcasts order/customer updates the screens poll for', async () => {
      const o = await newOrder();
      const since = events.length;
      await pay(o.id, { customerName: 'Live', customerPhone: phoneDigits() }).expect(201);
      const names = events.slice(since).map((e) => e.event);
      expect(names).toContain('order.updated');
      expect(names).toContain('customer.updated');
    });
  });
});
