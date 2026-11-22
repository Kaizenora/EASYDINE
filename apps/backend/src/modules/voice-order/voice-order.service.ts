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
  quickCashierCommand,
  resolveCashier,
  resolveOrder,
  type CashierCommand,
  type ParsedOrder,
  type VoiceMenuRow,
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

  private async parseWithMenu(
    items: VoiceMenuRow[],
    transcript: string,
  ): Promise<ParsedOrder> {
    if (items.length === 0 || !transcript) return { items: [], unmatched: [] };
    const out = await this.sarvam.chatJson(
      orderSystemPrompt(items),
      transcript,
      'voice_order',
      orderLlmSchema,
    );
    return resolveOrder(items, out);
  }

  async guestParse(qrToken: string, transcript: string): Promise<ParsedOrder> {
    const { items } = await this.publicMenu.voiceMenu(qrToken);
    return this.parseWithMenu(items, transcript);
  }

  /** STT + parse in one request: one round trip from the guest's phone. */
  async guestAudio(
    qrToken: string,
    audio: VoiceAudio | undefined,
  ): Promise<ParsedOrder & Transcription> {
    const { items } = await this.publicMenu.voiceMenu(qrToken);
    const stt = await this.transcribeAndDiscard(
      audio,
      buildKeyterms(items.map((i) => i.name)),
    );
    return { ...stt, ...(await this.parseWithMenu(items, stt.transcript)) };
  }

  // ---------------------------------------------------------------- cashier

  private tablesFor(branchId: string): Promise<VoiceTableRow[]> {
    return this.prisma.table.findMany({
      where: { floor: { branchId } },
      select: { id: true, number: true, name: true },
      orderBy: [{ floorId: 'asc' }, { number: 'asc' }],
    });
  }

  private cashierKeyterms(tables: VoiceTableRow[]): string[] {
    return buildKeyterms([...CASHIER_COMMAND_WORDS, ...tables.map(labelOf)]);
  }

  async staffTranscribe(
    branchId: string,
    audio: VoiceAudio | undefined,
  ): Promise<Transcription> {
    const tables = await this.tablesFor(branchId);
    return this.transcribeAndDiscard(audio, this.cashierKeyterms(tables));
  }

  async cashierCommand(
    branchId: string,
    transcript: string,
    known?: VoiceTableRow[],
  ): Promise<CashierCommandResult> {
    const tables = known ?? (await this.tablesFor(branchId));
    // Plain commands skip the LLM entirely; the rest go to it.
    const cmd =
      quickCashierCommand(transcript, tables) ??
      resolveCashier(
        tables,
        await this.sarvam.chatJson(
          cashierSystemPrompt(tables),
          transcript,
          'cashier_command',
          cashierLlmSchema,
        ),
      );
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

  /** STT + command in one request, for the always-listening cashier mic. */
  async cashierAudio(
    branchId: string,
    audio: VoiceAudio | undefined,
  ): Promise<CashierCommandResult> {
    const tables = await this.tablesFor(branchId);
    const { transcript } = await this.transcribeAndDiscard(
      audio,
      this.cashierKeyterms(tables),
    );
    if (!transcript) {
      return { action: 'unknown', table: null, heard: '', order: null };
    }
    return this.cashierCommand(branchId, transcript, tables);
  }
}
