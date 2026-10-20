import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, from, mergeMap } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.types';
import { AuditService } from './audit.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_PATH = /^\/v1\/admin\/([^/]+)/;

function idOf(body: unknown): string | undefined {
  const id = (body as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const match = ADMIN_PATH.exec(req.path);
    if (!match || !req.admin || !WRITE_METHODS.has(req.method)) return next.handle();

    const entity = match[1] as string;
    const rawId = req.params?.id;
    const entityId = typeof rawId === 'string' ? rawId : undefined;
    const admin = req.admin;
    const action = `${req.method} ${String(req.route?.path ?? req.path).replace(/^\/v1/, '')}`;

    return from(this.audit.snapshot(entity, entityId)).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (after) => {
            await this.audit.record({
              adminUserId: admin.id,
              action,
              entity,
              entityId: entityId ?? idOf(after),
              before,
              after,
            });
            return after;
          }),
        ),
      ),
    );
  }
}
