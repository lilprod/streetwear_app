const NNBSP = ' ';

/**
 * `12000` -> `12 000 FCFA`. Séparateur de milliers et espace avant FCFA : espace fine
 * insécable U+202F (convention du projet). Entiers uniquement.
 */
export function formatXof(amountXof: number): string {
  if (!Number.isSafeInteger(amountXof)) {
    throw new RangeError('Un montant XOF doit être un entier.');
  }
  const sign = amountXof < 0 ? '-' : '';
  const digits = String(Math.abs(amountXof)).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return `${sign}${digits}${NNBSP}FCFA`;
}
