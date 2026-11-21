import type { NextFunction, Request, Response } from 'express';

/**
 * En-têtes de sécurité d'une API JSON (équivalent minimal de helmet, sans dépendance).
 * Le Strict-Transport-Security et la CSP du back-office relèvent du reverse proxy qui termine TLS.
 * `Cache-Control: no-store` par défaut : les routes du catalogue le remplacent par leur propre valeur.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}
