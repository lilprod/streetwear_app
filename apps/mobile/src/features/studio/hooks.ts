import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { getApi } from '../../api';
import { getStorage } from '../../storage';
import { loadCatalog, type Catalog } from './catalog';
import { createDraftsRepo, type DraftsRepo } from './drafts';
import { syncDrafts } from './sync';

export const useDraftsRepo = (): DraftsRepo => useMemo(() => createDraftsRepo(getStorage()), []);

export function useOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; offline: boolean }
  | { status: 'ready'; catalog: Catalog; stale: boolean };

export function useCatalog(): { state: CatalogState; reload: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  useEffect(() => {
    let alive = true;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    loadCatalog(getApi(), getStorage()).then(
      ({ catalog, fromCache }) => alive && setState({ status: 'ready', catalog, stale: fromCache }),
      () => alive && setState({ status: 'error', offline: !online }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}

export type SyncStatus = 'idle' | 'pending' | 'synced' | 'offline' | 'error';

/** Synchronise les brouillons au montage, au retour du réseau et sur demande. */
export function useDraftSync(repo: DraftsRepo): { status: SyncStatus; trigger: () => void } {
  const online = useOnline();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (repo.pending().length === 0) {
      setStatus('synced');
      return;
    }
    setStatus('pending');
    const res = await syncDrafts(getApi(), repo);
    setStatus(res.offline ? 'offline' : res.failed > 0 ? 'error' : 'synced');
  }, [repo]);

  const trigger = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!online) {
      setStatus('offline');
      return;
    }
    timer.current = setTimeout(() => void run(), 1500);
  }, [online, run]);

  useEffect(() => {
    if (online) void run();
    else setStatus('offline');
  }, [online, run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { status, trigger };
}
