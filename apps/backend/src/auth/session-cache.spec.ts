import { clearSessionCache, getCachedSession, SESSION_CACHE_TTL_MS, setCachedSession } from './session-cache';
import { JwtStrategy } from './jwt.strategy';

const user = { id: 'u1', restaurantId: 'r1', name: 'A', roleId: 'role', roleName: 'OWNER', permissions: ['orders.view'] } as any;

describe('session cache', () => {
  beforeEach(() => clearSessionCache());

  it('reuses a session within the TTL and forgets it after', () => {
    setCachedSession(user, 1000);
    expect(getCachedSession('u1', 1000 + SESSION_CACHE_TTL_MS - 1)).toBe(user);
    expect(getCachedSession('u1', 1000 + SESSION_CACHE_TTL_MS)).toBeNull();
  });

  it('clears one user or everyone', () => {
    setCachedSession(user);
    setCachedSession({ ...user, id: 'u2' });
    clearSessionCache('u1');
    expect(getCachedSession('u1')).toBeNull();
    expect(getCachedSession('u2')).not.toBeNull();
    clearSessionCache();
    expect(getCachedSession('u2')).toBeNull();
  });

  it('JwtStrategy loads the user once, then serves repeat requests from memory', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'u9', restaurantId: 'r1', name: 'B', roleId: 'role', isActive: true,
      role: { name: 'OWNER', permissions: [{ permission: { key: 'orders.view' } }] },
      permissionOverrides: [],
      restaurant: { approvalStatus: 'APPROVED' },
    });
    const strat = new JwtStrategy({ getOrThrow: () => 'secret' } as any, { user: { findUnique } } as any);
    const a = await strat.validate({ sub: 'u9' });
    const b = await strat.validate({ sub: 'u9' });
    expect(a).toEqual(b);
    expect(a.permissions).toEqual(['orders.view']);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('an inactive user is refused and not cached', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'u8', isActive: false, role: { name: 'X', permissions: [] }, permissionOverrides: [] });
    const strat = new JwtStrategy({ getOrThrow: () => 'secret' } as any, { user: { findUnique } } as any);
    await expect(strat.validate({ sub: 'u8' })).rejects.toThrow();
    await expect(strat.validate({ sub: 'u8' })).rejects.toThrow();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
