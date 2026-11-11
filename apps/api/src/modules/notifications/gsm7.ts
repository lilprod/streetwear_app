const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const EXTENDED = '^{}\\[~]|€';

const REPLACEMENTS: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '«': '"',
  '»': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  ' ': ' ',
  œ: 'oe',
  Œ: 'OE',
  ç: 'c',
};

const isGsm = (ch: string): boolean => BASIC.includes(ch) || EXTENDED.includes(ch);

/**
 * Ramène un texte au jeu GSM 03.38 : accents absents du jeu (ê, ç, â…) et typographie sont
 * simplifiés ; `null` si un caractère reste impossible (emoji, etc.).
 */
export function toGsm7(text: string): string | null {
  let out = '';
  for (const ch of text) {
    if (isGsm(ch)) {
      out += ch;
      continue;
    }
    const direct = REPLACEMENTS[ch];
    const base = direct ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const c of base) if (!isGsm(c)) return null;
    out += base;
  }
  return out;
}

/** Longueur en septets (les caractères étendus en comptent 2). */
export function gsm7Length(gsm: string): number {
  let n = 0;
  for (const ch of gsm) n += EXTENDED.includes(ch) ? 2 : 1;
  return n;
}

export const SMS_MAX_SEPTETS = 160;
