import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // `commit` lets anyone check which build is live (Railway sets
  // RAILWAY_GIT_COMMIT_SHA; other hosts can set GIT_COMMIT_SHA). The repo is
  // public, so the commit id is not a secret. `features` tells the web app
  // what this server understands (e.g. Accept & KOT via the print dialog).
  @Get('health')
  getHealth() {
    const sha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '';
    return {
      status: 'ok',
      commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : null,
      features: ['kot-browser'],
    };
  }
}
