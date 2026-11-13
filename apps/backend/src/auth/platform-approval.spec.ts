import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PlatformAdminGuard } from './platform-admin.controller';
import { PLATFORM_ADMIN_AUDIENCE, PLATFORM_ADMIN_COOKIE, PlatformAdminService, platformAdminConfig, platformAdminConfigProblem } from './platform-admin.service';
import { clearSessionCache } from './session-cache';
import { PublicMenuService } from '../modules/public/public-menu.service';

// Platform approval of restaurant signups + the platform admin. Prisma is
// mocked; no database. No real secret is used: the hash is generated here.
const ADMIN_EMAIL = 'admin@platform.test';
let ADMIN_HASH = '';
beforeAll(async () => {
  ADMIN_HASH = await bcrypt.hash('correct horse battery staple', 4);
});
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  clearSessionCache();
});
function provision() {
  process.env.PLATFORM_ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.PLATFORM_ADMIN_PASSWORD_HASH = ADMIN_HASH;
}

const jwt = new JwtService({ secret: 'unit-test-only', signOptions: { expiresIn: '1h' } });

describe('platform admin configuration', () => {
  it('repairs paste damage (wrapped line, quotes, NAME= prefix) but nothing else', () => {
    const wrapped = ADMIN_HASH.slice(0, 30) + '\n  ' + ADMIN_HASH.slice(30);
    for (const v of [wrapped, `"${ADMIN_HASH}"`, `'${ADMIN_HASH}'`, `PLATFORM_ADMIN_PASSWORD_HASH=${ADMIN_HASH}`, ` ${ADMIN_HASH}\r\n`]) {
      expect(platformAdminConfig({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: v })?.passwordHash).toBe(ADMIN_HASH);
    }
    expect(platformAdminConfig({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: ADMIN_HASH.slice(0, 59) })).toBeNull();
  });

  it('explains a bad setup without printing the secret', () => {
    expect(platformAdminConfigProblem({})).toBeNull();
    expect(platformAdminConfigProblem({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: ADMIN_HASH })).toBeNull();
    const msg = platformAdminConfigProblem({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: ADMIN_HASH.slice(0, 50) })!;
    expect(msg).toContain('length 50, expected 60');
    expect(msg).not.toContain(ADMIN_HASH.slice(7, 50));
    expect(platformAdminConfigProblem({ PLATFORM_ADMIN_EMAIL: 'nope', PLATFORM_ADMIN_PASSWORD_HASH: ADMIN_HASH })).toContain('no @');
  });

  it('closed until both env values are set and the hash is a real bcrypt hash', () => {
    expect(platformAdminConfig({})).toBeNull();
    expect(platformAdminConfig({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL })).toBeNull();
    expect(platformAdminConfig({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: 'plaintext-password' })).toBeNull();
    expect(platformAdminConfig({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH: ADMIN_HASH })).toEqual({
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_HASH,
    });
  });
});

