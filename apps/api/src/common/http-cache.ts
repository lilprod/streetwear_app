import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

export const CACHE_SECONDS = 'cache_seconds';
export const HttpCache = (seconds = 300) => SetMetadata(CACHE_SECONDS, seconds);

/** Cache-Control public ; l'ETag faible est calculé par Express (304 sur If-None-Match). */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const seconds = this.reflector.get<number | undefined>(CACHE_SECONDS, context.getHandler());
    if (seconds !== undefined) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Cache-Control', `public, max-age=${seconds}`);
    }
    return next.handle();
  }
}
