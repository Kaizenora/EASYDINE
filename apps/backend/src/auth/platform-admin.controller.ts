import {
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PLATFORM_ADMIN_COOKIE, PlatformAdminService } from './platform-admin.service';

/** Only a valid platform-admin session (its own cookie + audience). Closed until provisioned. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly admin: PlatformAdminService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.admin.isProvisioned()) throw new ForbiddenException('Platform admin is not set up on this server.');
    const req = ctx.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    if (!(await this.admin.verify(req.cookies?.[PLATFORM_ADMIN_COOKIE]))) {
      throw new ForbiddenException('Platform admin sign-in required.');
    }
    return true;
  }
}

@ApiTags('platform-admin')
@Controller('v1/platform-admin')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly admin: PlatformAdminService) {}

  @Get('me')
  me() {
    return { platformAdmin: true };
  }

  @Get('restaurants')
  list(@Query('status') status?: string) {
    return this.admin.listRestaurants(status);
  }

  @Post('restaurants/:id/approve')
  approve(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.admin.decide(id, 'APPROVED');
  }

  @Post('restaurants/:id/reject')
  reject(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.admin.decide(id, 'REJECTED');
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(PLATFORM_ADMIN_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
    });
    return { ok: true };
  }
}
