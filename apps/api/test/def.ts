/** Valeur garantie par le test : échoue clairement plutôt qu'une assertion non nulle. */
export function def<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Valeur attendue absente');
  return value;
}
