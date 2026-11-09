const SENSITIVE = /pass(word)?|secret|token|code|hash|authorization/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE.test(k) ? '[redacted]' : redact(v),
      ]),
    );
  }
  return value;
}

export function maskPhone(phone: string): string {
  return `***${phone.slice(-2)}`;
}

/** `+22890123456` → `+228 90 •• •• 56` (journaux, back-office). */
export function maskTgPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const m = /^\+228(\d{2})\d{4}(\d{2})$/.exec(phone);
  return m ? `+228 ${m[1]} •• •• ${m[2]}` : '••••';
}
