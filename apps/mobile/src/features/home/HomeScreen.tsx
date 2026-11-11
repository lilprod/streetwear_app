import { useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { formatLome } from '@streetwear/shared';
import { t } from '../../i18n/fr';
import { MIN_TARGET, SCREEN_MARGIN, colors, fonts, radius } from '../../theme';
import { Label, PrimaryButton, SecondaryButton, StateView } from '../../ui/controls';
import { PatternTile, Skeleton } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { Pressable } from 'react-native';
import { useCatalog, useDraftsRepo } from '../studio/hooks';
import type { DraftRecord } from '../studio/drafts';

const FEATURED_COUNT = 12;

export function HomeScreen() {
  const { state, reload } = useCatalog();
  const repo = useDraftsRepo();
  const [lastDraft, setLastDraft] = useState<DraftRecord | null>(null);
  useFocusEffect(
    useCallback(() => {
      setLastDraft(repo.list()[0] ?? null);
    }, [repo]),
  );
  const featured = useMemo(
    () =>
      state.status === 'ready'
        ? [...state.catalog.patterns]
            .sort((a, b) => Number(b.priceTier === 'premium') - Number(a.priceTier === 'premium'))
            .slice(0, FEATURED_COUNT)
        : [],
    [state],
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Label accessibilityRole="header" style={styles.title}>
          {t('home.greeting')}
        </Label>
        <PrimaryButton label={t('home.createDesign')} onPress={() => router.navigate('/studio')} />

        {lastDraft ? <ResumeCard draft={lastDraft} /> : null}

        <Label accessibilityRole="header" style={styles.section}>
          {t('home.collection.title')}
        </Label>
        {state.status === 'loading' ? (
          <View style={styles.row}>
            <Skeleton style={styles.skeletonTile} />
            <Skeleton style={styles.skeletonTile} />
          </View>
        ) : null}
        {state.status === 'error' ? (
          <View style={styles.stateBox}>
            <StateView
              kind={state.offline ? 'offline' : 'error'}
              message={state.offline ? t('home.collection.offline') : t('home.collection.error')}
              onRetry={reload}
            />
          </View>
        ) : null}
        {state.status === 'ready' && featured.length === 0 ? (
          <StateView kind="empty" message={t('home.collection.empty')} />
        ) : null}
        {state.status === 'ready' && featured.length > 0 ? (
          <FlatList
            horizontal
            data={featured}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={Gap}
            renderItem={({ item }) => (
              <PatternTile
                name={item.name}
                imageUrl={item.thumbnailUrl}
                badge={item.priceTier === 'premium' ? t('home.pattern.premium') : undefined}
                label={t('home.pattern.open', { name: item.name, origin: item.origin })}
                onPress={() => router.navigate('/studio')}
              />
            )}
          />
        ) : null}

        <SecondaryButton label={t('home.myDesigns')} onPress={() => router.push('/designs')} />
      </ScrollView>
    </Screen>
  );
}

const Gap = () => <View style={styles.gap} />;

function ResumeCard({ draft }: { draft: DraftRecord }) {
  const name = draft.name ?? t('home.resume.unnamed');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.resume.open', { name })}
      onPress={() => router.navigate({ pathname: '/studio', params: { draft: draft.localId } })}
      style={styles.card}
    >
      <View style={styles.cardText}>
        <Label style={styles.cardTitle}>{t('home.resume.title')}</Label>
        <Label style={styles.cardMeta}>{`${name} · ${formatLome(draft.updatedAt, 'date')}`}</Label>
      </View>
      <Label style={styles.cardCta}>{t('home.resume.cta')}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 20 },
  title: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.85 },
  section: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  row: { flexDirection: 'row', gap: 12 },
  skeletonTile: { width: 132, height: 160 },
  stateBox: { minHeight: 160 },
  list: { paddingRight: SCREEN_MARGIN },
  gap: { width: 12 },
  card: {
    minHeight: MIN_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
  },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.semibold },
  cardMeta: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  cardCta: { color: colors.link, fontFamily: fonts.semibold },
});
