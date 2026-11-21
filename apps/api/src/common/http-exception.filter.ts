import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { captureServerError } from '../config/sentry';

const CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

const MESSAGES: Record<number, string> = {
  400: 'Requête invalide.',
  401: 'Authentification requise.',
  403: 'Accès refusé.',
  404: 'Ressource introuvable.',
  409: 'Conflit avec l’état actuel de la ressource.',
  429: 'Trop de requêtes, réessayez plus tard.',
  503: 'Service momentanément indisponible.',
};

/** Erreurs de body-parser (corps > limite : 413, JSON illisible : 400), qui ne sont pas des HttpException. */
function bodyParserStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object' || e instanceof HttpException) return undefined;
  const { type, status } = e as { type?: unknown; status?: unknown };
  const isParser = typeof type === 'string' && type.startsWith('entity.');
  return isParser && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const parserStatus = bodyParserStatus(exception);
    const status =
      parserStatus ?? (exception instanceof HttpException ? exception.getStatus() : 500);
    let code = CODES[status] ?? (parserStatus ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR');
    let message =
      MESSAGES[status] ??
      (parserStatus
        ? 'Corps de requête invalide ou trop volumineux.'
        : 'Une erreur est survenue. Réessayez plus tard.');
    let details: unknown;

    if (status >= 500) captureServerError(exception);

    if (status >= 500 && !(exception instanceof HttpException)) {
      const e = exception instanceof Error ? exception : new Error('unknown');
      this.logger.error(`${e.name}: ${e.message.split('\n').slice(-2).join(' ').slice(0, 300)}`);
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (body && typeof body === 'object') {
        const b = body as { code?: string; message?: unknown; details?: unknown };
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string' && b.code) message = b.message;
        details = b.details;
      }
    }

    res
      .status(status === 0 ? HttpStatus.INTERNAL_SERVER_ERROR : status)
      .json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
  }
}
