import { ApiRequestError, errorFromBody } from './errors';
import { fr } from '../i18n/fr';

type TokenSource = {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onUnauthorized: () => void;
};
let source: TokenSource = {
  getToken: () => null,
  refresh: () => Promise.resolve(null),
  onUnauthorized: () => undefined,
};
export const configureApi = (s: TokenSource): void => {
  source = s;
};

const base = (): string => import.meta.env.VITE_API_URL || '/v1';
const url = (path: string): string => new URL(base() + path, window.location.origin).toString();

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  signal?: AbortSignal;
};

let refreshing: Promise<string | null> | null = null;
const refreshOnce = (): Promise<string | null> => {
  refreshing ??= source.refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
};

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const target = new URL(url(path));
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== '') target.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = opts.auth === false ? null : source.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(target, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      if (!retried && (await refreshOnce())) return api<T>(path, opts, true);
      source.onUnauthorized();
    }
    throw errorFromBody(res.status, json);
  }
  if (json === null) throw new ApiRequestError(res.status, null, fr['error.unknown']);
  return json as T;
}
