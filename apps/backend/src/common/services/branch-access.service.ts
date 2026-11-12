import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Phase 1 tenancy check: a branch belongs to exactly one restaurant, and a
// user belongs to exactly one restaurant — this confirms the branchId a
// request references actually belongs to the caller's restaurant. It does
// NOT yet enforce per-branch staff assignment (UserBranch is populated but
// not checked here); that's a deliberate Phase-later tightening once
// multi-branch staff scoping is actually needed, tracked in ROADMAP.md.
@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(restaurantId: string, branchId: unknown): Promise<void> {
    // A missing branchId used to slip through: Prisma drops `id: undefined`
    // from the filter, so ANY branch of the restaurant matched, and the
    // caller then queried orders with no branch filter at all (other
    // restaurants' data). Only a non-empty string is a branch reference;
    // ?branchId=a&branchId=b arrives as an array and is rejected too.
    if (typeof branchId !== 'string' || branchId.trim() === '') {
      throw new BadRequestException('branchId is required');
    }
    if (typeof restaurantId !== 'string' || restaurantId === '') {
      throw new ForbiddenException('Branch not found or not accessible');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
      select: { id: true },
    });
    if (!branch) {
      throw new ForbiddenException('Branch not found or not accessible');
    }
  }
}
