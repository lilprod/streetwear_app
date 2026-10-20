import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStore } from 'zustand';
import type { CanvasRef } from '@shopify/react-native-skia';
import { computeUnitPriceXof, containsBannedWord } from '@streetwear/shared';
import { t } from '../../i18n/fr';
import { colors, fonts } from '../../theme';
import { Amount, Banner, IconButton, Label, Segmented, StateView, Tabs } from '../../ui/controls';
import { patternsById as indexPatterns, type Catalog } from './catalog';
import { useCatalog, useDraftSync, useDraftsRepo, useOnline, type SyncStatus } from './hooks';
import {
  contentFromSpec,
  contentToSpec,
  emptyContent,
  layersOf,
  textLayerOf,
  type Side,
} from './model';
import { capturePreview } from './preview';
import { SHIRT_H_MM, SHIRT_W_MM } from './shirt';
import { StudioCanvas } from './StudioCanvas';
import { AdjustPanel, AdjustToggle, ColorPanel, PatternsPanel, TextPanel } from './StudioPanels';
import { studioStore } from './store';
import { useStudioFonts } from './useStudioFonts';

type PanelTab = 'patterns' | 'color' | 'text';
const SAVE_DELAY_MS = 400;
const PREVIEW_DELAY_MS = 1200;

export function StudioScreen({ draftId }: { draftId?: string }) {
  const { state, reload } = useCatalog();
  if (state.status === 'loading') return <StateView kind="loading" />;
  if (state.status === 'error') {
    return (
      <StateView
        kind={state.offline ? 'offline' : 'error'}
        message={state.offline ? t('studio.catalog.offline') : t('studio.catalog.error')}
        onRetry={reload}
      />
    );
  }
  return <StudioReady catalog={state.catalog} stale={state.stale} draftId={draftId} />;
}

const syncLabel: Record<SyncStatus, string> = {
  idle: '',
  pending: t('studio.sync.pending'),
  synced: t('studio.sync.synced'),
  offline: t('studio.sync.offline'),
  error: t('studio.sync.error'),
};

