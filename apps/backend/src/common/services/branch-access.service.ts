import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Phase 1 tenancy check: a branch belongs to exactly one restaurant, and a
// user belongs to exactly one restaurant — this confirms the branchId a
// request references actually belongs to the caller's restaurant. It does
// NOT yet enforce per-branch staff assignment (UserBranch is populated but
// not checked here); that's a deliberate Phase-later tightening once
// multi-branch staff scoping is actually needed, tracked in ROADMAP.md.
// Confirmed (restaurant, branch) pairs. A branch never moves to another
// restaurant, so a yes can be reused for a few minutes and saves one
// database round trip on almost every request. A "no" is never cached.
const ACCESS_TTL_MS = 5 * 60_000;
const allowed = new Map<string, number>();

/** For tests, and if a branch is ever deleted. */
export function clearBranchAccessCache(): void {
  allowed.clear();
}

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
    const key = `${restaurantId}:${branchId}`;
    const seen = allowed.get(key);
    if (seen && Date.now() - seen < ACCESS_TTL_MS) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
      select: { id: true },
    });
    if (!branch) {
      allowed.delete(key);
      throw new ForbiddenException('Branch not found or not accessible');
    }
    if (allowed.size > 5_000) allowed.clear();
    allowed.set(key, Date.now());
  }
}
