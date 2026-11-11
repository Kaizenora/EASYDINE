import { GatewayPaymentsService } from './gateway-payments.service';

// The customerName/customerPhone columns come from a separate migration. The
// service must work (and keep paying orders) on a database that lacks them.
function build(columnCount: number) {
  const prisma = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('information_schema')) return [{ n: columnCount }];
      return [{ customerName: 'Asha', customerPhone: '9876543210' }];
    }),
    $executeRaw: jest.fn(async () => 1),
  };
  const svc = new GatewayPaymentsService(prisma as never, {} as never, {} as never);
  return { svc: svc as any, prisma };
}

describe('gateway payer details (migration-tolerant)', () => {
  it('with the columns: saves and loads what the payer typed', async () => {
    const { svc, prisma } = build(2);
    await svc.saveCustomerDetails('gp1', ' Asha ', '9876543210');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(await svc.loadCustomerDetails('gp1')).toEqual({ name: 'Asha', phone: '9876543210' });
  });

  it('without the columns: never touches them and returns nothing (payment still settles)', async () => {
    const { svc, prisma } = build(0);
    await svc.saveCustomerDetails('gp1', 'Asha', '9876543210');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(await svc.loadCustomerDetails('gp1')).toEqual({ name: null, phone: null });
  });

  it('saves nothing when the payer typed nothing', async () => {
    const { svc, prisma } = build(2);
    await svc.saveCustomerDetails('gp1', '  ', undefined);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('a failing column check degrades to "not supported" instead of throwing', async () => {
    const { svc, prisma } = build(2);
    prisma.$queryRaw.mockRejectedValueOnce(new Error('boom'));
    expect(await svc.loadCustomerDetails('gp1')).toEqual({ name: null, phone: null });
  });
});
