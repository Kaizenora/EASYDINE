import { isApproved, notApprovedError } from './approval';
import { platformAdminConfig } from './platform-admin.service';
import { clearSessionCache } from './session-cache';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  STAFF_ROLES,
  type LoginDto,
  type PinLoginDto,
  type RegisterDto,
  type SessionUser,
} from '@easydine/types';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from './two-factor.service';
import {
  effectivePermissions,
  permissionInclude,
  type PermissionSource,
} from './effective-permissions';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private toSessionUser(user: {
    id: string;
    restaurantId: string;
    name: string;
    roleId: string;
    role: { name: string; permissions: { permission: { key: string } }[] };
    permissionOverrides?: PermissionSource['permissionOverrides'];
  }): SessionUser {
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: effectivePermissions(user),
    };
  }

  /**
   * Delete my own account (an app-store requirement). The person's details are
   * erased and the login closed; order and payment rows that point at the user
   * stay, because tax records must be kept. The last active owner cannot do
   * this, or the restaurant would be locked out.
   */
  async deleteOwnAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    if (user.role.name === 'OWNER') {
      const otherOwners = await this.prisma.user.count({
        where: {
          restaurantId: user.restaurantId,
          isActive: true,
          id: { not: user.id },
          role: { name: 'OWNER' },
        },
      });
      if (otherOwners === 0) {
        throw new ConflictException(
          'You are the only owner. Make someone else an owner first, or contact support to close the restaurant.',
        );
      }
    }
    const scrambled = await bcrypt.hash(
      `${userId}:${Date.now()}:${Math.random()}`,
      10,
    );
    await this.prisma.$transaction([
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({
        where: { recipientUserId: userId },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted user',
          email: null,
          phone: null,
          passwordHash: scrambled,
          pinHash: null,
          isActive: false,
          riderOnline: false,
          riderLat: null,
          riderLng: null,
          riderLocationAt: null,
          dashboardPrefs: Prisma.JsonNull,
          twoFactorSecret: null,
          twoFactorEnabled: false,
          twoFactorRecoveryHashes: [],
        },
      }),
    ]);
    clearSessionCache(userId); // deactivated: no further requests
    return { ok: true };
  }

  async login(dto: LoginDto) {
    const include = permissionInclude;
    const id = dto.email.trim();
    let user: Awaited<ReturnType<typeof this.findLoginCandidate>> = null;
    // An email address, or a phone number as the login ID (delivery riders).
    // Every failure gives the same message so nothing reveals which IDs exist.
    if (id.includes('@')) {
      const u = await this.prisma.user.findFirst({
        where: { email: id, isActive: true },
        include,
      });
      if (u && (await bcrypt.compare(dto.password, u.passwordHash))) user = u;
    } else {
      user = await this.findLoginCandidate(id, dto.password);
    }
    if (!user) {
      // Spend comparable time when the ID is unknown, so timing does not reveal it.
      await bcrypt.compare(
        dto.password,
        '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi',
      );
      throw new UnauthorizedException('Invalid login ID or password');
    }

    // Only asked for after the password is right, so the response never
    // reveals which emails exist or which accounts use two-factor.
    if (user.twoFactorEnabled) {
      await this.twoFactor.verifyLogin(user, dto.totp);
    }

    await this.assertRestaurantApproved(user.restaurantId);
    return this.issueSession(user);
  }

  /** No session for a restaurant the platform admin has not approved. */
  private async assertRestaurantApproved(restaurantId: string) {
    const r = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { approvalStatus: true },
    });
    if (!isApproved(r?.approvalStatus)) throw notApprovedError(r?.approvalStatus);
  }

  /** Phone-number login: compare real digits, then the password, against every active match. */
  private async findLoginCandidate(id: string, password: string) {
    const tail = id.replace(/\D/g, '').slice(-10);
    if (tail.length < 6) return null;
    const candidates = await this.prisma.user.findMany({
      where: { isActive: true, phone: { endsWith: tail.slice(-6) } },
      include: permissionInclude,
      take: 10,
    });
    for (const u of candidates) {
      if ((u.phone ?? '').replace(/\D/g, '').slice(-10) !== tail) continue;
      if (await bcrypt.compare(password, u.passwordHash)) return u;
    }
    return null;
  }

  async register(
    dto: RegisterDto,
  ): Promise<
    | { pending: true; restaurantName: string; token?: undefined; user?: undefined }
    | { pending?: false; token: string; user: ReturnType<AuthService['toSessionUser']> }
  > {
    // Sign-up is first-run setup. Once the server has a restaurant, anyone on
    // the network creating another would get an OWNER role - which carries the
    // instance-wide backup, update and sync permissions - so it stays closed
    // unless the host opts in (ALLOW_PUBLIC_SIGNUP=true) to run several tenants.
    if (
      process.env.ALLOW_PUBLIC_SIGNUP !== 'true' &&
      (await this.hasAnyRestaurant())
    ) {
      throw new ForbiddenException(
        'Sign-up is closed on this server. Ask the restaurant owner to create your account.',
      );
    }
    // The platform admin's login ID can never belong to a restaurant account.
    if (platformAdminConfig()?.email === dto.email.trim().toLowerCase()) {
      throw new BadRequestException('An account with this email already exists');
    }
    // The very first restaurant on a fresh install is the operator's own and
    // is approved; every later self-signup waits for the platform admin.
    const approvalStatus = (await this.hasAnyRestaurant()) ? 'PENDING' : 'APPROVED';
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }

    // Permissions are global, not per-tenant — fetch them, or upsert if empty
    let allPermissions = await this.prisma.permission.findMany();
    if (allPermissions.length === 0) {
      await Promise.all(
        PERMISSIONS.map((permission) =>
          this.prisma.permission.upsert({
            where: { key: permission.key },
            update: {},
            create: permission,
          }),
        ),
      );
      allPermissions = await this.prisma.permission.findMany();
    }
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const owner = await this.prisma.$transaction(
      async (tx) => {
        const restaurant = await tx.restaurant.create({
          data: { name: dto.restaurantName, approvalStatus },
        });
        const branch = await tx.branch.create({
          data: { restaurantId: restaurant.id, name: dto.branchName },
        });

        // Parallelize creating the 8 staff roles
        const createdRoles = await Promise.all(
          STAFF_ROLES.map((roleName) =>
            tx.role.create({
              data: {
                restaurantId: restaurant.id,
                name: roleName,
                label: roleName.replace(/_/g, ' '),
              },
            }),
          ),
        );

        const ownerRole = createdRoles.find((r) => r.name === 'OWNER') || createdRoles[0];
        const ownerRoleId = ownerRole.id;

        // Batch all role-permission mappings into a single createMany
        const rolePermData: { roleId: string; permissionId: string; }[] = [];
        for (const role of createdRoles) {
          const grantedKeys = DEFAULT_ROLE_PERMISSIONS[role.name] || [];
          for (const key of grantedKeys) {
            const p = permissionByKey.get(key);
            if (p) {
              rolePermData.push({ roleId: role.id, permissionId: p.id });
            }
          }
        }
        if (rolePermData.length > 0) {
          await tx.rolePermission.createMany({
            data: rolePermData,
            skipDuplicates: true,
          });
        }

        const user = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            roleId: ownerRoleId,
            name: dto.ownerName,
            email: dto.email,
            passwordHash,
          },
          include: permissionInclude,
        });

        await tx.userBranch.create({
          data: { userId: user.id, branchId: branch.id },
        });

        return user;
      },
      {
        maxWait: 30000,
        timeout: 60000,
      },
    );

    if (approvalStatus !== 'APPROVED') {
      return { pending: true, restaurantName: dto.restaurantName };
    }
    return this.issueSession(owner);
  }

  async hasAnyRestaurant(): Promise<boolean> {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { id: true },
    });
    return restaurant !== null;
  }

  async pinLogin(dto: PinLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: permissionInclude,
    });

    if (!user || !user.isActive || !user.pinHash) {
      throw new UnauthorizedException('PIN login not available for this user');
    }
    // A 4-8 digit PIN must not be a way around the second factor.
    if (user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'PIN login is off for accounts with two-factor authentication — sign in with your password',
      );
    }

    const valid = await bcrypt.compare(dto.pin, user.pinHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect PIN');
    }

    await this.assertRestaurantApproved(user.restaurantId);
    return this.issueSession(user);
  }

  private async issueSession(
    user: Parameters<AuthService['toSessionUser']>[0],
  ) {
    const sessionUser = this.toSessionUser(user);
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: sessionUser };
  }
}
