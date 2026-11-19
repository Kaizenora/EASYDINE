import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

// Binds a shared Zod schema (from @easydine/types) into Nest's
// pipe pipeline, so the same schema validates on the frontend and here —
// one source of truth per DTO instead of hand-duplicated class-validator DTOs.
//
// `@UsePipes()` applied at the method level runs the pipe against EVERY
// parameter (query/param/custom-decorator values too, not just @Body()) —
// so this must only validate the "body" metadata type and pass everything
// else through untouched, or a plain @Query("branchId") string gets fed
// into a schema that expects the whole request-body object and fails with
// a confusing "expected object, received string".
export class ZodValidationPipe<T> implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}

/**
 * Validation for PATCH bodies: the full schema's rules, but only for the keys
 * the client actually sent. `schema.partial()` alone is not enough because
 * fields with `.default()` would be re-filled and silently overwrite stored
 * values (e.g. reset `isVeg`, `isActive` or the item's add-on groups on an
 * unrelated edit). Unknown keys are dropped by the schema, as on create.
 */
export class ZodPartialValidationPipe<T> extends ZodValidationPipe<T> {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const parsed = super.transform(value, metadata);
    if (
      metadata.type !== 'body' ||
      typeof value !== 'object' ||
      value === null ||
      typeof parsed !== 'object' ||
      parsed === null
    ) {
      return parsed;
    }
    const sent = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([k]) => k in sent,
      ),
    );
  }
}
