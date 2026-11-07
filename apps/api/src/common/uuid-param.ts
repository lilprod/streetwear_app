import type { PipeTransform } from '@nestjs/common';
import { notFound } from './api-exception';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paramètre `:id` non UUID → 404 (ressource introuvable), jamais une erreur SQL. */
export const UuidParam: PipeTransform<string, string> = {
  transform(value: string): string {
    if (!UUID.test(value)) throw notFound();
    return value;
  },
};
