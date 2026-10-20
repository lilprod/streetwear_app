/** Sans accents, minuscules, sans ponctuation ni symboles ; espaces réduits. */
export function normalizeForModeration(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Vrai si le texte contient un mot interdit (sous-chaîne, sans accents ni casse). Interprétation
 * stricte : la comparaison est aussi faite espaces retirés pour déjouer « p u t e ».
 */
export function containsBannedWord(text: string, words: readonly string[]): boolean {
  const normalized = normalizeForModeration(text);
  const compact = normalized.replace(/\s/g, '');
  return words.some((w) => {
    const word = normalizeForModeration(w);
    if (!word) return false;
    return normalized.includes(word) || compact.includes(word.replace(/\s/g, ''));
  });
}
