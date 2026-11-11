import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  SIZES,
  computeCartTotals,
  computeUnitPriceXof,
  type Size,
} from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError } from '../../api/types';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts, radius } from '../../theme';
import { Banner, Label, PrimaryButton, StateView } from '../../ui/controls';
import {
  BottomBar,
  PriceRow,
  ScreenHeader,
  SizePicker,
  SkeletonScreen,
  Stepper,
} from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { addLine } from '../cart/store';
import { patternsById } from '../studio/catalog';
import { useCatalog, useDraftsRepo } from '../studio/hooks';

type Availability = { status: 'loading' | 'ready' | 'unverified'; sizes: Map<Size, boolean> };

export function useSizeAvailability(colorId: string | null): Availability & { reload: () => void } {
  const [state, setState] = useState<Availability>({ status: 'loading', sizes: new Map() });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!colorId) return;
    let alive = true;
    getApi()
      .getAvailability(colorId)
      .then(
        (res) =>
          alive &&
          setState({
            status: 'ready',
            sizes: new Map(res.sizes.map((s) => [s.size, s.available])),
          }),
        () => alive && setState({ status: 'unverified', sizes: new Map() }),
      );
    return () => {
      alive = false;
    };
  }, [colorId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}

export function SizeScreen() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const { state, reload } = useCatalog();
  const repo = useDraftsRepo();
  const rec = useMemo(() => (draft ? repo.get(draft) : null), [draft, repo]);
  const availability = useSizeAvailability(rec?.spec.colorId ?? null);

  const [size, setSize] = useState<Size | null>(null);
  const [quantity, setQuantity] = useState(CART_LINE_MIN_QUANTITY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));

  const price = useMemo(() => {
    if (!rec || state.status !== 'ready') return null;
    try {
      return computeUnitPriceXof(
        rec.spec,
        state.catalog.pricing,
        patternsById(state.catalog.patterns),
      );
    } catch {
      return null;
    }
  }, [rec, state]);

  const sizes = SIZES.map((s) => ({ size: s, available: availability.sizes.get(s) ?? true }));
  const selectedGone = size !== null && availability.sizes.get(size) === false;

  const onAdd = async () => {
    if (!rec || !size || price === null || state.status !== 'ready' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const color = state.catalog.colors.find((c) => c.id === rec.spec.colorId);
      await addLine({
        draftLocalId: rec.localId,
        name: rec.name,
        colorHex: color?.hex ?? colors.surfaceMuted,
        size,
        quantity,
        unitPriceXof: price,
      });
      router.push('/purchase/cart');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OUT_OF_STOCK') {
        setError(t('purchase.size.error.stock'));
        availability.reload();
      } else {
        setError(t('purchase.size.error.add'));
      }
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (!draft || !rec) {
    content = <StateView kind="error" message={t('purchase.size.error.noDraft')} />;
  } else if (state.status === 'loading') {
    content = <SkeletonScreen />;
  } else if (state.status === 'error') {
    content = (
      <StateView
        kind={state.offline ? 'offline' : 'error'}
        message={t('purchase.size.error.load')}
        onRetry={reload}
      />
    );
  } else {
    const total =
      price === null ? null : computeCartTotals([{ unitPriceXof: price, quantity }], 0).subtotalXof;
    const preview = rec.previewFront ? `data:image/png;base64,${rec.previewFront}` : null;
    content = (
      <>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.preview}>
            {preview ? (
              <Image
                source={{ uri: preview }}
                accessibilityLabel={t('cart.line.preview', {
                  name: rec.name ?? t('cart.line.unnamed'),
                })}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <Label style={styles.previewName}>{rec.name ?? t('cart.line.unnamed')}</Label>
            )}
          </View>
          {availability.status === 'unverified' ? (
            <Banner tone="info" text={t('purchase.size.availability.stale')} />
          ) : null}
          <Label accessibilityRole="header" style={styles.section}>
            {t('purchase.size.sizes')}
          </Label>
          <SizePicker sizes={sizes} value={size} onChange={setSize} />
          {selectedGone ? <Banner tone="danger" text={t('purchase.size.error.stock')} /> : null}
          <Label accessibilityRole="header" style={styles.section}>
            {t('purchase.size.quantity')}
          </Label>
          <Stepper
            value={quantity}
            min={CART_LINE_MIN_QUANTITY}
            max={CART_LINE_MAX_QUANTITY}
            onChange={setQuantity}
            decrementLabel={t('purchase.size.quantity.less')}
            incrementLabel={t('purchase.size.quantity.more')}
            valueLabel={t('purchase.size.quantity.value', { n: quantity })}
          />
          {quantity >= CART_LINE_MAX_QUANTITY ? (
            <Label style={styles.hint}>
              {t('purchase.size.quantity.max', { max: CART_LINE_MAX_QUANTITY })}
            </Label>
          ) : null}
          <View style={styles.prices}>
            {price !== null ? <PriceRow label={t('purchase.size.unit')} xof={price} /> : null}
            {total !== null ? (
              <PriceRow strong label={t('purchase.size.total')} xof={total} />
            ) : null}
          </View>
        </ScrollView>
        <BottomBar>
          {error ? <Banner tone="danger" text={error} /> : null}
          {size === null ? <Label style={styles.hint}>{t('purchase.size.pickFirst')}</Label> : null}
          <PrimaryButton
            label={t('purchase.size.add')}
            disabled={size === null || selectedGone || price === null}
            loading={busy}
            onPress={() => void onAdd()}
          />
        </BottomBar>
      </>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('purchase.size.title')} onBack={back} />
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 16 },
  preview: {
    height: 180,
    borderRadius: radius.preview,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  previewName: { fontFamily: fonts.semibold, fontSize: 20 },
  section: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  hint: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  prices: { gap: 2, paddingTop: 8 },
});
