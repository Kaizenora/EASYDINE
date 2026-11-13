import { ForbiddenException } from '@nestjs/common';

// Platform approval of restaurant accounts (Restaurant.approvalStatus).
export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export const APPROVAL_STATUSES: ApprovalStatus[] = ['APPROVED', 'PENDING', 'REJECTED'];

export function isApproved(status: string | null | undefined): boolean {
  // A missing value (older row shape in a test double) is not approved.
  return status === 'APPROVED';
}

/** The error a not-approved restaurant gets on login and on every request. */
export function notApprovedError(status: string | null | undefined): ForbiddenException {
  return status === 'REJECTED'
    ? new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_REJECTED',
        message: 'This restaurant account was not approved. Contact EasyDine support.',
      })
    : new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_PENDING',
        message: 'Your restaurant account is waiting for approval. You can sign in once it is approved.',
      });
}
