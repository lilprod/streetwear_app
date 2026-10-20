import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { apiError } from './api-error';

export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw apiError(
        400,
        'VALIDATION_FAILED',
        'Les données envoyées sont invalides.',
        result.error.flatten(),
      );
    }
    return result.data;
  }
}
