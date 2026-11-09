import type { NextFunction, Request, Response } from 'express';

export const WEBHOOKS_PATH = '/v1/webhooks/payments';
const MAX_BYTES = 256 * 1024;

/**
 * Conserve le corps exact des webhooks (`req.body` = Buffer) pour vérifier la signature.
 * Monté avant le parseur JSON : `_body = true` lui fait ignorer ces requêtes ; les autres routes
 * gardent le parseur JSON habituel.
 */
export function rawBodyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  req.on('data', (chunk: Buffer) => {
    if (done) return;
    size += chunk.length;
    if (size > MAX_BYTES) {
      done = true;
      res.status(413).json({
        error: { code: 'VALIDATION_FAILED', message: 'Corps de requête trop volumineux.' },
      });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (done) return;
    done = true;
    (req as Request & { _body?: boolean })._body = true;
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on('error', (err) => {
    if (done) return;
    done = true;
    next(err);
  });
}
