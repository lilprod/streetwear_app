import { useCallback } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  computeVatIncludedXof,
} from '@streetwear/shared';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts, radius } from '../../theme';
import { Amount, Banner, IconButton, Label, PrimaryButton, StateView } from '../../ui/controls';
import { BottomBar, PriceRow, ScreenHeader, SkeletonScreen, Stepper } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { useSession } from '../../auth/session';
import { changeQuantity, loadCart, removeLine, useCart } from './store';
import type { CartLineView } from './purchase';

export function CartScreen() {
  const status = useCart((s) => s.status);
  const offline = useCart((s) => s.offline);
  const view = useCart((s) => s.view);
  const busyId = useCart((s) => s.busyId);
  const actionFailed = useCart((s) => s.actionFailed);
  const mergeFailed = useCart((s) => s.mergeFailed);
  const sessionStatus = useSession((s) => s.status);

  useFocusEffect(
    useCallback(() => {
      if (sessionStatus !== 'booting') void loadCart();
    }, [sessionStatus]),
  );

  const blocked = view.lines.some((l) => !l.available);
  const authed = sessionStatus === 'authenticated';
  const next = () => router.push(authed ? '/purchase/reception' : '/purchase/login?next=reception');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));

  let content;
  if (status === 'idle' || status === 'loading') {
    content = <SkeletonScreen />;
  } else if (status === 'error') {
    content = (
      <StateView
        kind={offline ? 'offline' : 'error'}
        message={t('cart.error.load')}
        onRetry={() => void loadCart()}
      />
    );
  } else if (view.lines.length === 0) {
    content = (
      <StateView kind="empty" title={t('cart.empty.title')} message={t('cart.empty.message')} />
    );
  } else {
    content = (
      <>
        <ScrollView contentContainerStyle={styles.body}>
          {mergeFailed ? <Banner tone="danger" text={t('cart.merge.error')} /> : null}
          {actionFailed ? <Banner tone="danger" text={t('cart.error.action')} /> : null}
          {view.lines.map((line) => (
            <Line key={line.id} line={line} busy={busyId === line.id} />
          ))}
        </ScrollView>
        <BottomBar>
          <PriceRow label={t('cart.subtotal')} xof={view.subtotalXof} strong />
          <PriceRow label={t('cart.vat')} xof={computeVatIncludedXof(view.subtotalXof)} />
          <PriceRow label={t('cart.delivery')} note={t('cart.delivery.later')} />
          {blocked ? <Banner tone="danger" text={t('cart.blocked')} /> : null}
          {authed ? null : <Label style={styles.hint}>{t('cart.guest.hint')}</Label>}
          <PrimaryButton label={t('cart.continue')} disabled={blocked} onPress={next} />
        </BottomBar>
      </>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('cart.title')} onBack={back} />
      {content}
      {status === 'ready' && view.lines.length === 0 ? (
        <View style={styles.cta}>
          <PrimaryButton label={t('cart.empty.cta')} onPress={() => router.navigate('/studio')} />
        </View>
      ) : null}
    </Screen>
  );
}

function Line({ line, busy }: { line: CartLineView; busy: boolean }) {
  const name = line.name ?? t('cart.line.unnamed');
  return (
    <View style={[styles.line, !line.available && styles.lineOff]}>
      <View style={styles.lineTop}>
        {line.previewUrl ? (
          <Image
            source={{ uri: line.previewUrl }}
            accessibilityLabel={t('cart.line.preview', { name })}
            style={styles.thumb}
          />
        ) : (
          <View
            importantForAccessibility="no"
            style={[styles.thumb, { backgroundColor: line.colorHex ?? colors.surfaceMuted }]}
          />
        )}
        <View style={styles.lineInfo}>
          <Label style={styles.lineName}>{name}</Label>
          <Label style={styles.lineSize}>{t('cart.line.size', { size: line.size })}</Label>
          <Amount xof={line.lineTotalXof} />
        </View>
        <IconButton
          glyph="✕"
          label={t('cart.line.remove', { name })}
          disabled={busy}
          onPress={() => void removeLine(line.id)}
        />
      </View>
      {!line.available ? <Banner tone="danger" text={t('cart.line.unavailable')} /> : null}
      <Stepper
        value={line.quantity}
        min={CART_LINE_MIN_QUANTITY}
        max={CART_LINE_MAX_QUANTITY}
        disabled={busy}
        onChange={(n) => void changeQuantity(line.id, n)}
        decrementLabel={t('purchase.size.quantity.less')}
        incrementLabel={t('purchase.size.quantity.more')}
        valueLabel={t('purchase.size.quantity.value', { n: line.quantity })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 12 },
  line: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 12,
  },
  lineOff: { borderColor: colors.danger },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.field,
    backgroundColor: colors.surfaceMuted,
  },
  lineInfo: { flex: 1 },
  lineName: { fontFamily: fonts.semibold },
  lineSize: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  hint: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  cta: { padding: SCREEN_MARGIN },
});
