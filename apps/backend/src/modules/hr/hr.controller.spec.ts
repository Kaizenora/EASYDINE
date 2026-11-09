import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { BranchAccessService } from '../../common/services/branch-access.service';
import type { SessionUser, ShiftUpdateDto } from '@easydine/types';

describe('HrController', () => {
  let controller: HrController;
  let hrService: jest.Mocked<HrService>;
  let branchAccess: jest.Mocked<BranchAccessService>;

  const mockUser: SessionUser = {
    id: 'user-1',
    restaurantId: 'rest-1',
    name: 'Manager',
    roleId: 'role-admin',
    roleName: 'Manager',
    permissions: ['staff.manage'],
  };

  beforeEach(() => {
    hrService = {
      updateShift: jest.fn().mockResolvedValue({
        id: 'shift-1',
        branchId: 'branch-1',
        name: 'Morning Shift',
        startTime: '08:00',
        endTime: '16:00',
      }),
    } as any;

    branchAccess = {
      assertAccess: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new HrController(hrService, branchAccess);
  });

  describe('updateShift', () => {
    it('updates shift after asserting branch access', async () => {
      const dto: ShiftUpdateDto = {
        name: 'Morning Shift',
        startTime: '08:00',
        endTime: '16:00',
      };

      const result = await controller.updateShift(
        mockUser,
        'branch-1',
        'shift-1',
        dto,
      );

      expect(branchAccess.assertAccess).toHaveBeenCalledWith('rest-1', 'branch-1');
      expect(hrService.updateShift).toHaveBeenCalledWith('branch-1', 'shift-1', dto);
      expect(result).toHaveProperty('id', 'shift-1');
      expect(result).toHaveProperty('name', 'Morning Shift');
    });
  });
});
