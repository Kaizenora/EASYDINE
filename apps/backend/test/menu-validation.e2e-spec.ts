// Menu item create/update validation against a REAL migrated + seeded Postgres.
//   MENU_E2E=1 DATABASE_URL=... JWT_SECRET=x npx jest --config ./test/jest-e2e.json --runInBand menu-validation
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const run = process.env.MENU_E2E ? describe : describe.skip;
const BRANCH = 'demo-branch';
const q = `?branchId=${BRANCH}`;
const tag = randomUUID().slice(0, 6);

run('Menu item validation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let itemId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
      })
      .compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: [] });
    await app.init();
    prisma = app.get(PrismaService);
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);
    const cat = await prisma.menuCategory.findFirstOrThrow({ where: { branchId: BRANCH } });
    const res = await owner
      .post(`/api/v1/menu/items${q}`)
      .send({ categoryId: cat.id, name: `Val ${tag}`, price: 100, taxRatePercent: 5 })
      .expect(201);
    itemId = res.body.id;
  });

  afterAll(async () => {
    await prisma.menuItem.deleteMany({ where: { name: { startsWith: `Val ${tag}` } } });
    await app.close();
  });

  const patch = (body: object) => owner.patch(`/api/v1/menu/items/${itemId}${q}`).send(body);

  it('refuses a negative price, an empty name and an out-of-range tax on update, leaving the item untouched', async () => {
    for (const bad of [{ price: -1 }, { price: 'abc' }, { name: '' }, { taxRatePercent: 500 }, { halfPrice: -3 }]) {
      expect((await patch(bad)).status).toBe(400);
    }
    const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(Number(row.price)).toBe(100);
    expect(row.name).toBe(`Val ${tag}`);
  });

  it('never lets an update move the item to another branch or change its id', async () => {
    const res = await patch({ branchId: 'someone-elses-branch', id: 'hijack', price: 120 });
    expect(res.status).toBe(200);
    const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.branchId).toBe(BRANCH);
    expect(Number(row.price)).toBe(120);
  });

  it('a partial update only changes the fields sent (defaults are not re-applied)', async () => {
    await patch({ isVeg: false, isActive: false }).expect(200);
    const res = await patch({ price: 130 });
    expect(res.status).toBe(200);
    const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.isVeg).toBe(false);
    expect(row.isActive).toBe(false);
    expect(Number(row.price)).toBe(130);
  });

  it('create rejects invalid input too', async () => {
    const cat = await prisma.menuCategory.findFirstOrThrow({ where: { branchId: BRANCH } });
    expect((await owner.post(`/api/v1/menu/items${q}`).send({ categoryId: cat.id, name: 'x', price: -5 })).status).toBe(400);
    expect((await owner.post(`/api/v1/menu/items${q}`).send({ categoryId: cat.id, name: '', price: 5 })).status).toBe(400);
  });

  it('refuses to delete a dish that has order history, with a clear message, and deletes an unused one', async () => {
    const used = await prisma.orderItem.findFirstOrThrow({
      where: { order: { branchId: BRANCH } },
      select: { menuItemId: true },
    });
    const res = await owner.delete(`/api/v1/menu/items/${used.menuItemId}${q}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/order history/i);
    expect(await prisma.menuItem.count({ where: { id: used.menuItemId } })).toBe(1);
    expect((await owner.delete(`/api/v1/menu/items/${itemId}${q}`)).status).toBe(200);
    expect(await prisma.menuItem.count({ where: { id: itemId } })).toBe(0);
  });
});
