export type LomeStyle = 'date' | 'time' | 'datetime' | 'long';

const TZ = 'Africa/Lome';
const numeric = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const longDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Affiche une date UTC en heure d'Africa/Lome : `23/11/2026`, `14:02`, `23/11/2026 14:02`, `23 novembre 2026`. */
export function formatLome(input: Date | string, style: LomeStyle = 'datetime'): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) throw new RangeError('Date invalide.');
  if (style === 'long') return longDate.format(date);
  const parts = Object.fromEntries(numeric.formatToParts(date).map((p) => [p.type, p.value]));
  const d = `${parts.day}/${parts.month}/${parts.year}`;
  const t = `${parts.hour}:${parts.minute}`;
  return style === 'date' ? d : style === 'time' ? t : `${d} ${t}`;
}
