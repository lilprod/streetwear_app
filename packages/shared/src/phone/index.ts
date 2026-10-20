const E164_TG = /^\+228\d{8}$/;

/**
 * Normalise un numéro togolais en E.164 (`+228XXXXXXXX`) ou renvoie `null`.
 * Accepte `90 12 34 56`, `+228 90 12 34 56`, `00228…`, `228…` ; séparateurs : espaces, `.`, `-`.
 * Refuse tout ce qui n'a pas exactement 8 chiffres après l'indicatif.
 */
export function normalizeTgPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const compact = input.trim().replace(/[\s.-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits: string;
  if (compact.startsWith('+')) {
    if (!compact.startsWith('+228')) return null;
    digits = compact.slice(4);
  } else if (compact.startsWith('00228')) {
    digits = compact.slice(5);
  } else if (compact.length === 11 && compact.startsWith('228')) {
    digits = compact.slice(3);
  } else {
    digits = compact;
  }
  return /^\d{8}$/.test(digits) ? `+228${digits}` : null;
}

export function isValidTgPhone(input: string): boolean {
  return normalizeTgPhone(input) !== null;
}

/** `+22890123456` -> `+228 90 12 34 56` ; lève si le numéro est invalide. */
export function formatTgPhone(input: string): string {
  const e164 = normalizeTgPhone(input);
  if (!e164 || !E164_TG.test(e164)) throw new RangeError('Numéro de téléphone togolais invalide.');
  const d = e164.slice(4);
  return `+228 ${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
}
