import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { BranchAccessService } from '../../common/services/branch-access.service';
import type { SessionUser } from '@easydine/types';

describe('TablesController', () => {
  let controller: TablesController;
  let tablesService: jest.Mocked<TablesService>;
  let branchAccess: jest.Mocked<BranchAccessService>;

  const mockUser: SessionUser = {
    id: 'user-1',
    restaurantId: 'rest-1',
    name: 'Cashier',
    roleId: 'role-1',
    roleName: 'Cashier',
    permissions: ['tables.view', 'orders.edit'],
  };

  beforeEach(() => {
    tablesService = {
      settleTable: jest.fn().mockResolvedValue({
        success: true,
        ok: true,
        tableId: 't-1',
        tableNumber: '1',
        tableName: 'T1',
        billNumber: 'BILL-001',
        totalAmount: '450.00',
        subtotal: '428.57',
        tax: '21.43',
        paymentMethod: 'UPI',
      }),
      getTableBranch: jest.fn().mockResolvedValue('branch-1'),
    } as any;

    branchAccess = {
      assertAccess: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new TablesController(tablesService, branchAccess);
  });

  describe('settleTable', () => {
    it('settles table with explicit branchId query parameter', async () => {
      const result = await controller.settleTable(
        mockUser,
        't-1',
        'branch-1',
        { method: 'UPI' },
      );

      expect(branchAccess.assertAccess).toHaveBeenCalledWith('rest-1', 'branch-1');
      expect(tablesService.settleTable).toHaveBeenCalledWith(
        'branch-1',
        't-1',
        'user-1',
        'UPI',
      );
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('billNumber', 'BILL-001');
    });

    it('infers branchId from table when query parameter is omitted', async () => {
      const result = await controller.settleTable(
        mockUser,
        't-1',
        undefined,
        { method: 'CASH' },
      );

      expect(tablesService.getTableBranch).toHaveBeenCalledWith('t-1');
      expect(branchAccess.assertAccess).toHaveBeenCalledWith('rest-1', 'branch-1');
      expect(tablesService.settleTable).toHaveBeenCalledWith(
        'branch-1',
        't-1',
        'user-1',
        'CASH',
      );
      expect(result).toHaveProperty('ok', true);
    });
  });
});
