import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicMenuService } from '../public/public-menu.service';
import { SarvamClient, type Transcription } from './sarvam.client';
import {
  buildKeyterms,
  CASHIER_COMMAND_WORDS,
  cashierLlmSchema,
  cashierSystemPrompt,
  labelOf,
  orderLlmSchema,
  orderSystemPrompt,
  resolveCashier,
  resolveOrder,
  type CashierCommand,
  type ParsedOrder,
  type VoiceTableRow,
} from './voice-order.logic';

export interface VoiceAudio {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** What the POS gets back for a spoken command; it executes nothing itself. */
export interface CashierCommandResult extends CashierCommand {
  heard: string;
  /** The order the action applies to (open bill, or last paid bill for reprintBill). */
  order: { id: string; orderNumber: string; status: string } | null;
}

@Injectable()
export class VoiceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicMenu: PublicMenuService,
    private readonly sarvam: SarvamClient,
  ) {}

  /** Transcribe, then wipe the audio: it is never stored in the DB or on disk. */
  private async transcribeAndDiscard(
    audio: VoiceAudio | undefined,
    keyterms: string[],
  ): Promise<Transcription> {
    if (!audio || audio.size === 0)
      throw new BadRequestException('No audio received');
    try {
      return await this.sarvam.transcribe(
        audio.buffer,
        audio.mimetype || 'audio/webm',
        keyterms,
      );
    } finally {
      audio.buffer.fill(0);
    }
  }

  // ---------------------------------------------------------------- guest

  async guestTranscribe(
    qrToken: string,
    audio: VoiceAudio | undefined,
  ): Promise<Transcription> {
    const { items } = await this.publicMenu.voiceMenu(qrToken);
    return this.transcribeAndDiscard(
      audio,
      buildKeyterms(items.map((i) => i.name)),
    );
  }

  async guestParse(qrToken: string, transcript: string): Promise<ParsedOrder> {
    const { items } = await this.publicMenu.voiceMenu(qrToken);
    if (items.length === 0) return { items: [], unmatched: [] };
    const out = await this.sarvam.chatJson(
      orderSystemPrompt(items),
      transcript,
      'voice_order',
      orderLlmSchema,
    );
    return resolveOrder(items, out);
  }

  // ---------------------------------------------------------------- cashier

  private tablesFor(branchId: string): Promise<VoiceTableRow[]> {
    return this.prisma.table.findMany({
      where: { floor: { branchId } },
      select: { id: true, number: true, name: true },
      orderBy: [{ floorId: 'asc' }, { number: 'asc' }],
    });
  }

  async staffTranscribe(
    branchId: string,
    audio: VoiceAudio | undefined,
  ): Promise<Transcription> {
    const tables = await this.tablesFor(branchId);
    return this.transcribeAndDiscard(
      audio,
      buildKeyterms([...CASHIER_COMMAND_WORDS, ...tables.map(labelOf)]),
    );
  }

  async cashierCommand(
    branchId: string,
    transcript: string,
  ): Promise<CashierCommandResult> {
    const tables = await this.tablesFor(branchId);
    const out = await this.sarvam.chatJson(
      cashierSystemPrompt(tables),
      transcript,
      'cashier_command',
      cashierLlmSchema,
    );
    const cmd = resolveCashier(tables, out);
    if (!cmd.table) return { ...cmd, heard: transcript, order: null };

    const select = { id: true, orderNumber: true, status: true } as const;
    let order = await this.prisma.order.findFirst({
      where: { branchId, tableId: cmd.table.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select,
    });
    // A bill can be reprinted at any time, also after the table has paid.
    if (!order && cmd.action === 'reprintBill') {
      order = await this.prisma.order.findFirst({
        where: { branchId, tableId: cmd.table.id, status: 'PAID' },
        orderBy: { billedAt: 'desc' },
        select,
      });
    }
    return { ...cmd, heard: transcript, order };
  }
}
