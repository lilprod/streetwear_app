/** Largeurs alternées barre/espace des 107 symboles Code 128 (0-102 données, 103-105 départ A/B/C, 106 arrêt). */
export const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const;

const START_B = 104;
const STOP = 106;

/** Valeurs des symboles Code 128 jeu B (ASCII 32-126) avec somme de contrôle. */
export function code128Values(text: string): number[] {
  const codes = [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error('Caractère non encodable en Code 128 B');
    return c - 32;
  });
  const checksum = codes.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...codes, checksum, STOP];
}

/** Séquence de modules (true = barre) du code-barres, zone de silence exclue. */
export function code128Modules(text: string): boolean[] {
  const modules: boolean[] = [];
  for (const value of code128Values(text)) {
    let bar = true;
    for (const width of CODE128_PATTERNS[value] ?? '') {
      for (let i = 0; i < Number(width); i++) modules.push(bar);
      bar = !bar;
    }
  }
  return modules;
}
