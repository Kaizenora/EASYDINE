import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { SessionUser } from '@easydine/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  effectivePermissions,
  permissionInclude,
} from './effective-permissions';
import { PrismaService } from '../prisma/prisma.service';
import { getCachedSession, setCachedSession } from './session-cache';

interface JwtPayload {
  sub: string;
}

const cookieExtractor = (req: {
  cookies?: Record<string, string>;
}): string | null => {
  return req.cookies?.['easydine_session'] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<SessionUser> {
    // Seen seconds ago: skip reloading user + role + permissions (see
    // session-cache.ts; cleared on any staff/role/permission change).
    const cached = getCachedSession(payload.sub);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: permissionInclude,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session no longer valid');
    }

    const session: SessionUser = {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: effectivePermissions(user),
    };
    setCachedSession(session);
    return session;
  }
}
