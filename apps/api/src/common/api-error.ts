import { HttpException } from '@nestjs/common';

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): HttpException {
  return new HttpException(
    { code, message, ...(details === undefined ? {} : { details }) },
    status,
  );
}
