/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped by design */
// Loyalty rules (earn / minimums / redeem / expiry), the customer-menu extras
// (Zomato/Swiggy, review link) and WhatsApp templates, on a REAL migrated +
// seeded Postgres. Restaurant settings are restored afterwards.
//   LOYALTY_E2E=1 DATABASE_URL=... JWT_SECRET=x npx jest --config ./test/jest-e2e.json --runInBand loyalty-extras
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(60000);
const run = process.env.LOYALTY_E2E ? describe : describe.skip;
const BRANCH = 'demo-branch';
const RESTAURANT = 'demo-restaurant';
const q = `?branchId=${BRANCH}`;
const tag = randomUUID().slice(0, 6);
const phone = () =>
  '9' +
  Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, '0');

run('Loyalty, menu extras and WhatsApp templates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let itemId: string;
  let token: string;
  let saved: Record<string, unknown>;
  let other: ReturnType<typeof request.agent>;
  let otherRestaurantId: string;
  const tableIds: string[] = [];

  const pub = () => request(app.getHttpServer());
  const settings = (b: object) =>
    owner.patch('/api/v1/settings/restaurant').send(b);
  const rules = (b: object = {}) =>
    settings({
      loyaltyEnabled: true,
      loyaltyEarnPerCurrency: 100,
      loyaltyPointValue: 1,
      loyaltyMinOrderAmount: 0,
      loyaltyMinRedeemPoints: 0,
      loyaltyExpiryDays: 0,
      ...b,
    }).expect(200);
  /** A takeaway order for 250 (price 250, no tax) that the cashier pays. */
  const payer = new Map<string, string>();
  const order = async (customerPhone: string, qty = 1) => {
    const res = await owner.post(`/api/v1/orders${q}`).send({
      type: 'TAKEAWAY',
      items: [{ menuItemId: itemId, quantity: qty, modifierIds: [] }],
      guestName: 'Asha',
      deliveryPhone: customerPhone,
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    payer.set(res.body.id, customerPhone);
    return res.body.id as string;
  };
  const pay = (id: string, body: object = {}, amount = 250) =>
    owner
      .post(`/api/v1/orders/${id}/checkout${q}`)
      .send({
        payments: [{ method: 'CASH', amount }],
        ...(payer.has(id) && { customerName: 'Asha', customerPhone: payer.get(id) }),
        ...body,
      });
  const byPhone = async (p: string) =>
    (await prisma.customer.findMany({ where: { branchId: BRANCH } })).filter(
      (c) => (c.phone ?? '').replace(/\D/g, '').endsWith(p),
    );

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
      })
      .compile();
    app = mod.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: [] });
    await app.init();
    prisma = app.get(PrismaService);
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: RESTAURANT } });
    saved = {
      loyaltyEnabled: r.loyaltyEnabled,
      loyaltyEarnPerCurrency: r.loyaltyEarnPerCurrency,
      loyaltyPointValue: r.loyaltyPointValue,
      loyaltyMinOrderAmount: r.loyaltyMinOrderAmount,
      loyaltyMinRedeemPoints: r.loyaltyMinRedeemPoints,
      loyaltyExpiryDays: r.loyaltyExpiryDays,
      deliveryRedirectEnabled: r.deliveryRedirectEnabled,
      zomatoUrl: r.zomatoUrl,
      swiggyUrl: r.swiggyUrl,
      reviewUrl: r.reviewUrl,
    };
    const cats = (await owner.get(`/api/v1/menu/categories${q}`).expect(200)).body;
    itemId = (
      await owner
        .post(`/api/v1/menu/items${q}`)
        .send({ categoryId: cats[0].id, name: `loy-${tag}`, price: 250, taxRatePercent: 0 })
        .expect(201)
    ).body.id;
    const floor = await prisma.floor.create({ data: { branchId: BRANCH, name: `L-${tag}`, sortOrder: 98 } });
    const t = await prisma.table.create({
      data: { floorId: floor.id, number: `L${tag}`, capacity: 2, qrToken: randomUUID().replace(/-/g, '') },
    });
    tableIds.push(t.id);
    token = t.qrToken as string;

    // A second restaurant, to prove nothing crosses over.
    process.env.ALLOW_PUBLIC_SIGNUP = 'true';
    const oe = `loy-other-${tag}@example.com`;
    await pub()
      .post('/api/v1/auth/register')
      .send({ ownerName: 'Other', email: oe, password: 'Password123!', restaurantName: `Other ${tag}`, branchName: 'Main' })
      .expect(201);
    other = request.agent(app.getHttpServer());
    await other.post('/api/v1/auth/login').send({ email: oe, password: 'Password123!' }).expect(201);
    otherRestaurantId = (await prisma.restaurant.findFirstOrThrow({ where: { name: `Other ${tag}` } })).id;
  });

  afterAll(async () => {
    await prisma.restaurant.update({ where: { id: RESTAURANT }, data: saved as never });
    await prisma.menuItem.updateMany({ where: { id: itemId }, data: { isActive: false } });
    await app.close();
  });

  describe('settings', () => {
    it('stores every new rule per restaurant and rejects bad values', async () => {
      await settings({
        loyaltyEnabled: true,
        loyaltyMinOrderAmount: 200,
        loyaltyMinRedeemPoints: 20,
        loyaltyExpiryDays: 90,
        deliveryRedirectEnabled: true,
        zomatoUrl: 'https://www.zomato.com/demo',
        swiggyUrl: 'https://www.swiggy.com/demo',
        reviewUrl: 'https://g.page/r/demo/review',
        whatsappTemplates: { greeting: 'Hello {name}', offer: '', points: 'You have {points}' },
      }).expect(200);
      const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: RESTAURANT } });
      expect(Number(r.loyaltyMinOrderAmount)).toBe(200);
      expect(r.loyaltyMinRedeemPoints).toBe(20);
      expect(r.loyaltyExpiryDays).toBe(90);
      expect(r.zomatoUrl).toBe('https://www.zomato.com/demo');
      // Blank template drops back to the default; the others are kept.
      expect(r.whatsappTemplates).toEqual({ greeting: 'Hello {name}', points: 'You have {points}' });
      for (const bad of [
        { zomatoUrl: 'javascript:alert(1)' },
        { reviewUrl: 'not a url' },
        { swiggyUrl: 'ftp://x.example' },
        { loyaltyMinOrderAmount: -1 },
        { loyaltyExpiryDays: -5 },
        { loyaltyMinRedeemPoints: 1.5 },
      ]) {
        expect((await settings(bad)).status).toBe(400);
      }
      await settings({ zomatoUrl: '', reviewUrl: '' }).expect(200);
      const cleared = await prisma.restaurant.findUniqueOrThrow({ where: { id: RESTAURANT } });
      expect(cleared.zomatoUrl).toBeNull();
      expect(cleared.reviewUrl).toBeNull();
    });

    it("another restaurant's settings never change and are not visible to it", async () => {
      await settings({ reviewUrl: 'https://g.page/r/demo/review', loyaltyEnabled: false }).expect(200);
      const o = await prisma.restaurant.findUniqueOrThrow({ where: { id: otherRestaurantId } });
      expect(o.reviewUrl).toBeNull();
      expect(o.loyaltyEnabled).toBe(true);
      const display = (await other.get('/api/v1/settings/display')).body;
      expect(display.restaurant.reviewUrl).toBeNull();
      expect(display.restaurant.id).toBe(otherRestaurantId);
    });
  });

  describe('earning', () => {
    it('earns on a paid bill, records it in the ledger and on the order, once', async () => {
      await rules();
      const p = phone();
      const id = await order(p);
      expect((await pay(id)).status).toBe(201);
      const [c] = await byPhone(p);
      expect(c.loyaltyPoints).toBe(2); // 250 / 100, floored
      expect(c.loyaltyLastEarnedAt).not.toBeNull();
      const row = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(row.loyaltyPointsEarned).toBe(2);
      const ledger = await prisma.pointsLedger.findMany({ where: { customerId: c.id } });
      expect(ledger).toEqual([expect.objectContaining({ delta: 2, reason: 'EARN', orderId: id })]);
      // A repeated checkout (retry) neither double-pays nor double-earns.
      expect((await pay(id)).status).toBeGreaterThanOrEqual(400);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).loyaltyPoints).toBe(2);
    });

    it('respects the minimum order amount and the on/off switch', async () => {
      await rules({ loyaltyMinOrderAmount: 300 });
      const p1 = phone();
      await pay(await order(p1)); // 250 < 300
      expect((await byPhone(p1))[0].loyaltyPoints).toBe(0);
      const p2 = phone();
      await pay(await order(p2, 2), {}, 500); // 500 >= 300
      expect((await byPhone(p2))[0].loyaltyPoints).toBe(5);
      await rules({ loyaltyEnabled: false });
      const p3 = phone();
      await pay(await order(p3, 2), {}, 500);
      expect((await byPhone(p3))[0].loyaltyPoints).toBe(0);
      expect((await prisma.order.findFirstOrThrow({ where: { customerId: (await byPhone(p3))[0].id } })).loyaltyPointsEarned).toBe(0);
    });

    it('a part payment earns nothing until the bill is fully paid', async () => {
      await rules();
      const p = phone();
      const id = await order(p);
      const first = await pay(id, { allowPartial: true, customerName: 'Asha', customerPhone: p }, 100);
      expect(first.status).toBe(201);
      expect(await byPhone(p)).toHaveLength(0);
      expect((await pay(id, {}, 150)).status).toBe(201);
      expect((await byPhone(p))[0].loyaltyPoints).toBe(2);
    });

    it('matches by phone only: a different name on the same phone merges into one customer', async () => {
      await rules();
      const p = phone();
      await pay(await order(p));
      const second = await owner
        .post(`/api/v1/orders${q}`)
        .send({
          type: 'TAKEAWAY',
          items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }],
          guestName: 'Someone Else',
          deliveryPhone: `+91 ${p.slice(0, 5)}-${p.slice(5)}`,
        })
        .expect(201);
      payer.set(second.body.id, `+91 ${p.slice(0, 5)}-${p.slice(5)}`);
      const r2 = await owner
        .post(`/api/v1/orders/${second.body.id}/checkout${q}`)
        .send({ payments: [{ method: 'CASH', amount: 250 }], customerName: 'Someone Else', customerPhone: `+91 ${p.slice(0, 5)}-${p.slice(5)}` });
      expect(r2.status).toBe(201);
      const found = await byPhone(p);
      expect(found).toHaveLength(1);
      expect(found[0].loyaltyPoints).toBe(4);
      // Same name, different phone is a different customer.
      const p2 = phone();
      await pay(await order(p2));
      expect(await byPhone(p2)).toHaveLength(1);
      expect((await byPhone(p2))[0].id).not.toBe(found[0].id);
    });
  });

  describe('redeeming', () => {
    const seed = async (points: number, lastEarned = new Date()) => {
      const p = phone();
      const c = await prisma.customer.create({
        data: { branchId: BRANCH, name: 'Rita', phone: p, loyaltyPoints: points, loyaltyLastEarnedAt: lastEarned },
      });
      return { p, c };
    };
    const orderFor = async (customerId: string) => {
      const res = await owner.post(`/api/v1/orders${q}`).send({
        type: 'TAKEAWAY',
        customerId,
        items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }],
      });
      return res.body.id as string;
    };

    it('redeems at the point value, records it, and earns on what was actually paid', async () => {
      await rules({ loyaltyPointValue: 2 });
      const { c } = await seed(50);
      const id = await orderFor(c.id);
      // 40 points x 2 = 80 off; 170 paid in cash.
      expect((await pay(id, { loyaltyPointsToRedeem: 40 }, 170)).status).toBe(201);
      const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
      expect(after.loyaltyPoints).toBe(50 - 40 + 1); // 170/100 -> 1 point
      const ledger = await prisma.pointsLedger.findMany({ where: { customerId: c.id }, orderBy: { delta: 'asc' } });
      expect(ledger.map((l) => [l.reason, l.delta])).toEqual([['REDEEM', -40], ['EARN', 1]]);
    });

    it('refuses a redeem below the minimum, above the balance, or when the program is off', async () => {
      await rules({ loyaltyMinRedeemPoints: 30 });
      const { c } = await seed(100);
      const id = await orderFor(c.id);
      const below = await pay(id, { loyaltyPointsToRedeem: 10 }, 240);
      expect(below.status).toBe(400);
      expect(JSON.stringify(below.body)).toMatch(/At least 30/);
      expect((await pay(id, { loyaltyPointsToRedeem: 500 }, 1)).status).toBe(400);
      await rules({ loyaltyEnabled: false });
      const off = await pay(id, { loyaltyPointsToRedeem: 50 }, 200);
      expect(off.status).toBe(400);
      expect(JSON.stringify(off.body)).toMatch(/switched off/);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).loyaltyPoints).toBe(100);
      expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('OPEN');
    });
  });

  describe('expiry', () => {
    it('lapses a stale balance (logged) before it can be redeemed, and a fresh earn restarts the window', async () => {
      await rules({ loyaltyExpiryDays: 30 });
      const stale = new Date(Date.now() - 45 * 86_400_000);
      const c = await prisma.customer.create({
        data: { branchId: BRANCH, name: 'Old', phone: phone(), loyaltyPoints: 60, loyaltyLastEarnedAt: stale },
      });
      const id = (
        await owner
          .post(`/api/v1/orders${q}`)
          .send({ type: 'TAKEAWAY', customerId: c.id, items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }] })
          .expect(201)
      ).body.id as string;
      const res = await pay(id, { loyaltyPointsToRedeem: 20 }, 230);
      expect(res.status).toBe(400); // balance had lapsed; nothing was charged
      expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('OPEN');
      // Paying normally: the stale 60 lapse (logged), then the new bill earns.
      expect((await pay(id, {}, 250)).status).toBe(201);
      const fresh = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
      expect(fresh.loyaltyPoints).toBe(2);
      const ledger = await prisma.pointsLedger.findMany({ where: { customerId: c.id }, orderBy: { delta: 'asc' } });
      expect(ledger.map((l) => [l.reason, l.delta])).toEqual([['EXPIRE', -60], ['EARN', 2]]);
      expect(Date.now() - (fresh.loyaltyLastEarnedAt as Date).getTime()).toBeLessThan(60_000);
    });
  });

  describe('customer list', () => {
    it('lapses stale balances when the customers are listed, with a ledger row', async () => {
      await rules({ loyaltyExpiryDays: 30 });
      const old = await prisma.customer.create({
        data: { branchId: BRANCH, name: 'Lapsed', phone: phone(), loyaltyPoints: 25, loyaltyLastEarnedAt: new Date(Date.now() - 40 * 86_400_000) },
      });
      const recent = await prisma.customer.create({
        data: { branchId: BRANCH, name: 'Active', phone: phone(), loyaltyPoints: 25, loyaltyLastEarnedAt: new Date() },
      });
      const list = (await owner.get(`/api/v1/customers${q}`).expect(200)).body as { id: string; loyaltyPoints: number }[];
      expect(list.find((c) => c.id === old.id)?.loyaltyPoints).toBe(0);
      expect(list.find((c) => c.id === recent.id)?.loyaltyPoints).toBe(25);
      expect((await prisma.pointsLedger.findMany({ where: { customerId: old.id } })).map((l) => [l.reason, l.delta])).toEqual([['EXPIRE', -25]]);
      // Listing again does not expire (or log) anything twice.
      await owner.get(`/api/v1/customers${q}`).expect(200);
      expect(await prisma.pointsLedger.count({ where: { customerId: old.id } })).toBe(1);
    });
  });

  describe('customer menu (public)', () => {
    it('shows the loyalty rules, the balance for a phone, the redirect banner and the review link', async () => {
      await settings({
        loyaltyEnabled: true,
        deliveryRedirectEnabled: true,
        zomatoUrl: 'https://www.zomato.com/demo',
        swiggyUrl: '',
        reviewUrl: 'https://g.page/r/demo/review',
        loyaltyExpiryDays: 0,
        loyaltyMinOrderAmount: 0,
        loyaltyMinRedeemPoints: 0,
      }).expect(200);
      const p = phone();
      await prisma.customer.create({ data: { branchId: BRANCH, name: 'Meera', phone: p, loyaltyPoints: 37, loyaltyLastEarnedAt: new Date() } });
      const menu = (await pub().get(`/api/v1/public/menu/${token}`).expect(200)).body;
      expect(menu.loyalty.enabled).toBe(true);
      expect(menu.deliveryRedirect).toEqual({ zomatoUrl: 'https://www.zomato.com/demo', swiggyUrl: null });
      expect(menu.reviewUrl).toBe('https://g.page/r/demo/review');
      // Balance follows the phone however it is typed, and reveals nothing else.
      for (const typed of [p, `+91 ${p}`, `${p.slice(0, 5)} ${p.slice(5)}`, `0${p}`]) {
        const bal = (await pub().get(`/api/v1/public/menu/${token}/loyalty`).query({ phone: typed }).expect(200)).body;
        expect(bal).toEqual({ enabled: true, known: true, points: 37, pointValue: 1 });
      }
      const unknown = (await pub().get(`/api/v1/public/menu/${token}/loyalty`).query({ phone: phone() }).expect(200)).body;
      expect(unknown).toEqual({ enabled: true, known: false, points: 0 });
      expect((await pub().get(`/api/v1/public/menu/${token}/loyalty`).expect(200)).body.points).toBe(0);
    });

    it('hides everything when the features are off or unset', async () => {
      await settings({ loyaltyEnabled: false, deliveryRedirectEnabled: false, reviewUrl: '' }).expect(200);
      const menu = (await pub().get(`/api/v1/public/menu/${token}`).expect(200)).body;
      expect(menu.loyalty.enabled).toBe(false);
      expect(menu.deliveryRedirect).toBeNull();
      expect(menu.reviewUrl).toBeNull();
      const bal = (await pub().get(`/api/v1/public/menu/${token}/loyalty`).query({ phone: phone() }).expect(200)).body;
      expect(bal).toEqual({ enabled: false, points: 0 });
      // Redirect enabled but no links at all: still no banner.
      await settings({ deliveryRedirectEnabled: true, zomatoUrl: '', swiggyUrl: '' }).expect(200);
      expect((await pub().get(`/api/v1/public/menu/${token}`).expect(200)).body.deliveryRedirect).toBeNull();
    });

    it("never returns another branch's customer for the same phone", async () => {
      await rules();
      const p = phone();
      const otherBranch = await prisma.branch.create({ data: { restaurantId: RESTAURANT, name: `OB-${tag}` } });
      await prisma.customer.create({ data: { branchId: otherBranch.id, name: 'Elsewhere', phone: p, loyaltyPoints: 999, loyaltyLastEarnedAt: new Date() } });
      const bal = (await pub().get(`/api/v1/public/menu/${token}/loyalty`).query({ phone: p }).expect(200)).body;
      expect(bal.points).toBe(0);
      expect(bal.known).toBe(false);
    });

    it('after payment the guest sees points earned and the new balance, and nothing else', async () => {
      await rules();
      const p = phone();
      const created = await pub()
        .post(`/api/v1/public/menu/${token}/order`)
        .send({ guestName: 'Kavya', guestPhone: p, items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }] })
        .expect(201);
      const orderId = created.body.id as string;
      // Before payment: a normal open order, no paid summary.
      const open = (await pub().get(`/api/v1/public/menu/${token}/status`).query({ orderId }).expect(200)).body;
      expect(open.order?.orderNumber).toBe(created.body.orderNumber);
      expect(open.paid).toBeUndefined();
      await owner.post(`/api/v1/orders/${orderId}/accept${q}`).send({});
      expect((await pay(orderId)).status).toBe(201);
      const done = (await pub().get(`/api/v1/public/menu/${token}/status`).query({ orderId }).expect(200)).body;
      expect(done.order).toBeNull();
      expect(done.paid).toEqual({
        orderNumber: expect.any(String),
        loyaltyEnabled: true,
        pointsEarned: 2,
        pointsBalance: 2,
      });
      // Someone else's order id from another QR/branch reveals nothing.
      const foreign = await pub()
        .get(`/api/v1/public/menu/${token}/status`)
        .query({ orderId: (await prisma.order.findFirstOrThrow({ where: { branchId: { not: BRANCH } } }).catch(() => ({ id: 'nope' }))).id });
      expect(foreign.body.paid).toBeUndefined();
    });
  });

  it('WhatsApp templates round-trip through the display settings for every signed-in role', async () => {
    await settings({ whatsappTemplates: { greeting: 'Namaste {name}', points: 'Balance {points}' } }).expect(200);
    const display = (await owner.get('/api/v1/settings/display').expect(200)).body;
    expect(display.restaurant.whatsappTemplates).toEqual({ greeting: 'Namaste {name}', points: 'Balance {points}' });
    await settings({ whatsappTemplates: null }).expect(200);
    expect((await owner.get('/api/v1/settings/display').expect(200)).body.restaurant.whatsappTemplates).toBeNull();
  });
});
