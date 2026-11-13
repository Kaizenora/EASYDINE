import { NotFoundException } from '@nestjs/common';
import { PublicMenuService } from './public-menu.service';
import { TablesService } from '../tables/tables.service';

// Takeaway QR tenant scoping. All Prisma calls are mocked; no database.
const TOKEN_A = 'a'.repeat(32);
const branchA = {
  id: 'branch-a',
  restaurantId: 'rest-a',
  isActive: true,
  takeawayToken: TOKEN_A,
  restaurant: { id: 'rest-a', name: 'A', approvalStatus: 'APPROVED' },
};

function makeService(branches: any[]) {
  const prisma: any = {
    branch: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.takeawayToken !== undefined) {
          return branches.find((b) => b.takeawayToken === where.takeawayToken) ?? null;
        }
        if (where.id !== undefined) return branches.find((b) => b.id === where.id) ?? null;
        return null;
      }),
      // Any "first active branch" style lookup would be a cross-tenant bug.
      findFirst: jest.fn(async () => branches[0] ?? null),
    },
    table: { findUnique: jest.fn().mockResolvedValue(null) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findFirst: jest.fn().mockResolvedValue(null) },
    tableRequest: { findMany: jest.fn().mockResolvedValue([]) },
    userBranch: { findFirst: jest.fn().mockResolvedValue({ userId: 'staff' }) },
  };
  const ordersService: any = {
    createOrder: jest.fn(),
    addItems: jest.fn(),
    resolveOrCreateCustomer: jest.fn(),
  };
  const service = new PublicMenuService(
    prisma,
    ordersService,
    { notifyByPermission: jest.fn() } as any,
    { emitToBranch: jest.fn() } as any,
  );
  return { service, prisma, ordersService };
}

const resolve = (service: PublicMenuService, token: string) =>
  (service as any).resolveTarget(token);

describe('PublicMenuService takeaway QR resolution', () => {
  it('resolves takeaway-<token> to the branch that owns the token', async () => {
    const { service, prisma } = makeService([branchA]);
    const res = await resolve(service, `takeaway-${TOKEN_A}`);
    expect(res.isTakeaway).toBe(true);
    expect(res.branch.id).toBe('branch-a');
    expect(prisma.branch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { takeawayToken: TOKEN_A } }),
    );
  });

  it.each(['takeaway', 'qr-takeaway', 'takeaway-', 'takeawayx'])(
    'does not resolve the global token %p to any branch',
    async (token) => {
      const { service, prisma } = makeService([branchA]);
      await expect(resolve(service, token)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.branch.findFirst).not.toHaveBeenCalled();
    },
  );

  it('does not resolve takeaway-<branchId> (branch ids are not secret)', async () => {
    const { service, prisma } = makeService([branchA]);
    await expect(resolve(service, 'takeaway-branch-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.branch.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'branch-a' } }),
    );
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('does not resolve a branch id that happens to be 32 hex chars by id', async () => {
    const hexId = 'b'.repeat(32);
    const { service } = makeService([{ ...branchA, id: hexId, takeawayToken: null }]);
    await expect(resolve(service, `takeaway-${hexId}`)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unknown token', async () => {
    const { service } = makeService([branchA]);
    await expect(resolve(service, `takeaway-${'c'.repeat(32)}`)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects the token of an inactive branch', async () => {
    const { service } = makeService([{ ...branchA, isActive: false }]);
    await expect(resolve(service, `takeaway-${TOKEN_A}`)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('createOrder and getStatus with the global token never touch another branch', async () => {
    const { service, prisma, ordersService } = makeService([branchA]);
    await expect(
      service.createOrder('takeaway', [{ menuItemId: 'i', quantity: 1, modifierIds: [] }] as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getStatus('qr-takeaway', 'ord-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ordersService.createOrder).not.toHaveBeenCalled();
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('table QR tokens still resolve through Table.qrToken', async () => {
    const { service, prisma } = makeService([branchA]);
    prisma.table.findUnique.mockResolvedValue({
      id: 't1',
      qrToken: 'tbl-token',
      floor: { branch: branchA },
    });
    const res = await resolve(service, 'tbl-token');
    expect(res.isTakeaway).toBe(false);
    expect(res.table.id).toBe('t1');
  });
});

describe('TablesService.getOrCreateTakeawayToken', () => {
  function makeTables(initial: string | null) {
    const state = { token: initial };
    const prisma: any = {
      branch: {
        findUnique: jest.fn(async () => ({ takeawayToken: state.token })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.takeawayToken === null && state.token !== null) return { count: 0 };
          state.token = data.takeawayToken;
          return { count: 1 };
        }),
        update: jest.fn(async ({ data }: any) => {
          state.token = data.takeawayToken;
          return {};
        }),
      },
    };
    const svc = new TablesService(prisma, {} as any, {} as any);
    return { svc, prisma, state };
  }

  it('returns the existing token on ensure without writing', async () => {
    const { svc, prisma } = makeTables(TOKEN_A);
    await expect(svc.getOrCreateTakeawayToken('branch-a', 'ensure')).resolves.toEqual({
      takeawayToken: TOKEN_A,
    });
    expect(prisma.branch.updateMany).not.toHaveBeenCalled();
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('issues an opaque 32-hex token on first ensure', async () => {
    const { svc, state } = makeTables(null);
    const { takeawayToken } = await svc.getOrCreateTakeawayToken('branch-a', 'ensure');
    expect(takeawayToken).toMatch(/^[0-9a-f]{32}$/);
    expect(takeawayToken).not.toContain('branch-a');
    expect(state.token).toBe(takeawayToken);
  });

  it('rotate replaces the token', async () => {
    const { svc, state } = makeTables(TOKEN_A);
    const { takeawayToken } = await svc.getOrCreateTakeawayToken('branch-a', 'rotate');
    expect(takeawayToken).toMatch(/^[0-9a-f]{32}$/);
    expect(takeawayToken).not.toBe(TOKEN_A);
    expect(state.token).toBe(takeawayToken);
  });
});
