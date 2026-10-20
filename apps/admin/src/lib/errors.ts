import { ERROR_CODES, type ErrorCode } from '@streetwear/shared';
import { fr } from '../i18n/fr';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | null,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const isCode = (v: unknown): v is ErrorCode => ERROR_CODES.includes(v as ErrorCode);

export function errorFromBody(status: number, body: unknown): ApiRequestError {
  const e = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)
    ?.error;
  const code = isCode(e?.code) ? e.code : null;
  const message =
    typeof e?.message === 'string' && e.message
      ? e.message
      : code
        ? fr[`error.${code}`]
        : fr['error.unknown'];
  return new ApiRequestError(status, code, message, e?.details);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof TypeError) return fr['error.network'];
  return fr['error.unknown'];
}
