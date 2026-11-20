/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- supertest bodies are untyped by design */
// A guest's name / phone becomes a record in the branch's Customers section
// ONLY when the order is actually paid (cashier marks it paid, a table is
// settled, or an online gateway payment is confirmed) - never at QR check-in,
// order creation, a part payment or a failed / pending payment.
// Runs against a REAL migrated + seeded Postgres. No provider is ever called:
// the gateway's HTTP client (global fetch) is replaced by a local fake.
// Opt-in:
//   CUSTOMER_PAID_E2E=1 DATABASE_URL=... JWT_SECRET=x npx jest --config ./test/jest-e2e.json --runInBand customer-on-paid
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createHmac, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(60000);
const run = process.env.CUSTOMER_PAID_E2E ? describe : describe.skip;
const BRANCH = 'demo-branch';
const RESTAURANT = 'demo-restaurant';
const q = `?branchId=${BRANCH}`;
const tag = randomUUID().slice(0, 6);
const phoneDigits = () =>
  '9' +
  Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, '0');
const WEBHOOK_SECRET = 'whsec_e2e_local_only';

run('Customers are saved only on a paid order (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let itemId: string;
  let otherBranchId: string;
  const tableIds: string[] = [];
  const tableTokens: string[] = [];
  let nextTable = 0;
  // What the fake Razorpay answers for each payment link id.
  const links = new Map<
    string,
    { amount: number; paid: boolean; reference: string; status?: string }
  >();
  let fetchSpy: jest.SpyInstance;
  let savedGateway: { provider: string; enabled: boolean }[] = [];

  const post = (p: string, b?: object) => agent.post(`/api/v1${p}`).send(b);
  const get = (p: string) => agent.get(`/api/v1${p}`);
  const pub = () => request(app.getHttpServer());

  const customersWithPhone = async (phone: string, branchId = BRANCH) =>
    (await prisma.customer.findMany({ where: { branchId } })).filter((c) =>
      (c.phone ?? '').replace(/\D/g, '').endsWith(phone),
    );
  const orderRow = (id: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id },
      include: { payments: true },
    });
  const staffOrder = async (extra: object = {}) => {
    const res = await post(`/orders${q}`, {
      type: 'TAKEAWAY',
      items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }],
      ...extra,
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body;
  };
  const pay = (orderId: string, extra: object = {}, amount = 250) =>
    post(`/orders/${orderId}/checkout${q}`, {
      payments: [{ method: 'CASH', amount }],
      ...extra,
    });
  /** A fresh, empty table with its own QR token for every test. */
  const freshTable = () => {
    const i = nextTable++;
    if (i >= tableIds.length) throw new Error('not enough test tables');
    return { id: tableIds[i], token: tableTokens[i] };
  };
  const qrOrder = async (
    token: string,
    body: { guestName?: string; guestPhone?: string; requestId?: string },
  ) => {
    const res = await pub()
      .post(`/api/v1/public/menu/${token}/order`)
      .send({
        ...body,
        items: [{ menuItemId: itemId, quantity: 1, modifierIds: [] }],
      });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body;
  };
  const signedWebhook = (linkId: string, eventId: string) => {
    const body = JSON.stringify({
      event: 'payment_link.paid',
      payload: { payment_link: { entity: { id: linkId } } },
    });
    return pub()
      .post(`/api/v1/payment-gateways/webhook/${RESTAURANT}/razorpay/LIVE`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-event-id', eventId)
      .set(
        'x-razorpay-signature',
        createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'),
      )
      .send(body);
  };
  const paymentLink = async (orderId: string, body: object = {}) => {
    const res = await post(`/orders/${orderId}/gateway-payments${q}`, body);
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    const row = await prisma.gatewayPayment.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    return { id: row.id, linkId: row.providerRef as string };
  };

  beforeAll(async () => {
    // Stand-in for api.razorpay.com: nothing ever leaves this process.
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input: any, init?: any) => {
        const url = String(input);
        if (!url.startsWith('https://api.razorpay.com/')) {
          return Promise.reject(new Error(`unexpected outbound call: ${url}`));
        }
        const json = (o: unknown, status = 200) =>
          Promise.resolve(
            new Response(JSON.stringify(o), {
              status,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        if (init?.method === 'POST' && url.endsWith('/v1/payment_links')) {
          const b = JSON.parse(init.body as string);
          const id = `plink_${randomUUID().slice(0, 12)}`;
          links.set(id, {
            amount: b.amount,
            paid: false,
            reference: b.reference_id,
          });
          return json({ id, short_url: `https://rzp.example/${id}` });
        }
        const m = /\/v1\/payment_links\/([^/?]+)$/.exec(url);
        if (m) {
          const l = links.get(decodeURIComponent(m[1]));
          if (!l) return json({ error: { description: 'not found' } }, 404);
          return json({
            id: m[1],
            status: l.status ?? (l.paid ? 'paid' : 'created'),
            amount: l.amount,
            amount_paid: l.paid ? l.amount : 0,
            currency: 'INR',
            reference_id: l.reference,
            payments: l.paid ? [{ payment_id: `pay_${m[1]}` }] : [],
          });
        }
        return json({ items: [] }); // testConnection
      });

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
    app = mod.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: [] });
    await app.init();
    prisma = app.get(PrismaService);

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);

    const cats = (await get(`/menu/categories${q}`).expect(200)).body;
    itemId = (
      await post(`/menu/items${q}`, {
        categoryId: cats[0].id,
        name: `paid-${tag}`,
        price: 250,
        taxRatePercent: 0,
      }).expect(201)
    ).body.id;

    // Its own floor + tables, so orders left open by other suites cannot interfere.
    const floor = await prisma.floor.create({
      data: { branchId: BRANCH, name: `E2E-${tag}`, sortOrder: 99 },
    });
    for (let i = 0; i < 8; i++) {
      const t = await prisma.table.create({
        data: {
          floorId: floor.id,
          number: `E${tag}-${i}`,
          capacity: 2,
          qrToken: randomUUID().replace(/-/g, ''),
        },
      });
      tableIds.push(t.id);
      tableTokens.push(t.qrToken as string);
    }
    otherBranchId = (
      await prisma.branch.create({
        data: { restaurantId: RESTAURANT, name: `Other-${tag}` },
      })
    ).id;

    // Razorpay in LIVE mode with throwaway local keys (TEST mode never marks
    // an order paid). Whatever was configured before is put back afterwards.
    savedGateway = await prisma.paymentGatewayConnection.findMany({
      where: { restaurantId: RESTAURANT },
      select: { provider: true, enabled: true },
    });
    await agent
      .put('/api/v1/payment-gateways/razorpay')
      .send({
        country: 'IN',
        mode: 'LIVE',
        credentials: {
          keyId: 'rzp_live_e2e_local',
          keySecret: 'local-secret',
          webhookSecret: WEBHOOK_SECRET,
        },
      })
      .expect(200);
    await post('/payment-gateways/razorpay/mode', {
      mode: 'LIVE',
      confirm: 'ENABLE LIVE PAYMENTS',
    }).expect(201);
    await post('/payment-gateways/razorpay/enabled', { enabled: true }).expect(
      201,
    );
  });

  afterAll(async () => {
    await prisma.paymentGatewayConnection
      .deleteMany({ where: { restaurantId: RESTAURANT, provider: 'razorpay' } })
      .catch(() => undefined);
    for (const g of savedGateway) {
      await prisma.paymentGatewayConnection
        .updateMany({
          where: { restaurantId: RESTAURANT, provider: g.provider },
          data: { enabled: g.enabled },
        })
        .catch(() => undefined);
    }
    if (otherBranchId) {
      await prisma.customer
        .deleteMany({ where: { branchId: otherBranchId } })
        .catch(() => undefined);
      await prisma.branch
        .delete({ where: { id: otherBranchId } })
        .catch(() => undefined);
    }
    fetchSpy?.mockRestore();
    await app.close();
  });

  // ------------------------------------------------------------ not paid yet
  describe('before payment nothing is saved', () => {
    it('QR check-in with a name and phone creates no customer', async () => {
      const t = freshTable();
      const phone = phoneDigits();
      await pub()
        .post(`/api/v1/public/menu/${t.token}/check-in`)
        .send({ guestName: 'Scan Only', phone })
        .expect(201);
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it('a QR table order keeps the details on the order but creates no customer until paid', async () => {
      const t = freshTable();
      const phone = phoneDigits();
      const o = await qrOrder(t.token, {
        guestName: `Qr Guest ${tag}`,
        guestPhone: phone,
      });
      const row = await orderRow(o.id);
      expect(row.customerId).toBeNull();
      expect(row.guestName).toBe(`Qr Guest ${tag}`);
      expect(row.deliveryPhone).toBe(phone);
      expect(await customersWithPhone(phone)).toHaveLength(0);

      // accepted, still unpaid: still nothing
      await post(`/orders/${o.id}/accept${q}`).expect(201);
      expect(await customersWithPhone(phone)).toHaveLength(0);

      // the cashier marks it paid: exactly one customer, linked, with history
      await pay(o.id).expect(201);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe(`Qr Guest ${tag}`);
      expect(saved[0].phone).toBe(phone);
      expect((await orderRow(o.id)).customerId).toBe(saved[0].id);
      const detail = (await get(`/customers/${saved[0].id}${q}`).expect(200))
        .body;
      expect(detail.orders.map((x: any) => x.id)).toEqual([o.id]);
    });

    it('a staff order with a guest name / phone creates no customer until it is paid', async () => {
      const phone = phoneDigits();
      const o = await staffOrder({ guestName: 'Counter', guestPhone: phone });
      expect((await orderRow(o.id)).customerId).toBeNull();
      expect(await customersWithPhone(phone)).toHaveLength(0);
      // cancelled instead of paid: never saved
      await post(`/orders/${o.id}/cancel${q}`, { reason: 'Customer left' });
      expect((await orderRow(o.id)).status).not.toBe('PAID');
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it('a rejected payment (short of the bill) saves no customer and links nothing', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const res = await pay(
        o.id,
        { customerName: 'Short', customerPhone: phone },
        100,
      );
      expect(res.status).toBe(400);
      const row = await orderRow(o.id);
      expect(row.status).toBe('OPEN');
      expect(row.customerId).toBeNull();
      expect(row.payments).toHaveLength(0);
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it('a part payment is pending: no customer and no paid history until the balance is settled', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const part = await pay(
        o.id,
        {
          customerName: `Part Payer ${tag}`,
          customerPhone: phone,
          allowPartial: true,
        },
        100,
      ).expect(201);
      expect(part.body.settlement.fullyPaid).toBe(false);
      expect(await customersWithPhone(phone)).toHaveLength(0);
      const pending = await orderRow(o.id);
      expect(pending.status).toBe('OPEN');
      expect(pending.customerId).toBeNull();

      // the rest is paid without retyping the details: they were kept on the order
      const done = await pay(o.id, {}, 150).expect(201);
      expect(done.body.settlement.fullyPaid).toBe(true);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe(`Part Payer ${tag}`);
      expect((await orderRow(o.id)).customerId).toBe(saved[0].id);
    });

    it('an unpaid order of an already-known customer is not shown as paid history', async () => {
      const known = (
        await post(`/customers${q}`, {
          name: `Known ${tag}`,
          phone: phoneDigits(),
        }).expect(201)
      ).body;
      const o = await staffOrder({ customerId: known.id });
      let detail = (await get(`/customers/${known.id}${q}`).expect(200)).body;
      expect(detail.orders).toHaveLength(0);
      await pay(o.id).expect(201);
      detail = (await get(`/customers/${known.id}${q}`).expect(200)).body;
      expect(detail.orders.map((x: any) => x.id)).toEqual([o.id]);
    });
  });

  // ------------------------------------------------------- settlement flows
  describe('every way of getting paid saves the customer once', () => {
    it('table settle: the QR guest of the table is saved and the table is freed', async () => {
      const t = freshTable();
      const phone = phoneDigits();
      const o = await qrOrder(t.token, {
        guestName: `Settle ${tag}`,
        guestPhone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      });
      await post(`/orders/${o.id}/accept${q}`).expect(201);
      const res = await post(`/tables/${t.id}/settle${q}`, {
        method: 'UPI',
      }).expect(201);
      expect(res.body.customerName).toBe(`Settle ${tag}`);
      expect(Number(res.body.totalAmount)).toBe(250);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].phone).toBe(phone); // normalized, country code dropped
      const row = await orderRow(o.id);
      expect(row.status).toBe('PAID');
      expect(row.customerId).toBe(saved[0].id);
      expect(
        (await prisma.table.findUniqueOrThrow({ where: { id: t.id } })).status,
      ).toBe('AVAILABLE');

      // settling the now-empty table again changes nothing
      await post(`/tables/${t.id}/settle${q}`, { method: 'UPI' }).expect(201);
      expect(await customersWithPhone(phone)).toHaveLength(1);
      expect((await orderRow(o.id)).payments).toHaveLength(1);
    });

    it('table settle after a part payment only collects the balance', async () => {
      const t = freshTable();
      const o = await qrOrder(t.token, { guestName: 'Guest' });
      await post(`/orders/${o.id}/accept${q}`).expect(201);
      await pay(o.id, { allowPartial: true }, 100).expect(201);
      await post(`/tables/${t.id}/settle${q}`, { method: 'CARD' }).expect(201);
      const row = await orderRow(o.id);
      expect(row.status).toBe('PAID');
      expect(
        row.payments.reduce((s, p) => s + Number(p.amount), 0),
      ).toBe(250);
    });

    it('takeaway QR order: saved when the cashier marks it paid, in the branch of the QR', async () => {
      const phone = phoneDigits();
      const o = await qrOrder(`takeaway-${BRANCH}`, {
        guestName: `Takeaway ${tag}`,
        guestPhone: phone,
        requestId: randomUUID(),
      });
      expect(o.branchId ?? BRANCH).toBe(BRANCH);
      expect(await customersWithPhone(phone)).toHaveLength(0);
      await post(`/orders/${o.id}/accept${q}`).expect(201);
      await pay(o.id).expect(201);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].branchId).toBe(BRANCH);
      expect(await customersWithPhone(phone, otherBranchId)).toHaveLength(0);
    });

    it('a returning guest (same phone, other format) is reused, never duplicated, and gets both orders in history', async () => {
      const phone = phoneDigits();
      const a = await staffOrder();
      await pay(a.id, { customerName: 'Repeat', customerPhone: phone }).expect(
        201,
      );
      const t = freshTable();
      const b = await qrOrder(t.token, {
        guestName: 'Someone Else Name',
        guestPhone: `0${phone}`,
      });
      await post(`/orders/${b.id}/accept${q}`).expect(201);
      await pay(b.id).expect(201);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Repeat'); // an existing real name is not overwritten
      const detail = (await get(`/customers/${saved[0].id}${q}`).expect(200))
        .body;
      expect(detail.orders.map((x: any) => x.id).sort()).toEqual(
        [a.id, b.id].sort(),
      );
    });

    it('a short number never attaches to another customer whose number ends with the same digits', async () => {
      const phone = phoneDigits();
      const longOne = await prisma.customer.create({
        data: { branchId: BRANCH, name: `Long ${tag}`, phone },
      });
      const o = await staffOrder();
      await pay(o.id, {
        customerName: `Landline ${tag}`,
        customerPhone: phone.slice(-7),
      }).expect(201);
      const row = await orderRow(o.id);
      expect(row.customerId).toBeTruthy();
      expect(row.customerId).not.toBe(longOne.id);
    });

    it('the same phone in another branch is a different customer; other branches never see this one', async () => {
      const phone = phoneDigits();
      await prisma.customer.create({
        data: { branchId: otherBranchId, name: 'Elsewhere', phone },
      });
      const o = await staffOrder();
      await pay(o.id, { customerName: 'Here', customerPhone: phone }).expect(
        201,
      );
      const here = await customersWithPhone(phone);
      expect(here).toHaveLength(1);
      expect(here[0].name).toBe('Here');
      expect(await customersWithPhone(phone, otherBranchId)).toHaveLength(1);
      const listOther = (
        await get(`/customers?branchId=${otherBranchId}`).expect(200)
      ).body;
      expect(listOther.some((c: any) => c.id === here[0].id)).toBe(false);
      await get(`/customers/${here[0].id}?branchId=${otherBranchId}`).expect(
        404,
      );
    });

    it('the saved customer and the paid history are still there after logging out and in again', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      await pay(o.id, {
        customerName: `Persist ${tag}`,
        customerPhone: phone,
      }).expect(201);
      await post('/auth/logout').expect(201);
      await get(`/customers${q}`).expect(401);
      const again = request.agent(app.getHttpServer());
      await again
        .post('/api/v1/auth/login')
        .send({ email: 'owner@demo.local', password: 'Password123!' })
        .expect(201);
      agent = again;
      const list = (await get(`/customers${q}&search=${phone}`).expect(200))
        .body;
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe(`Persist ${tag}`);
      const detail = (await get(`/customers/${list[0].id}${q}`).expect(200))
        .body;
      expect(detail.orders).toHaveLength(1);
      expect(detail.orders[0].id).toBe(o.id);
      expect(Number(detail.orders[0].totalAmount)).toBe(250);
    });

    it('manual customer creation and existing records are untouched', async () => {
      const phone = phoneDigits();
      const manual = (
        await post(`/customers${q}`, {
          name: `Manual ${tag}`,
          phone,
          notes: 'likes window seat',
        }).expect(201)
      ).body;
      const o = await staffOrder();
      await pay(o.id, { customerName: 'Typed Later', customerPhone: phone }).expect(
        201,
      );
      const rows = await customersWithPhone(phone);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(manual.id);
      expect(rows[0].name).toBe(`Manual ${tag}`);
      expect(rows[0].notes).toBe('likes window seat');
    });
  });

  // ---------------------------------------------------------- online payment
  describe('online gateway payment (provider faked locally)', () => {
    it('a link that is created but not paid saves nothing, however often it is polled', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, {
        customerName: `Pending ${tag}`,
        customerPhone: phone,
      });
      const st = await pub()
        .get(`/api/v1/payment-gateways/return-status/${link.id}`)
        .expect(200);
      expect(st.body.status).toBe('CREATED');
      await signedWebhook(link.linkId, `evt-${randomUUID()}`).expect(200);
      const row = await orderRow(o.id);
      expect(row.status).toBe('OPEN');
      expect(row.customerId).toBeNull();
      expect(row.payments).toHaveLength(0);
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it('an expired / cancelled link saves nothing', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, { customerPhone: phone });
      links.get(link.linkId)!.status = 'cancelled';
      await signedWebhook(link.linkId, `evt-${randomUUID()}`).expect(200);
      const gp = await prisma.gatewayPayment.findUniqueOrThrow({
        where: { id: link.id },
      });
      expect(gp.status).toBe('EXPIRED');
      expect((await orderRow(o.id)).status).toBe('OPEN');
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it('a webhook with a wrong signature is refused and changes nothing', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, { customerPhone: phone });
      links.get(link.linkId)!.paid = true;
      const body = JSON.stringify({
        event: 'payment_link.paid',
        payload: { payment_link: { entity: { id: link.linkId } } },
      });
      await pub()
        .post(`/api/v1/payment-gateways/webhook/${RESTAURANT}/razorpay/LIVE`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'deadbeef')
        .send(body)
        .expect(401);
      expect((await orderRow(o.id)).status).toBe('OPEN');
      expect(await customersWithPhone(phone)).toHaveLength(0);
      links.get(link.linkId)!.paid = false;
    });

    it('a confirmed payment marks the order paid and saves the payer once, across repeated webhooks, polls and the return page', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, {
        customerName: `Online ${tag}`,
        customerPhone: `+91 ${phone}`,
      });
      links.get(link.linkId)!.paid = true;

      const eventId = `evt-${randomUUID()}`;
      const first = await signedWebhook(link.linkId, eventId).expect(200);
      expect(first.body.duplicate).toBe(false);
      // the same event again, a different event for the same payment, the
      // customer's return page and the cashier's refresh button - all at once
      const repeats = await Promise.all([
        signedWebhook(link.linkId, eventId),
        signedWebhook(link.linkId, `evt-${randomUUID()}`),
        pub().get(`/api/v1/payment-gateways/return-status/${link.id}`),
        post(`/gateway-payments/${link.id}/refresh${q}`),
      ]);
      expect(repeats.every((r) => r.status < 300)).toBe(true);

      const row = await orderRow(o.id);
      expect(row.status).toBe('PAID');
      expect(row.payments).toHaveLength(1);
      expect(Number(row.payments[0].amount)).toBe(250);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe(`Online ${tag}`);
      expect(saved[0].phone).toBe(phone);
      expect(row.customerId).toBe(saved[0].id);
      const gp = await prisma.gatewayPayment.findUniqueOrThrow({
        where: { id: link.id },
      });
      expect(gp.status).toBe('SUCCEEDED');
      const detail = (await get(`/customers/${saved[0].id}${q}`).expect(200))
        .body;
      expect(detail.orders.map((x: any) => x.id)).toEqual([o.id]);
    });

    it('details typed when the same link is requested again are the ones saved', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const first = await paymentLink(o.id); // nothing typed the first time
      const second = await paymentLink(o.id, {
        customerName: `Retyped ${tag}`,
        customerPhone: phone,
      });
      expect(second.id).toBe(first.id); // the open link is reused
      links.get(first.linkId)!.paid = true;
      await signedWebhook(first.linkId, `evt-${randomUUID()}`).expect(200);
      const saved = await customersWithPhone(phone);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe(`Retyped ${tag}`);
      expect((await orderRow(o.id)).customerId).toBe(saved[0].id);
    });

    it('an amount that does not match what was requested is held for review: not paid, no customer', async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, { customerPhone: phone });
      const l = links.get(link.linkId)!;
      l.paid = true;
      l.amount = l.amount - 100; // provider says a different amount was paid
      await signedWebhook(link.linkId, `evt-${randomUUID()}`).expect(200);
      const gp = await prisma.gatewayPayment.findUniqueOrThrow({
        where: { id: link.id },
      });
      expect(gp.status).toBe('NEEDS_REVIEW');
      expect((await orderRow(o.id)).status).toBe('OPEN');
      expect(await customersWithPhone(phone)).toHaveLength(0);
    });

    it("another restaurant's webhook URL cannot settle this restaurant's payment", async () => {
      const phone = phoneDigits();
      const o = await staffOrder();
      const link = await paymentLink(o.id, { customerPhone: phone });
      links.get(link.linkId)!.paid = true;
      const body = JSON.stringify({
        event: 'payment_link.paid',
        payload: { payment_link: { entity: { id: link.linkId } } },
      });
      await pub()
        .post('/api/v1/payment-gateways/webhook/some-other-restaurant/razorpay/LIVE')
        .set('Content-Type', 'application/json')
        .set(
          'x-razorpay-signature',
          createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'),
        )
        .send(body)
        .expect(401);
      expect((await orderRow(o.id)).status).toBe('OPEN');
      expect(await customersWithPhone(phone)).toHaveLength(0);
      links.get(link.linkId)!.paid = false;
    });
  });
});
