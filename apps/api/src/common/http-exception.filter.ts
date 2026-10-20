import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    let code = CODES[status] ?? 'INTERNAL_ERROR';
    let message = MESSAGES[status] ?? 'Une erreur est survenue. Réessayez plus tard.';
    let details: unknown;

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