function StudioReady({
  catalog,
  stale,
  draftId,
}: {
  catalog: Catalog;
  stale: boolean;
  draftId?: string;
}) {
  const repo = useDraftsRepo();
  const online = useOnline();
  const sync = useDraftSync(repo);
  const skFonts = useStudioFonts();
  const { width, height } = useWindowDimensions();
  const canvasRef = useRef<CanvasRef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<PanelTab>('patterns');
  const [adjustOpen, setAdjustOpen] = useState(false);

  const content = useStore(studioStore, (s) => s.content);
  const side = useStore(studioStore, (s) => s.side);
  const selectedId = useStore(studioStore, (s) => s.selectedId);
  const canUndo = useStore(studioStore, (s) => s.past.length > 0);
  const canRedo = useStore(studioStore, (s) => s.future.length > 0);
  const actions = studioStore.getState();

  const patternsById = useMemo(() => indexPatterns(catalog.patterns), [catalog.patterns]);

  useEffect(() => {
    const s = studioStore.getState();
    s.setColors(catalog.colors);
    const id = draftId ?? repo.currentId();
    const rec = id ? repo.get(id) : null;
    if (rec) {
      s.load({
        content: contentFromSpec(rec.spec),
        localId: rec.localId,
        serverId: rec.serverId,
        name: rec.name,
      });
    } else {
      s.load({ content: emptyContent(catalog.colors[0]?.id ?? 'col-noir') });
    }
    if (draftId) repo.setCurrentId(draftId);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNow = useCallback(() => {
    const s = studioStore.getState();
    const spec = contentToSpec(s.content);
    if (spec) repo.save({ localId: s.localId, spec, name: s.name, serverId: s.serverId });
    return !!spec;
  }, [repo]);

  useEffect(() => {
    if (!loaded) return;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = studioStore.subscribe((s, prev) => {
      if (s.content === prev.content) return;
      if (saveTimer) clearTimeout(saveTimer);
      if (previewTimer) clearTimeout(previewTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        if (saveNow()) sync.trigger();
      }, SAVE_DELAY_MS);
      previewTimer = setTimeout(() => {
        previewTimer = null;
        const st = studioStore.getState();
        const png = capturePreview(canvasRef.current);
        if (png && repo.get(st.localId)) {
          repo.setPreview(st.localId, st.side, png);
          sync.trigger();
        }
      }, PREVIEW_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveNow();
      }
      if (previewTimer) clearTimeout(previewTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const spec = useMemo(() => contentToSpec(content), [content]);
  const price = useMemo(() => {
    try {
      return spec
        ? computeUnitPriceXof(spec, catalog.pricing, patternsById)
        : catalog.pricing.baseXof;
    } catch {
      return null;
    }
  }, [spec, catalog.pricing, patternsById]);

  const text = textLayerOf(content);
  const banned = !!text && containsBannedWord(text.text, catalog.bannedWords);
  const color = catalog.colors.find((c) => c.id === content.colorId);
  const hasSelection = !!selectedId;

  const canvasWidth = Math.max(
    220,
    Math.min(width - 40, ((height - 420) * SHIRT_W_MM) / SHIRT_H_MM),
  );

  const onSide = useCallback((v: Side) => studioStore.getState().setSide(v), []);

  if (!loaded) return <StateView kind="loading" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton glyph="‹" label={t('common.back')} onPress={() => router.back()} />
        <Label style={styles.title}>{t('studio.title')}</Label>
        <IconButton glyph="↶" label={t('studio.undo')} disabled={!canUndo} onPress={actions.undo} />
        <IconButton glyph="↷" label={t('studio.redo')} disabled={!canRedo} onPress={actions.redo} />
        <IconButton
          glyph="☰"
          label={t('studio.myDesigns')}
          onPress={() => router.push('/designs')}
        />
      </View>
      {!online ? <Banner tone="info" text={t('studio.banner.offline')} /> : null}
      {stale && online ? <Banner tone="info" text={t('studio.banner.stale')} /> : null}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.segmentedWrap}>
          <Segmented
            label={t('studio.side.label')}
            value={side}
            onChange={onSide}
            options={[
              { value: 'front', label: t('studio.side.front') },
              { value: 'back', label: t('studio.side.back') },
            ]}
          />
        </View>
        <View style={styles.canvasWrap}>
          <StudioCanvas
            width={canvasWidth}
            side={side}
            content={content}
            colors={catalog.colors}
            patternsById={patternsById}
            fonts={catalog.fonts}
            skFonts={skFonts}
            selectedId={selectedId}
            canvasRef={canvasRef}
            onSelect={actions.select}
            onGestureStart={actions.beginGesture}
            onGestureCommit={actions.commitGesture}
            label={t(
              layersOf(content, side).length === 0 ? 'studio.canvas.empty' : 'studio.canvas.label',
            )}
          />
        </View>
        {hasSelection ? (
          <View style={styles.adjustWrap}>
            <AdjustToggle open={adjustOpen} onToggle={() => setAdjustOpen((v) => !v)} />
            {adjustOpen ? <AdjustPanel actions={actions} /> : null}
          </View>
        ) : null}
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'patterns', label: t('studio.tab.patterns') },
            { value: 'color', label: t('studio.tab.color') },
            { value: 'text', label: t('studio.tab.text') },
          ]}
        />
        {tab === 'patterns' ? (
          <PatternsPanel
            categories={catalog.categories}
            patterns={catalog.patterns}
            content={content}
            side={side}
            actions={actions}
          />
        ) : null}
        {tab === 'color' ? (
          <ColorPanel
            colors={catalog.colors}
            colorId={content.colorId}
            onPick={actions.chooseColor}
          />
        ) : null}
        {tab === 'text' ? (
          <TextPanel
            content={content}
            side={side}
            fonts={catalog.fonts}
            color={color}
            banned={banned}
            actions={actions}
          />
        ) : null}
      </ScrollView>
      <View style={styles.bottom}>
        <View style={styles.priceBox}>
          <Label style={styles.priceLabel}>{t('studio.price.label')}</Label>
          {price === null ? (
            <Label>{t('studio.price.unavailable')}</Label>
          ) : (
            <Amount xof={price} style={styles.price} />
          )}
        </View>
        <Label style={styles.sync}>
          {banned ? t('studio.text.banned') : syncLabel[sync.status]}
        </Label>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { paddingBottom: 16 },
  segmentedWrap: { paddingHorizontal: 20, paddingVertical: 8 },
  canvasWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: 20,
    borderRadius: 24,
    paddingVertical: 8,
  },
  adjustWrap: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-start' },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  priceBox: { gap: 2 },
  priceLabel: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  price: { fontSize: 20, lineHeight: 26 },
  sync: { color: colors.inkSecondary, fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
