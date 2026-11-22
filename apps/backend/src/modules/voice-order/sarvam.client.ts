import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

// Server-side only: SARVAM_API_KEY never leaves this process. Audio is passed
// straight through from memory and never written anywhere.

const STT_URL = 'https://api.sarvam.ai/speech-to-text';
const CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
/** sarvam-m is retired; sarvam-105b is its replacement on /v1. */
const DEFAULT_LLM_MODEL = 'sarvam-105b';

const sttResponseSchema = z.object({
  transcript: z.string(),
  language_code: z.string().nullable().optional(),
  language_probability: z.number().nullable().optional(),
});

const chatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

export interface Transcription {
  transcript: string;
  languageCode: string | null;
  languageProbability: number | null;
}

@Injectable()
export class SarvamClient {
  private readonly logger = new Logger(SarvamClient.name);

  constructor(private readonly config: ConfigService) {}

  private key(): string {
    const key = this.config.get<string>('SARVAM_API_KEY');
    if (!key)
      throw new ServiceUnavailableException('Voice ordering is not set up');
    return key;
  }

  private async fail(res: Response, what: string): Promise<never> {
    const body = await res.text().catch(() => '');
    this.logger.warn(
      `Sarvam ${what} failed: ${res.status} ${body.slice(0, 300)}`,
    );
    if (res.status === 429 || res.status === 503) {
      throw new ServiceUnavailableException(
        'Voice is busy right now. Please try again in a moment.',
      );
    }
    throw new BadGatewayException(
      'Voice service failed. Please try again or order from the menu.',
    );
  }

  /** Auto-detects English / Hindi / Marathi (language_code "unknown"). */
  async transcribe(
    audio: Buffer,
    mimeType: string,
    keyterms: readonly string[],
  ): Promise<Transcription> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      'speech.webm',
    );
    form.append('model', 'saaras:v4');
    form.append('mode', 'transcribe');
    form.append('language_code', 'unknown');
    if (keyterms.length > 0) form.append('keyterms', JSON.stringify(keyterms));

    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': this.key() },
      body: form,
      signal: AbortSignal.timeout(30_000),
    }).catch((err: unknown) => {
      this.logger.warn(`Sarvam STT unreachable: ${String(err)}`);
      throw new BadGatewayException(
        'Voice service unreachable. Please try again.',
      );
    });
    if (!res.ok) return this.fail(res, 'STT');
    const parsed = sttResponseSchema.safeParse(await res.json());
    if (!parsed.success)
      throw new BadGatewayException('Voice service sent an unexpected reply');
    return {
      transcript: parsed.data.transcript.trim(),
      languageCode: parsed.data.language_code ?? null,
      languageProbability: parsed.data.language_probability ?? null,
    };
  }

  /** One chat call whose reply must match `schema`; anything else is rejected. */
  async chatJson<T>(
    system: string,
    user: string,
    name: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': this.key(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.get<string>('SARVAM_LLM_MODEL') || DEFAULT_LLM_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        // Reasoning off: faster, cheaper, and the reply lands in `content`.
        reasoning_effort: null,
        response_format: {
          type: 'json_schema',
          json_schema: { name, schema: jsonSchema, strict: true },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch((err: unknown) => {
      this.logger.warn(`Sarvam chat unreachable: ${String(err)}`);
      throw new BadGatewayException(
        'Voice service unreachable. Please try again.',
      );
    });
    if (!res.ok) return this.fail(res, 'chat');
    const reply = chatResponseSchema.safeParse(await res.json());
    const content = reply.success
      ? reply.data.choices[0].message.content
      : null;
    if (!content)
      throw new BadGatewayException(
        'Could not understand that. Please try again.',
      );
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new BadGatewayException(
        'Could not understand that. Please try again.',
      );
    }
    const out = schema.safeParse(json);
    if (!out.success) {
      this.logger.warn(
        `Sarvam chat reply failed validation: ${out.error.message.slice(0, 300)}`,
      );
      throw new BadGatewayException(
        'Could not understand that. Please try again.',
      );
    }
    return out.data;
  }
}
