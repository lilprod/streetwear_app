import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { ApiException } from './api-exception';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Les données envoyées sont invalides.',
        result.error.flatten(),
      );
    }
    return result.data;
  }
}
