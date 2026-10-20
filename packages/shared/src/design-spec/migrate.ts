import { DesignSpecV1Schema, type DesignSpec } from './schema';

export const CURRENT_DESIGN_SPEC_VERSION = 1;

/** Convertit un design de n'importe quelle version connue vers la version courante (v1 -> v1). */
export function migrateSpec(input: unknown): DesignSpec {
  const version = (input as { version?: unknown } | null)?.version;
  switch (version) {
    case 1:
      return DesignSpecV1Schema.parse(input);
    default:
      throw new Error(`Version de design non prise en charge : ${String(version)}.`);
  }
}
