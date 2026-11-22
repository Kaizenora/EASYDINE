import { Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { PublicModule } from '../public/public.module';
import { SarvamClient } from './sarvam.client';
import {
  PublicVoiceOrderController,
  StaffVoiceOrderController,
} from './voice-order.controller';
import { VoiceOrderService } from './voice-order.service';

@Module({
  imports: [PublicModule],
  controllers: [PublicVoiceOrderController, StaffVoiceOrderController],
  providers: [VoiceOrderService, SarvamClient, BranchAccessService],
})
export class VoiceOrderModule {}
