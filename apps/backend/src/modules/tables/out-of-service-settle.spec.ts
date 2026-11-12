import { ConflictException } from '@nestjs/common';
import { TablesService } from './tables.service';

// An out-of-service table with no open bill has nothing to settle (the tile
// used to offer a zero-rupee "Settle bill"). Prisma is mocked.
describe('TablesService.settleTable on an out-of-service table', () => {
  function make(order: any) {
    const table = { id: 't5', number: '5', status: 'OUT_OF_SERVICE' };
    const prisma: any = {
      table: {
        findFirst: jest.fn().mockResolvedValue(table),
        findUniqueOrThrow: jest.fn().mockResolvedValue(table),
        update: jest.fn(),
      },
      order: { findFirst: jest.fn().mockResolvedValue(order) },
    };
    const orders: any = { checkout: jest.fn(), previewBill: jest.fn() };
    return { svc: new TablesService(prisma, { emitToBranch: jest.fn() } as any, orders), prisma, orders };
  }

  it('refuses a zero settle and leaves the table as it is', async () => {
    const { svc, prisma, orders } = make(null);
    await expect(svc.settleTable('b1', 't5', 'u1', 'CASH')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(orders.checkout).not.toHaveBeenCalled();
  });
});
