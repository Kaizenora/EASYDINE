import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { APPROVAL_STATUSES, type ApprovalStatus } from './approval';
import { clearSessionCache } from './session-cache';

// One platform (non-tenant) admin who approves restaurant signups. It is not
// a User row and has no restaurant: its login ID and bcrypt hash come from
// the environment, set once by the operator (see scripts/platform-admin-hash.cjs):
//   PLATFORM_ADMIN_EMAIL           the admin login ID
//   PLATFORM_ADMIN_PASSWORD_HASH   bcrypt hash of the admin password
// Nothing is hardcoded or committed. Until both are set, every admin route
// stays closed (403) and the login form treats the ID like any other.
// The admin session is a separate cookie with its own audience, so it can
// never act as a restaurant session, and a restaurant session can never act
// as the admin.

export const PLATFORM_ADMIN_COOKIE = 'easydine_admin';
export const PLATFORM_ADMIN_AUDIENCE = 'easydine-platform-admin';
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export interface PlatformAdminConfig {
  email: string;
  passwordHash: string;
}

export function platformAdminConfig(env: NodeJS.ProcessEnv = process.env): PlatformAdminConfig | null {
  const email = (env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const passwordHash = (env.PLATFORM_ADMIN_PASSWORD_HASH ?? '').trim();
  if (!email || !email.includes('@') || !BCRYPT_HASH.test(passwordHash)) return null;
  return { email, passwordHash };
}

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  isProvisioned(): boolean {
    return platformAdminConfig() !== null;
  }

  /** The login form sent the admin's ID (only once provisioned). */
  isAdminLoginId(id: string): boolean {
    const cfg = platformAdminConfig();
    return !!cfg && id.trim().toLowerCase() === cfg.email;
  }

  /** Verifies the admin password and returns a signed admin session token. */
  async login(password: string): Promise<string> {
    const cfg = platformAdminConfig();
    if (!cfg || !(await bcrypt.compare(password, cfg.passwordHash))) {
      throw new UnauthorizedException('Invalid login ID or password');
    }
    return this.jwt.signAsync(
      { sub: 'platform-admin', typ: 'platform_admin' },
      { audience: PLATFORM_ADMIN_AUDIENCE, expiresIn: '8h' },
    );
  }

  /** True when the token is a valid admin session (and the admin is still provisioned). */
  async verify(token: string | undefined): Promise<boolean> {
    if (!token || !this.isProvisioned()) return false;
    try {
      const p = await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(token, { audience: PLATFORM_ADMIN_AUDIENCE });
      return p.sub === 'platform-admin' && p.typ === 'platform_admin';
    } catch {
      return false;
    }
  }

  async listRestaurants(status?: string) {
    const where = status && (APPROVAL_STATUSES as string[]).includes(status) ? { approvalStatus: status } : {};
    const rows = await this.prisma.restaurant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        name: true,
        createdAt: true,
        approvalStatus: true,
        approvalDecidedAt: true,
        users: {
          where: { role: { name: 'OWNER' } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { name: true, email: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      restaurantName: r.name,
      ownerName: r.users[0]?.name ?? null,
      ownerEmail: r.users[0]?.email ?? null,
      createdAt: r.createdAt,
      status: r.approvalStatus as ApprovalStatus,
      decidedAt: r.approvalDecidedAt,
    }));
  }

  /**
   * Approve or reject. Idempotent: deciding the same way again changes
   * nothing and records nothing new. Every real change is audited and ends
   * the restaurant's cached sessions so it takes effect on the next request.
   */
  async decide(restaurantId: string, status: 'APPROVED' | 'REJECTED') {
    const r = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, approvalStatus: true },
    });
    if (!r) throw new NotFoundException('Restaurant not found');
    if (r.approvalStatus === status) return { id: r.id, status, changed: false };
    const from = r.approvalStatus;
    // Compare-and-set: two clicks (or two admins tabs) cannot both apply.
    const { count } = await this.prisma.restaurant.updateMany({
      where: { id: r.id, approvalStatus: from },
      data: { approvalStatus: status, approvalDecidedAt: new Date() },
    });
    if (count === 0) {
      const now = await this.prisma.restaurant.findUnique({ where: { id: r.id }, select: { approvalStatus: true } });
      return { id: r.id, status: (now?.approvalStatus ?? status) as ApprovalStatus, changed: false };
    }
    clearSessionCache();
    await this.audit.record({
      userId: null,
      action: status === 'APPROVED' ? 'platform.restaurant_approved' : 'platform.restaurant_rejected',
      entity: 'Restaurant',
      entityId: r.id,
      metadata: { by: 'platform-admin', from, to: status, restaurantName: r.name },
    });
    return { id: r.id, status, changed: true };
  }
}
