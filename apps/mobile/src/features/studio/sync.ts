import type { ApiClient } from '../../api/types';
import { ApiError } from '../../api/types';
import type { DraftRecord, DraftsRepo } from './drafts';

export const PREVIEW_MAX_BASE64_CHARS = Math.ceil((500 * 1024 * 4) / 3);

export type SyncResult = { synced: number; failed: number; offline: boolean };

let inFlight: Promise<SyncResult> | null = null;

async function syncOne(api: ApiClient, repo: DraftsRepo, snapshot: DraftRecord): Promise<void> {
  let serverId = snapshot.serverId;
  if (snapshot.dirty) {
    const design = serverId
      ? await api.updateDesign(serverId, { spec: snapshot.spec, isDraft: true })
      : await api.createDesign({ spec: snapshot.spec });
    serverId = design.id;
    repo.update(snapshot.localId, (r) => ({
      ...r,
      serverId: design.id,
      dirty: r.updatedAt !== snapshot.updatedAt,
      syncError: null,
    }));
  }
  const fresh = repo.get(snapshot.localId) ?? snapshot;
  if (!serverId) return;
  const front =
    fresh.previewFrontDirty &&
    fresh.previewFront &&
    fresh.previewFront.length <= PREVIEW_MAX_BASE64_CHARS
      ? fresh.previewFront
      : undefined;
  const back =
    fresh.previewBackDirty &&
    fresh.previewBack &&
    fresh.previewBack.length <= PREVIEW_MAX_BASE64_CHARS
      ? fresh.previewBack
      : undefined;
  if (front || back) {
    await api.uploadPreviews(serverId, { ...(front ? { front } : {}), ...(back ? { back } : {}) });
    repo.update(snapshot.localId, (r) => ({
      ...r,
      previewFrontDirty: front && r.previewFront === front ? false : r.previewFrontDirty,
      previewBackDirty: back && r.previewBack === back ? false : r.previewBackDirty,
    }));
  } else if (fresh.previewFrontDirty || fresh.previewBackDirty) {
    repo.update(snapshot.localId, (r) => ({
      ...r,
      previewFrontDirty: false,
      previewBackDirty: false,
    }));
  }
}

export function syncDrafts(api: ApiClient, repo: DraftsRepo): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result: SyncResult = { synced: 0, failed: 0, offline: false };
    for (const rec of repo.pending()) {
      try {
        await syncOne(api, repo, rec);
        result.synced += 1;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          result.offline = true;
          break;
        }
        result.failed += 1;
        const code = e instanceof ApiError ? e.code : 'SERVICE_UNAVAILABLE';
        repo.update(rec.localId, (r) => ({ ...r, syncError: code }));
      }
    }
    return result;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