describe('PlatformAdminService + guard', () => {
  function make(restaurants: any[] = []) {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn(async ({ where }: any) => { const r = restaurants.find((x) => x.id === where.id); return r ? { ...r } : null; }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const r = restaurants.find((x) => x.id === where.id && x.approvalStatus === where.approvalStatus);
          if (!r) return { count: 0 };
          Object.assign(r, data);
          return { count: 1 };
        }),
        findMany: jest.fn(async () => restaurants.map((r) => ({ ...r, users: [] }))),
      },
    };
    const audit = { record: jest.fn() };
    const svc = new PlatformAdminService(jwt, prisma, audit as any);
    return { svc, prisma, audit, restaurants };
  }
  const ctx = (cookie?: string): any => ({
    switchToHttp: () => ({ getRequest: () => ({ cookies: cookie ? { [PLATFORM_ADMIN_COOKIE]: cookie } : {} }) }),
  });

  it('not provisioned: admin routes are closed and the admin ID is not special', async () => {
    const { svc } = make();
    expect(svc.isProvisioned()).toBe(false);
    expect(svc.isAdminLoginId(ADMIN_EMAIL)).toBe(false);
    await expect(new PlatformAdminGuard(svc).canActivate(ctx('anything'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('wrong password is refused with the generic message', async () => {
    provision();
    const { svc } = make();
    await expect(svc.login('wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('right password gives an admin token the guard accepts; a staff-style token is refused', async () => {
    provision();
    const { svc } = make();
    const token = await svc.login('correct horse battery staple');
    await expect(new PlatformAdminGuard(svc).canActivate(ctx(token))).resolves.toBe(true);
    const staffToken = await jwt.signAsync({ sub: 'user-1' });
    await expect(new PlatformAdminGuard(svc).canActivate(ctx(staffToken))).rejects.toBeInstanceOf(ForbiddenException);
    const wrongAud = await jwt.signAsync({ sub: 'platform-admin', typ: 'platform_admin' }, { audience: 'other' });
    expect(await svc.verify(wrongAud)).toBe(false);
    await expect(new PlatformAdminGuard(svc).canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an admin token stops working once the admin is de-provisioned', async () => {
    provision();
    const { svc } = make();
    const token = await svc.login('correct horse battery staple');
    delete process.env.PLATFORM_ADMIN_PASSWORD_HASH;
    expect(await svc.verify(token)).toBe(false);
  });

  it('approve / reject is audited and idempotent', async () => {
    const { svc, audit, restaurants } = make([{ id: 'r1', name: 'New Cafe', approvalStatus: 'PENDING' }]);
    expect(await svc.decide('r1', 'APPROVED')).toEqual({ id: 'r1', status: 'APPROVED', changed: true });
    expect(restaurants[0].approvalStatus).toBe('APPROVED');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      userId: null,
      action: 'platform.restaurant_approved',
      entityId: 'r1',
      metadata: { by: 'platform-admin', from: 'PENDING', to: 'APPROVED' },
    });
    // Same decision again: nothing changes, nothing is recorded.
    expect(await svc.decide('r1', 'APPROVED')).toEqual({ id: 'r1', status: 'APPROVED', changed: false });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(await svc.decide('r1', 'REJECTED')).toMatchObject({ status: 'REJECTED', changed: true });
    await expect(svc.decide('nope', 'APPROVED')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('restaurant signup and login respect approval', () => {
  function authService(over: any = {}) {
    const prisma: any = {
      restaurant: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      user: { findFirst: jest.fn(), findMany: jest.fn() },
      permission: { findMany: jest.fn().mockResolvedValue([{ key: 'x', id: 'p' }]) },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          restaurant: { create: jest.fn(async ({ data }: any) => ({ id: 'r-new', ...data })) },
          branch: { create: jest.fn(async () => ({ id: 'b-new' })) },
          role: { create: jest.fn(async ({ data }: any) => ({ id: `role-${data.name}`, ...data })) },
          rolePermission: { createMany: jest.fn() },
          user: { create: jest.fn(async ({ data }: any) => ({ id: 'u-new', ...data, role: { name: 'OWNER', permissions: [] }, permissionOverrides: [] })) },
          userBranch: { create: jest.fn() },
        }),
      ),
      ...over,
    };
    const svc = new AuthService(prisma, jwt, { verifyLogin: jest.fn() } as any);
    return { svc, prisma };
  }
  const dto = { restaurantName: 'New Cafe', branchName: 'Main', ownerName: 'Owner', email: 'owner@cafe.test', password: 'password123' };

  it('a later self-signup is PENDING: no token, no session', async () => {
    process.env.ALLOW_PUBLIC_SIGNUP = 'true';
    const { svc, prisma } = authService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'existing' });
    prisma.user.findFirst.mockResolvedValue(null);
    const r = await svc.register(dto as any);
    expect(r).toEqual({ pending: true, restaurantName: 'New Cafe' });
  });

  it('the very first restaurant of a fresh install is approved and signed in', async () => {
    const { svc, prisma } = authService();
    prisma.restaurant.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const r = await svc.register(dto as any);
    expect(r.pending).toBeFalsy();
    expect(typeof r.token).toBe('string');
  });

  it("nobody can sign up with the platform admin's login ID", async () => {
    provision();
    process.env.ALLOW_PUBLIC_SIGNUP = 'true';
    const { svc, prisma } = authService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(svc.register({ ...dto, email: ADMIN_EMAIL.toUpperCase() } as any)).rejects.toThrow();
  });

  it.each([
    ['PENDING', 'ACCOUNT_PENDING'],
    ['REJECTED', 'ACCOUNT_REJECTED'],
  ])('login to a %s restaurant gets no session (%s)', async (status, code) => {
    const hash = await bcrypt.hash('pw', 4);
    const { svc, prisma } = authService();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', restaurantId: 'r1', passwordHash: hash, isActive: true, twoFactorEnabled: false, role: { name: 'OWNER', permissions: [] }, permissionOverrides: [] });
    prisma.restaurant.findUnique.mockResolvedValue({ approvalStatus: status });
    const err = await svc.login({ email: 'o@x.test', password: 'pw' } as any).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code });
  });

  it('login to an approved restaurant works as before', async () => {
    const hash = await bcrypt.hash('pw', 4);
    const { svc, prisma } = authService();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', restaurantId: 'r1', name: 'O', roleId: 'x', passwordHash: hash, isActive: true, twoFactorEnabled: false, role: { name: 'OWNER', permissions: [] }, permissionOverrides: [] });
    prisma.restaurant.findUnique.mockResolvedValue({ approvalStatus: 'APPROVED' });
    const r = await svc.login({ email: 'o@x.test', password: 'pw' } as any);
    expect(typeof r.token).toBe('string');
  });

  it('an existing session of a restaurant that is not approved is refused on the next request', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'u5', restaurantId: 'r1', name: 'O', roleId: 'x', isActive: true,
      role: { name: 'OWNER', permissions: [] }, permissionOverrides: [], restaurant: { approvalStatus: 'PENDING' },
    });
    const strat = new JwtStrategy({ getOrThrow: () => 'secret' } as any, { user: { findUnique } } as any);
    await expect(strat.validate({ sub: 'u5' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('the same login form signs the platform admin in separately', () => {
  function res() {
    const r: any = { cookies: {} as Record<string, string>, cleared: [] as string[] };
    r.cookie = jest.fn((k: string, v: string) => (r.cookies[k] = v));
    r.clearCookie = jest.fn((k: string) => r.cleared.push(k));
    return r;
  }
  it('admin ID: admin cookie only, never a restaurant session', async () => {
    provision();
    const admin = new PlatformAdminService(jwt, {} as any, { record: jest.fn() } as any);
    const auth = { login: jest.fn() } as any;
    const ctl = new AuthController(auth, {} as any, admin);
    const r = res();
    const out = await ctl.login({ email: ADMIN_EMAIL, password: 'correct horse battery staple' }, r);
    expect(out).toEqual({ platformAdmin: true });
    expect(Object.keys(r.cookies)).toEqual([PLATFORM_ADMIN_COOKIE]);
    expect(r.cleared).toContain('easydine_session');
    expect(auth.login).not.toHaveBeenCalled();
    const decoded: any = jwt.decode(r.cookies[PLATFORM_ADMIN_COOKIE]);
    expect(decoded.aud).toBe(PLATFORM_ADMIN_AUDIENCE);
  });

  it('restaurant IDs keep the normal login', async () => {
    provision();
    const admin = new PlatformAdminService(jwt, {} as any, { record: jest.fn() } as any);
    const auth = { login: jest.fn().mockResolvedValue({ token: 't', user: { id: 'u' } }) } as any;
    const ctl = new AuthController(auth, {} as any, admin);
    const r = res();
    expect(await ctl.login({ email: 'owner@cafe.test', password: 'pw' }, r)).toEqual({ user: { id: 'u' } });
    expect(r.cookies.easydine_session).toBe('t');
  });
});

describe('customer QR of a restaurant that is not approved', () => {
  it('is not recognized (no menu, no orders)', async () => {
    const table = { id: 't1', status: 'AVAILABLE', floor: { branchId: 'b1', branch: { id: 'b1', isActive: true, restaurant: { approvalStatus: 'PENDING' } } } };
    const prisma: any = { table: { findUnique: jest.fn().mockResolvedValue(table) } };
    const svc = new PublicMenuService(prisma, {} as any, {} as any, {} as any);
    await expect(svc.getMenuByQrToken('tok')).rejects.toBeInstanceOf(NotFoundException);
  });
});
