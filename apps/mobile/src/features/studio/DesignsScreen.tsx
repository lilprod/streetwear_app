import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { computeUnitPriceXof, formatLome, type Design } from '@streetwear/shared';
import { getApi } from '../../api';
import { t } from '../../i18n/fr';
import { getStorage } from '../../storage';
import { MIN_TARGET, colors, fonts, radius } from '../../theme';
import { Amount, Banner, IconButton, Label, PrimaryButton, StateView } from '../../ui/controls';
import { loadCatalog, patternsById, type Catalog } from './catalog';
import type { DraftRecord } from './drafts';
import { useDraftsRepo, useOnline } from './hooks';

type Row = {
  key: string;
  localId: string | null;
  serverId: string | null;
  name: string | null;
  updatedAt: string;
  previewUri: string | null;
  priceXof: number | null;
  pendingSync: boolean;
};

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: Row[]; serverReached: boolean };

const localPrice = (spec: DraftRecord['spec'], catalog: Catalog | null): number | null => {
  if (!catalog) return null;
  try {
    return computeUnitPriceXof(spec, catalog.pricing, patternsById(catalog.patterns));
  } catch {
    return null;
  }
};

export function DesignsScreen() {
  const repo = useDraftsRepo();
  const online = useOnline();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const locals = repo.list();
      let catalog: Catalog | null = null;
      try {
        catalog = (await loadCatalog(api, getStorage())).catalog;
      } catch {
        catalog = null;
      }
      let remote: Design[] = [];
      let serverReached = false;
      try {
        remote = (await api.listDesigns({ drafts: true })).items;
        serverReached = true;
      } catch {
        serverReached = false;
      }
      if (!alive) return;
      if (locals.length === 0 && !serverReached) {
        setLoad({ status: 'error' });
        return;
      }
      const linked = new Set(locals.map((l) => l.serverId).filter(Boolean));
      const rows: Row[] = [
        ...locals.map((l) => ({
          key: l.localId,
          localId: l.localId,
          serverId: l.serverId,
          name: l.name,
          updatedAt: l.updatedAt,
          previewUri: l.previewFront ? `data:image/png;base64,${l.previewFront}` : null,
          priceXof: localPrice(l.spec, catalog),
          pendingSync: l.dirty,
        })),
        ...remote
          .filter((d) => !linked.has(d.id))
          .map((d) => ({
            key: d.id,
            localId: null,
            serverId: d.id,
            name: d.name,
            updatedAt: d.updatedAt,
            previewUri: d.previewFrontUrl,
            priceXof: d.unitPriceXof,
            pendingSync: false,
          })),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setLoad({ status: 'ready', rows, serverReached });
    })();
    return () => {
      alive = false;
    };
  }, [repo, attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const open = useCallback(
    async (row: Row) => {
      let localId = row.localId;
      if (!localId) {
        try {
          const d = await getApi().listDesigns({ drafts: true });
          const found = d.items.find((x) => x.id === row.serverId);
          if (!found) return;
          const rec = repo.save({
            localId: found.id,
            spec: found.spec,
            name: found.name,
            serverId: found.id,
          });
          repo.update(rec.localId, (r) => ({ ...r, dirty: false }));
          localId = rec.localId;
        } catch {
          setDeleteError(true);
          return;
        }
      }
      router.push({ pathname: '/studio', params: { draft: localId } });
    },
    [repo],
  );

  const remove = useCallback(
    async (row: Row) => {
      setDeleteError(false);
      try {
        if (row.serverId) await getApi().deleteDesign(row.serverId);
        if (row.localId) repo.remove(row.localId);
        retry();
      } catch {
        setDeleteError(true);
      }
    },
    [repo, retry],
  );

  const rows = useMemo(() => (load.status === 'ready' ? load.rows : []), [load]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton glyph="‹" label={t('common.back')} onPress={() => router.back()} />
        <Label style={styles.title}>{t('designs.title')}</Label>
      </View>
      {!online ? <Banner tone="info" text={t('designs.banner.offline')} /> : null}
      {deleteError ? <Banner tone="danger" text={t('designs.error.action')} /> : null}
      {load.status === 'loading' ? <StateView kind="loading" /> : null}
      {load.status === 'error' ? (
        <StateView
          kind={online ? 'error' : 'offline'}
          message={t('designs.error.load')}
          onRetry={retry}
        />
      ) : null}
      {load.status === 'ready' && rows.length === 0 ? (
        <View style={styles.empty}>
          <StateView
            kind="empty"
            title={t('designs.empty.title')}
            message={t('designs.empty.message')}
          />
          <PrimaryButton label={t('designs.empty.cta')} onPress={() => router.push('/studio')} />
        </View>
      ) : null}
      {load.status === 'ready' && rows.length > 0 ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('designs.open', { name: item.name ?? t('designs.unnamed') })}
                onPress={() => void open(item)}
                style={styles.cardMain}
              >
                {item.previewUri ? (
                  <Image
                    source={{ uri: item.previewUri }}
                    accessibilityIgnoresInvertColors
                    style={styles.thumb}
                  />
                ) : (
                  <View style={styles.thumb} />
                )}
                <View style={styles.cardText}>
                  <Label style={styles.name} numberOfLines={1}>
                    {item.name ?? t('designs.unnamed')}
                  </Label>
                  <Label style={styles.meta}>{formatLome(item.updatedAt, 'datetime')}</Label>
                  {item.priceXof !== null ? <Amount xof={item.priceXof} /> : null}
                  {item.pendingSync ? (
                    <Label style={styles.meta}>{t('designs.pending')}</Label>
                  ) : null}
                </View>
              </Pressable>
              <IconButton glyph="✕" label={t('designs.delete')} onPress={() => void remove(item)} />
            </View>
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  list: { padding: 20, gap: 12 },
  empty: { flex: 1, padding: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingRight: 4,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    minHeight: MIN_TARGET,
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: radius.field,
    backgroundColor: colors.surfaceMuted,
  },
  cardText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold },
  meta: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
});
