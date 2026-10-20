import { HttpException } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ code, message, ...(details === undefined ? {} : { details }) }, status);
  }
}

export const notFound = (what = 'Ressource') =>
  new ApiException(404, 'NOT_FOUND', `${what} introuvable.`);
