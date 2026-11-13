import { Injectable, Logger, NotFoundException, OnModuleInit, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { APPROVAL_STATUSES, type ApprovalStatus } from './approval';
import { RealtimeGateway } from '../realtime/realtime.gateway';
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

/**
 * Undoes common paste damage without weakening the check: a bcrypt hash
 * never contains whitespace or quotes, so a line break from a wrapped
 * terminal, surrounding quotes, or the "NAME=" prefix pasted along with the
 * value are removed. Anything else that is not a bcrypt hash stays refused.
 */
export function normalizeAdminHash(raw: string | undefined): string {
  let v = (raw ?? '').replace(/\s+/g, '');
  v = v.replace(/^PLATFORM_ADMIN_PASSWORD_HASH=/, '');
  v = v.replace(/^["'`]+|["'`]+$/g, '');
  return v;
}

export function platformAdminConfig(env: NodeJS.ProcessEnv = process.env): PlatformAdminConfig | null {
  const email = (env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const passwordHash = normalizeAdminHash(env.PLATFORM_ADMIN_PASSWORD_HASH);
  if (!email || !email.includes('@') || !BCRYPT_HASH.test(passwordHash)) return null;
  return { email, passwordHash };
}

/**
 * Why the admin is not active, without revealing the secret: only lengths,
 * the hash prefix shape and character classes. Null when it is set up (or
 * deliberately not configured at all).
 */
export function platformAdminConfigProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const rawEmail = env.PLATFORM_ADMIN_EMAIL ?? '';
  const rawHash = env.PLATFORM_ADMIN_PASSWORD_HASH ?? '';
  if (!rawEmail && !rawHash) return null;
  if (platformAdminConfig(env)) return null;
  const problems: string[] = [];
  if (!rawEmail.trim()) problems.push('PLATFORM_ADMIN_EMAIL is empty');
  else if (!rawEmail.includes('@')) problems.push('PLATFORM_ADMIN_EMAIL has no @');
  const h = normalizeAdminHash(rawHash);
  if (!rawHash) problems.push('PLATFORM_ADMIN_PASSWORD_HASH is empty');
  else if (!BCRYPT_HASH.test(h)) {
    const badChars = h.replace(/[./A-Za-z0-9$]/g, '').length;
    problems.push(
      `PLATFORM_ADMIN_PASSWORD_HASH is not a bcrypt hash (length ${h.length}, expected 60; ` +
        `starts like $2b$12$: ${/^\$2[aby]\$\d{2}\$/.test(h) ? 'yes' : 'no'}; unexpected characters: ${badChars})`,
    );
  }
  return problems.join('; ');
}

@Injectable()
export class PlatformAdminService implements OnModuleInit {
  onModuleInit() {
    const problem = platformAdminConfigProblem();
    if (problem) new Logger('PlatformAdmin').warn(`Platform admin is not active: ${problem}`);
  }

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly realtime?: RealtimeGateway,
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
    if (status !== 'APPROVED' && this.realtime) {
      const branches = await this.prisma.branch.findMany({ where: { restaurantId: r.id }, select: { id: true } });
      this.realtime.disconnectBranches(branches.map((b) => b.id));
    }
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
