const MASKED_FIELDS = new Set(['phone', 'address', 'landmark']);

export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, MASKED_FIELDS.has(k) ? '[masqué]' : scrub(v)]),
    );
  }
  return value;
}
