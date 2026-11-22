import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { SessionUser } from '@easydine/types';
import { memoryStorage } from 'multer';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { transcriptBodySchema, type TranscriptBody } from './voice-order.logic';
import { VoiceOrderService } from './voice-order.service';

// ~25 s of opus is well under 200 KB; 1 MB leaves room for Safari's mp4/aac
// and keeps Sarvam per-minute costs bounded. Memory only: never on disk.
const MAX_AUDIO_BYTES = 1024 * 1024;

const audioUpload = FileInterceptor('audio', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (
      !/^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|x-m4a)\b/.test(
        file.mimetype,
      )
    ) {
      cb(new BadRequestException('Unsupported audio format'), false);
      return;
    }
    cb(null, true);
  },
});

/**
 * Guest voice ordering on the table/takeaway QR page. Unauthenticated like the
 * rest of the QR flow, reachable only by the opaque qrToken; the restaurant is
 * resolved from it exactly like GET v1/public/menu/:qrToken.
 */
@ApiTags('voice-order')
@Controller('v1/public/menu/:qrToken/voice-order')
export class PublicVoiceOrderController {
  constructor(private readonly voice: VoiceOrderService) {}

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('stt')
  @UseInterceptors(audioUpload)
  stt(
    @Param('qrToken') qrToken: string,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    return this.voice.guestTranscribe(qrToken, audio);
  }

  /** STT + parse in one round trip (what the guest mic uses). */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('audio')
  @UseInterceptors(audioUpload)
  audio(
    @Param('qrToken') qrToken: string,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    return this.voice.guestAudio(qrToken, audio);
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('parse')
  parse(
    @Param('qrToken') qrToken: string,
    @Body(new ZodValidationPipe(transcriptBodySchema)) body: TranscriptBody,
  ) {
    return this.voice.guestParse(qrToken, body.transcript);
  }
}

/** Cashier/POS voice commands: staff login + the caller's own branch only. */
@ApiTags('voice-order')
@Controller('v1/voice-order')
export class StaffVoiceOrderController {
  constructor(
    private readonly voice: VoiceOrderService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('orders.create')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('stt')
  @UseInterceptors(audioUpload)
  async stt(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.voice.staffTranscribe(branchId, audio);
  }

  /**
   * STT + command in one round trip, for the always-on cashier mic. Higher
   * limit: it sends every utterance it hears, most of them not commands.
   */
  @Auth('orders.create')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('cashier-audio')
  @UseInterceptors(audioUpload)
  async cashierAudio(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.voice.cashierAudio(branchId, audio);
  }

  @Auth('orders.create')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('cashier')
  async cashier(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body(new ZodValidationPipe(transcriptBodySchema)) body: TranscriptBody,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.voice.cashierCommand(branchId, body.transcript);
  }
}
