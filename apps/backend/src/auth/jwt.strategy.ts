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
    const t0 = performance.now();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: permissionInclude,
    });
    const durationMs = (performance.now() - t0).toFixed(2);
    console.log(`[auth-validate] duration=${durationMs}ms`);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: effectivePermissions(user),
    };
  }
}
