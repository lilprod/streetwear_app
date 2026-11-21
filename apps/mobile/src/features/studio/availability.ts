import type { Catalog } from './catalog';
import type { Content } from './model';

export type ItemKind = 'pattern' | 'font' | 'color';
export type InactiveItem = { kind: ItemKind; id: string };

export type Unavailable = { kind: ItemKind; id: string; layerId: string | null };

export type Availability = {
  /** Éléments désactivés au back-office : bloquent la suite. */
  unavailable: Unavailable[];
  /** Éléments absents d'un catalogue qui n'est peut-être plus à jour : à vérifier, sans blocage. */
  unverified: Unavailable[];
};

const KINDS: readonly string[] = ['pattern', 'font', 'color'];

/** Lit `details.items` d'une erreur `PATTERN_INACTIVE`. */
export function parseInactiveItems(details: unknown): InactiveItem[] {
  const items = (details as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((i: unknown) => {
    const { kind, id } = (i ?? {}) as { kind?: unknown; id?: unknown };
    return typeof kind === 'string' && KINDS.includes(kind) && typeof id === 'string'
      ? [{ kind: kind as ItemKind, id }]
      : [];
  });
}

export function checkAvailability(
  content: Content,
  catalog: Pick<Catalog, 'patterns' | 'fonts' | 'colors'>,
  options: { verified: boolean; flagged?: InactiveItem[] },
): Availability {
  const flagged = options.flagged ?? [];
  const isFlagged = (kind: ItemKind, id: string) =>
    flagged.some((f) => f.kind === kind && f.id === id);
  const patterns = new Set(catalog.patterns.map((p) => p.id));
  const fonts = new Set(catalog.fonts.map((f) => f.id));
  const colors = new Set(catalog.colors.map((c) => c.id));
  const out: Availability = { unavailable: [], unverified: [] };
  const add = (kind: ItemKind, id: string, layerId: string | null, known: boolean) => {
    const entry = { kind, id, layerId };
    if (isFlagged(kind, id) || (!known && options.verified)) out.unavailable.push(entry);
    else if (!known) out.unverified.push(entry);
  };
  for (const layer of [...content.front, ...content.back]) {
    if (layer.type === 'pattern') {
      add('pattern', layer.patternId, layer.id, patterns.has(layer.patternId));
    } else {
      add('font', layer.fontId, layer.id, fonts.has(layer.fontId));
    }
  }
  add('color', content.colorId, null, colors.has(content.colorId));
  return out;
}
