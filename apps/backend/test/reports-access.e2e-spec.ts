// Role-permission policy end-to-end against a REAL, migrated + seeded Postgres.
//   REPORTS_E2E=1 DATABASE_URL=... JWT_SECRET=x npm run test:e2e -- reports-access
// Creates one throw-away staff login per role under the seeded demo restaurant.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

process.env.ALLOW_PUBLIC_SIGNUP = 'true'; // creates a second restaurant
const run = process.env.REPORTS_E2E ? describe : describe.skip;
const BRANCH = 'demo-branch';
const q = `?branchId=${BRANCH}`;
const tag = randomUUID().slice(0, 6);
const ROLES = [
  'WAITER',
  'KITCHEN_STAFF',
  'CHEF',
  'BARTENDER',
  'DELIVERY_STAFF',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
  'CASHIER',
  'RESTAURANT_MANAGER',
];

run('Reports & export permissions (e2e)', () => {
  let app: INestApplication<App>;
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  beforeAll(async () => {
    // Ten logins in a row would trip the per-route login throttle.
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
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

    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);
    agents.OWNER = owner;
    const roles = (await owner.get('/api/v1/users/roles').expect(200)).body as {
      id: string;
      name: string;
    }[];
    for (const name of ROLES) {
      const role = roles.find((r) => r.name === name)!;
      const email = `${name.toLowerCase()}-${tag}@demo.local`;
      await owner
        .post('/api/v1/users')
        .send({
          name: `${name} ${tag}`,
          email,
          password: 'Password123!',
          roleId: role.id,
          branchIds: [BRANCH],
        })
        .expect(201);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(201);
      agents[name] = agent;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const get = async (role: string, path: string) =>
    (await agents[role].get(`/api/v1${path}`)).status;
  const range = `branchId=${BRANCH}&from=2026-01-01&to=2026-12-31`;

  const ALLOWED_ALL = ['OWNER', 'ACCOUNTANT'];
  const NO_REPORTS = [
    'WAITER',
    'KITCHEN_STAFF',
    'CHEF',
    'BARTENDER',
    'DELIVERY_STAFF',
    'CASHIER',
  ];

  it('sales reports and every export need the right permissions per role', async () => {
    for (const role of ALLOWED_ALL) {
      expect(await get(role, '/reports')).toBe(200);
      for (const f of ['xlsx', 'pdf', 'csv']) {
        expect(
          await get(role, `/reports/sales-daily/export?format=${f}&${range}`),
        ).toBe(200);
      }
      expect(await get(role, `/reports/sales-daily/csv?${range}`)).toBe(200);
    }
    for (const role of NO_REPORTS) {
      expect(await get(role, '/reports')).toBe(403);
      expect(await get(role, `/reports/sales-daily?${range}`)).toBe(403);
      expect(await get(role, `/reports/sales-daily/csv?${range}`)).toBe(403);
      expect(
        await get(role, `/reports/sales-daily/export?format=xlsx&${range}`),
      ).toBe(403);
    }
  });

  it('inventory manager / manager see non-sales reports but never sales figures or exports', async () => {
    for (const role of ['INVENTORY_MANAGER', 'RESTAURANT_MANAGER']) {
      expect(await get(role, `/reports/waste?${range}`)).toBe(200);
      expect(await get(role, `/reports/sales-daily?${range}`)).toBe(403);
      expect(await get(role, `/reports/tax?${range}`)).toBe(403);
      expect(await get(role, `/reports/waste/csv?${range}`)).toBe(403);
      expect(
        await get(role, `/reports/waste/export?format=xlsx&${range}`),
      ).toBe(403);
      const cat = (await agents[role].get('/api/v1/reports')).body as {
        key: string;
      }[];
      expect(cat.some((r) => r.key === 'sales-daily')).toBe(false);
    }
  });

  it('refuses bad dates, unknown reports and unknown export formats', async () => {
    const bad = [
      `/reports/sales-daily?branchId=${BRANCH}&from=nope&to=2026-12-31`,
      `/reports/sales-daily?branchId=${BRANCH}&from=2026-12-31&to=2026-01-01`,
      `/reports/sales-daily?branchId=${BRANCH}`,
      `/reports/no-such-report?${range}`,
      `/reports/sales-daily/export?format=docx&${range}`,
    ];
    for (const p of bad) expect(await get('OWNER', p)).toBe(400);
  });

  it('exports are real files, and CSV matches the on-screen rows', async () => {
    const x = await agents.OWNER.get(
      `/api/v1/reports/sales-daily/export?format=xlsx&${range}`,
    ).buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (d: Buffer) => c.push(d));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(x.headers['content-disposition']).toContain('sales-daily_2026-01-01');
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await agents.OWNER.get(
      `/api/v1/reports/sales-daily/export?format=pdf&${range}`,
    ).buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (d: Buffer) => c.push(d));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const json = (await agents.OWNER.get(`/api/v1/reports/sales-daily?${range}`))
      .body as { columns: string[]; rows: unknown[][] };
    const csv = (await agents.OWNER.get(`/api/v1/reports/sales-daily/csv?${range}`))
      .text;
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(lines[0].split(',')).toEqual(json.columns);
    expect(lines).toHaveLength(json.rows.length + 1);
  });

  it("another restaurant cannot read this restaurant's branch reports or exports", async () => {
    const oe = `rep-other-${tag}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ownerName: 'Other',
        email: oe,
        password: 'Password123!',
        restaurantName: `Other ${tag}`,
        branchName: 'Main',
      })
      .expect(201);
    const other = request.agent(app.getHttpServer());
    await other
      .post('/api/v1/auth/login')
      .send({ email: oe, password: 'Password123!' })
      .expect(201);
    for (const p of [
      `/reports/sales-daily?${range}`,
      `/reports/sales-daily/csv?${range}`,
      `/reports/sales-daily/export?format=xlsx&${range}`,
      `/reports/customers?${range}`,
    ]) {
      expect((await other.get(`/api/v1${p}`)).status).toBe(403);
    }
  });
});
