import { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ORDER_STATUS_LABELS_FR, formatLome, formatTgPhone, type Order } from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError } from '../../api/types';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts } from '../../theme';
import {
  Amount,
  Banner,
  Label,
  PrimaryButton,
  SecondaryButton,
  StateView,
} from '../../ui/controls';
import {
  PriceRow,
  ScreenHeader,
  SkeletonScreen,
  StatusBadge,
  Timeline,
  timelineSteps,
} from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { getStorage } from '../../storage';
import { codeFor, formatCode } from '../notifications/codes';
import { promptAfterFirstOrder } from '../notifications/push';
import { loadCart } from '../cart/store';
import { checkoutStore, resetCheckout } from '../reception/store';
import {
  brandWhatsapp,
  hasReceipt,
  isFinal,
  needsPayment,
  openReceipt,
  whatsappUrl,
} from './helpers';

const REFRESH_MS = 30_000;
const ACTIVE_ESTIMATE: readonly Order['status'][] = [
  'pending_payment',
  'paid',
  'deposit_paid',
  'in_production',
  'ready',
  'shipped',
  'ready_for_pickup',
];

type State =
  { status: 'loading' } | { status: 'error'; offline: boolean } | { status: 'ready'; order: Order };

export function OrderScreen({ variant }: { variant: 'tracking' | 'confirmation' }) {
  const params = useLocalSearchParams<{ id?: string; orderId?: string }>();
  const id = params.id ?? params.orderId;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'receipt' | 'reorder' | null>(null);
  const estimate = variant === 'confirmation' ? checkoutStore.getState().quote : null;

  const load = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
      try {
        setState({ status: 'ready', order: await getApi().getOrder(id) });
      } catch (e) {
        setState((s) =>
          silent && s.status === 'ready'
            ? s
            : { status: 'error', offline: e instanceof ApiError && e.isNetwork },
        );
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const order = state.status === 'ready' ? state.order : null;
  const live = !!order && !isFinal(order.status);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(true), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void load(true));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [live, load]);

  useEffect(() => {
    if (variant !== 'confirmation') return;
    void promptAfterFirstOrder();
    void loadCart();
    return () => resetCheckout();
  }, [variant]);

  const back = () => {
    if (variant === 'confirmation') router.replace('/');
    else if (router.canGoBack()) router.back();
    else router.replace('/orders');
  };

  const title = variant === 'confirmation' ? t('confirmation.title') : t('order.title');
  if (state.status === 'loading' || !id) {
    return (
      <Screen>
        <ScreenHeader title={title} onBack={back} />
        <SkeletonScreen />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <ScreenHeader title={title} onBack={back} />
        <StateView
          kind={state.offline ? 'offline' : 'error'}
          message={t('order.error')}
          onRetry={() => void load()}
        />
      </Screen>
    );
  }
  const o = state.order;
  const whatsapp = brandWhatsapp();
  const paid = hasReceipt(o.status);

  const receipt = async () => {
    setBusy('receipt');
    setNotice(null);
    try {
      await openReceipt(getApi(), o);
    } catch {
      setNotice(t('order.receipt.error'));
    } finally {
      setBusy(null);
    }
  };
  const reorder = async () => {
    setBusy('reorder');
    setNotice(null);
    try {
      await getApi().reorder(o.id);
      await loadCart();
      router.push('/purchase/cart');
    } catch {
      setNotice(t('order.reorder.error'));
    } finally {
      setBusy(null);
    }
  };
  const contact = () => {
    if (!whatsapp) return;
    Linking.openURL(whatsappUrl(whatsapp, t('order.contact.message', { number: o.number }))).catch(
      () => setNotice(t('order.contact.error')),
    );
  };

  const code = codeFor(getStorage(), o.id, o.status);
  const codeTitle = o.status === 'shipped' ? t('order.code.handover') : t('order.code.pickup');
  const estimated = ACTIVE_ESTIMATE.includes(o.status)
    ? (o.estimatedDeliveryAt ??
      o.estimatedReadyAt ??
      (estimate ? (estimate.estimatedDeliveryAt ?? estimate.estimatedReadyAt) : null))
    : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={title} onBack={back} />
      <ScrollView contentContainerStyle={styles.body}>
        {notice ? <Banner tone="danger" text={notice} /> : null}
        <View style={styles.head}>
          <Label accessibilityRole="header" style={styles.number}>
            {t('confirmation.number', { number: o.number })}
          </Label>
          <StatusBadge status={o.status} />
          <Label style={styles.muted}>
            {t('order.placedOn', { date: formatLome(o.createdAt) })}
          </Label>
          {variant === 'confirmation' && paid ? (
            <Label style={styles.thanks}>{t('confirmation.thanks')}</Label>
          ) : null}
          {variant === 'confirmation' && !paid && o.status === 'pending_payment' ? (
            <Banner tone="info" text={t('confirmation.pending')} />
          ) : null}
          {estimated ? (
            <Label>{t('confirmation.estimated', { date: formatLome(estimated, 'long') })}</Label>
          ) : null}
        </View>

        {needsPayment(o.status) ? (
          <View style={styles.block}>
            <Banner
              tone={o.status === 'payment_failed' ? 'danger' : 'info'}
              text={
                o.status === 'payment_failed' ? t('order.paymentFailed') : t('order.pendingPayment')
              }
            />
            <PrimaryButton
              label={o.status === 'payment_failed' ? t('order.payRetry') : t('order.pay')}
              onPress={() => router.push(`/purchase/payment?orderId=${o.id}`)}
            />
          </View>
        ) : null}
        {o.status === 'expired' ? <Banner tone="danger" text={t('order.expired')} /> : null}

        {code ? (
          <View accessible style={styles.code}>
            <Label style={styles.muted}>{codeTitle}</Label>
            <Label
              mono
              accessibilityLabel={t('order.code.value', {
                title: codeTitle,
                code: code.split('').join(' '),
              })}
              style={styles.codeValue}
            >
              {formatCode(code)}
            </Label>
            <Label style={styles.muted}>{t('order.code.hint')}</Label>
          </View>
        ) : o.status === 'ready_for_pickup' || o.status === 'shipped' ? (
          <Banner tone="info" text={t('order.code.waiting')} />
        ) : null}

        <Timeline steps={timelineSteps(o.status)} />

        <View style={styles.block}>
          <Label style={styles.title}>{t('order.items')}</Label>
          {o.items.map((item) => (
            <View
              key={item.id}
              accessible
              accessibilityLabel={t('order.item', { size: item.size, n: item.quantity })}
              style={styles.item}
            >
              {item.design.previewFrontUrl ? (
                <Image source={{ uri: item.design.previewFrontUrl }} style={styles.thumb} />
              ) : (
                <View style={styles.thumb} />
              )}
              <Label style={styles.itemText}>
                {t('order.item.line', { size: item.size, n: item.quantity })}
              </Label>
              <Amount xof={item.lineTotalXof} />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <PriceRow label={t('order.subtotal')} xof={o.subtotalXof} />
          <PriceRow label={t('order.delivery')} xof={o.deliveryFeeXof} />
          <PriceRow label={t('order.total')} xof={o.totalXof} strong />
          {o.depositXof !== null ? (
            <>
              <PriceRow label={t('order.deposit')} xof={o.depositXof} />
              <PriceRow label={t('order.balance')} xof={o.totalXof - o.depositXof} />
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          {o.reception.type === 'home' ? (
            <>
              <Label style={styles.title}>{t('order.reception.home')}</Label>
              <Label>{`${o.reception.address.district}, ${o.reception.address.landmark}`}</Label>
              <Label mono>{formatTgPhone(o.reception.address.recipientPhone)}</Label>
            </>
          ) : (
            <>
              <Label style={styles.title}>{t('order.reception.pickup')}</Label>
              <Label>{o.reception.store.name}</Label>
              <Label>{o.reception.store.address}</Label>
              <Label mono>
                {t('order.reception.slot', {
                  date: formatLome(o.reception.slot.startsAt, 'date'),
                  time: formatLome(o.reception.slot.startsAt, 'time'),
                })}
              </Label>
            </>
          )}
        </View>

        <View style={styles.block}>
          <Label style={styles.title}>{t('order.history')}</Label>
          {o.history.map((h, i) => (
            <Label
              key={`${h.status}-${i}`}
              accessibilityLabel={t('order.history.row', {
                label: ORDER_STATUS_LABELS_FR[h.status],
                date: formatLome(h.at),
              })}
              style={styles.muted}
            >
              {`${ORDER_STATUS_LABELS_FR[h.status]} · ${formatLome(h.at)}`}
            </Label>
          ))}
        </View>

        <View style={styles.block}>
          {paid ? (
            <SecondaryButton
              label={t('order.receipt')}
              disabled={busy !== null}
              onPress={() => void receipt()}
            />
          ) : null}
          {whatsapp ? <SecondaryButton label={t('order.contact')} onPress={contact} /> : null}
          <SecondaryButton
            label={t('order.reorder')}
            disabled={busy !== null}
            onPress={() => void reorder()}
          />
          <SecondaryButton label={t('order.refresh')} onPress={() => void load()} />
          {variant === 'confirmation' ? (
            <PrimaryButton
              label={t('confirmation.cta.orders')}
              onPress={() => router.replace('/orders')}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 20 },
  head: { gap: 8, alignItems: 'flex-start' },
  number: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  thanks: { fontFamily: fonts.semibold },
  block: { gap: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  muted: { color: colors.inkSecondary, fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 6 },
  code: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    alignItems: 'center',
  },
  codeValue: { fontSize: 32, lineHeight: 40, letterSpacing: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceMuted },
});
