import { validateDesignSpec, type DesignSpec } from '@streetwear/shared';
import type { KeyValueStorage } from '../../storage/storage';
import type { Side } from './model';

export type DraftRecord = {
  localId: string;
  serverId: string | null;
  name: string | null;
  spec: DesignSpec;
  updatedAt: string;
  dirty: boolean;
  previewFront: string | null;
  previewBack: string | null;
  previewFrontDirty: boolean;
  previewBackDirty: boolean;
  syncError: string | null;
};

const PREFIX = 'draft:';
const CURRENT_KEY = 'studio:current';

export type DraftsRepo = ReturnType<typeof createDraftsRepo>;

export function createDraftsRepo(storage: KeyValueStorage, now: () => Date = () => new Date()) {
  const read = (localId: string): DraftRecord | null => {
    const raw = storage.getString(PREFIX + localId);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as DraftRecord;
      const check = validateDesignSpec(rec.spec);
      return check.ok ? { ...rec, spec: check.spec } : null;
    } catch {
      return null;
    }
  };
  const write = (rec: DraftRecord) => storage.set(PREFIX + rec.localId, JSON.stringify(rec));

  return {
    get: read,

    save(input: {
      localId: string;
      spec: DesignSpec;
      name?: string | null;
      serverId?: string | null;
    }) {
      const prev = read(input.localId);
      const rec: DraftRecord = {
        localId: input.localId,
        serverId: input.serverId ?? prev?.serverId ?? null,
        name: input.name ?? prev?.name ?? null,
        spec: input.spec,
        updatedAt: now().toISOString(),
        dirty: true,
        previewFront: prev?.previewFront ?? null,
        previewBack: prev?.previewBack ?? null,
        previewFrontDirty: prev?.previewFrontDirty ?? false,
        previewBackDirty: prev?.previewBackDirty ?? false,
        syncError: null,
      };
      write(rec);
      storage.set(CURRENT_KEY, rec.localId);
      return rec;
    },

    setPreview(localId: string, side: Side, base64: string) {
      const rec = read(localId);
      if (!rec) return;
      write(
        side === 'front'
          ? { ...rec, previewFront: base64, previewFrontDirty: true }
          : { ...rec, previewBack: base64, previewBackDirty: true },
      );
    },

    update(localId: string, fn: (rec: DraftRecord) => DraftRecord) {
      const rec = read(localId);
      if (rec) write(fn(rec));
    },

    remove(localId: string) {
      storage.remove(PREFIX + localId);
      if (storage.getString(CURRENT_KEY) === localId) storage.remove(CURRENT_KEY);
    },

    list(): DraftRecord[] {
      return storage
        .keys()
        .filter((k) => k.startsWith(PREFIX))
        .map((k) => read(k.slice(PREFIX.length)))
        .filter((r): r is DraftRecord => r !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    pending(): DraftRecord[] {
      return this.list().filter(
        (r) =>
          (r.dirty && r.syncError !== 'TEXT_REJECTED') || r.previewFrontDirty || r.previewBackDirty,
      );
    },

    currentId: () => storage.getString(CURRENT_KEY) ?? null,
    setCurrentId: (id: string | null) =>
      id ? storage.set(CURRENT_KEY, id) : storage.remove(CURRENT_KEY),
  };
}
