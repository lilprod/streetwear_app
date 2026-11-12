import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  formatXof,
  type Order,
  type OrderPaymentMethod,
  type PaymentMethod,
} from '@streetwear/shared';
import { getApi } from '../../api';
import { useSession } from '../../auth/session';
import { t, type FrKey } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts } from '../../theme';
import {
  Banner,
  Chip,
  Label,
  PrimaryButton,
  SecondaryButton,
  Segmented,
  StateView,
} from '../../ui/controls';
import { BottomBar, PriceRow, ScreenHeader, SkeletonScreen } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { TextField } from '../../ui/TextField';
import { formatPhoneInput, toE164 } from '../auth/flow';
import { setCheckout, useCheckout, type ReceptionChoice } from '../reception/store';
import {
  recheckPayment,
  resetPayment,
  resumePayment,
  startPayment,
  stopPolling,
  usePayment,
  loadAttempt,
  paymentStore,
  type ErrorAction,
} from './flow';
import { getStorage } from '../../storage';

const METHOD_LABEL: Record<OrderPaymentMethod, FrKey> = {
  tmoney: 'payment.method.tmoney',
  flooz: 'payment.method.flooz',
  card: 'payment.method.card',
  cod: 'payment.method.cod',
};

type Summary = {
  subtotalXof: number;
  deliveryFeeXof: number;
  totalXof: number;
  depositXof: number | null;
  pickup: boolean;
};

export function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const checkout = useCheckout((s) => s);
  const user = useSession((s) => s.user);
  const phase = usePayment((s) => s.phase);
  const [existing, setExisting] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; order: Order }
  >({ status: orderId ? 'loading' : 'idle' });
  const [loadTry, setLoadTry] = useState(0);
  const [choice, setChoice] = useState<OrderPaymentMethod>('tmoney');
  const [depositWith, setDepositWith] = useState<'tmoney' | 'flooz'>('tmoney');
  const [phone, setPhone] = useState(formatPhoneInput((user?.phone ?? '').replace(/^\+228/, '')));
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    resetPayment();
    return stopPolling;
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    setExisting({ status: 'loading' });
    getApi()
      .getOrder(orderId)
      .then((order) => {
        if (!alive) return;
        setExisting({ status: 'ready', order });
        if (order.paymentMethod !== 'cod') setChoice(order.paymentMethod as OrderPaymentMethod);
        const attempt = loadAttempt(getStorage());
        if (attempt?.orderId === order.id && attempt.paymentId) void resumePayment(order.id);
      })
      .catch(() => alive && setExisting({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [orderId, loadTry]);

  const order = existing.status === 'ready' ? existing.order : null;
  const reception = checkout.reception;
  const summary: Summary | null = order
    ? {
        subtotalXof: order.subtotalXof,
        deliveryFeeXof: order.deliveryFeeXof,
        totalXof: order.totalXof,
        depositXof: order.depositXof,
        pickup: order.reception.type === 'pickup',
      }
    : checkout.quote && reception
      ? {
          subtotalXof: checkout.quote.subtotalXof,
          deliveryFeeXof: checkout.quote.deliveryFeeXof,
          totalXof: checkout.quote.totalXof,
          depositXof: checkout.quote.codDepositXof,
          pickup: reception.type === 'pickup',
        }
      : null;
  const codAllowed = order ? order.paymentMethod === 'cod' : reception?.type === 'home';
  const orderMethod: OrderPaymentMethod = order
    ? (order.paymentMethod as OrderPaymentMethod)
    : choice;
  const lockedMethod = !!order && order.paymentMethod !== 'cod';
  const payWith: PaymentMethod =
    orderMethod === 'cod' ? depositWith : (orderMethod as PaymentMethod);
  const needsPhone = payWith !== 'card';

  const busy =
    phase.name === 'creating' || phase.name === 'redirecting' || phase.name === 'waiting';

  const pay = useCallback(() => {
    if (needsPhone && !toE164(phone)) {
      setPhoneError(t('payment.phone.invalid'));
      return;
    }
    setPhoneError(null);
    const payerPhone = needsPhone ? (toE164(phone) ?? undefined) : undefined;
    void startPayment({
      ...(order ? { orderId: order.id } : reception ? { reception: toInput(reception) } : {}),
      orderMethod,
      payWith,
      payerPhone,
    });
  }, [needsPhone, phone, order, reception, orderMethod, payWith]);

  useEffect(() => {
    if (phase.name !== 'succeeded') return;
    const id = phase.orderId;
    setCheckout({ preferredMode: null });
    router.replace(`/purchase/confirmation?orderId=${id}`);
  }, [phase]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const o = order?.id ?? loadAttempt(getStorage())?.orderId;
      if (state === 'active' && o && paymentStore.getState().phase.name === 'waiting')
        void resumePayment(o);
    });
    return () => sub.remove();
  }, [order]);

  const goAction = (action: ErrorAction) => {
    resetPayment();
    if (action === 'chooseSlot') {
      setCheckout({ preferredMode: 'pickup' });
      router.replace('/purchase/reception');
    } else if (action === 'chooseReception') {
      router.replace('/purchase/reception');
    } else if (action === 'cart') router.replace('/purchase/cart');
    else if (action === 'orders') router.replace('/orders');
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/purchase/cart'));

  if (orderId && existing.status === 'loading') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader title={t('payment.title')} onBack={back} />
        <SkeletonScreen />
      </Screen>
    );
  }
  if (orderId && existing.status === 'error') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader title={t('payment.title')} onBack={back} />
        <StateView
          kind="error"
          message={t('payment.order.error')}
          onRetry={() => setLoadTry((n) => n + 1)}
        />
      </Screen>
    );
  }
  if (!summary) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader title={t('payment.title')} onBack={back} />
        <StateView
          kind="empty"
          title={t('payment.empty.title')}
          message={t('payment.empty.message')}
        />
        <View style={styles.pad}>
          <PrimaryButton
            label={t('payment.empty.cta')}
            onPress={() => router.replace('/purchase/cart')}
          />
        </View>
      </Screen>
    );
  }

  const deposit = orderMethod === 'cod';
  const amountLabel = deposit
    ? summary.depositXof !== null
      ? t('payment.pay', { amount: formatXof(summary.depositXof) })
      : t('payment.payDeposit')
    : t('payment.pay', { amount: formatXof(summary.totalXof) });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('payment.title')} onBack={busy ? undefined : back} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <PriceRow label={t('payment.summary.subtotal')} xof={summary.subtotalXof} />
            {summary.pickup ? (
              <PriceRow
                label={t('payment.summary.delivery')}
                note={t('payment.summary.pickupFree')}
              />
            ) : (
              <PriceRow label={t('payment.summary.delivery')} xof={summary.deliveryFeeXof} />
            )}
            <PriceRow label={t('payment.summary.total')} xof={summary.totalXof} strong />
            {deposit ? (
              summary.depositXof !== null ? (
                <>
                  <PriceRow label={t('payment.summary.deposit')} xof={summary.depositXof} strong />
                  <PriceRow
                    label={t('payment.summary.balance')}
                    xof={summary.totalXof - summary.depositXof}
                  />
                </>
              ) : null
            ) : null}
          </View>

          {phase.name === 'waiting' || phase.name === 'redirecting' || phase.name === 'creating' ? (
            <Waiting
              card={payWith === 'card'}
              phase={phase.name}
              offline={phase.name === 'waiting' && phase.offline}
            />
          ) : null}
          {phase.name === 'timeout' ? (
            <View style={styles.block}>
              <Banner
                tone="info"
                text={`${t('payment.timeout.title')}. ${t('payment.timeout.message')}`}
              />
              <PrimaryButton
                label={t('payment.timeout.check')}
                onPress={() => void recheckPayment(phase.orderId)}
              />
              <SecondaryButton
                label={t('payment.seeOrders')}
                onPress={() => router.replace('/orders')}
              />
            </View>
          ) : null}
          {phase.name === 'failed' ? (
            <Banner
              tone="danger"
              text={`${t('payment.failed.title')}. ${t('payment.failed.message')}`}
            />
          ) : null}
          {phase.name === 'error' ? (
            <View style={styles.block}>
              <Banner tone="danger" text={phase.message} />
              {phase.action ? (
                <SecondaryButton
                  label={t(`payment.action.${phase.action}` as FrKey)}
                  onPress={() => goAction(phase.action)}
                />
              ) : null}
            </View>
          ) : null}

          {!busy && phase.name !== 'timeout' ? (
            <>
              <View style={styles.block}>
                <Label style={styles.title}>{t('payment.method.label')}</Label>
                {lockedMethod ? (
                  <Label style={styles.muted}>
                    {t('payment.method.locked', { method: t(METHOD_LABEL[orderMethod]) })}
                  </Label>
                ) : (
                  <View style={styles.chips}>
                    {(
                      [
                        'tmoney',
                        'flooz',
                        'card',
                        ...(codAllowed ? ['cod'] : []),
                      ] as OrderPaymentMethod[]
                    ).map((m) => (
                      <Chip
                        key={m}
                        label={t(METHOD_LABEL[m])}
                        selected={orderMethod === m}
                        onPress={() => !order && setChoice(m)}
                      />
                    ))}
                  </View>
                )}
                {deposit ? (
                  <View style={styles.block}>
                    <Label style={styles.muted}>{t('payment.method.codHint')}</Label>
                    <Segmented<'tmoney' | 'flooz'>
                      label={t('payment.method.depositWith')}
                      value={depositWith}
                      onChange={setDepositWith}
                      options={[
                        { value: 'tmoney', label: t('payment.method.tmoney') },
                        { value: 'flooz', label: t('payment.method.flooz') },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
              {needsPhone ? (
                <TextField
                  label={t('payment.phone.label')}
                  value={phone}
                  onChangeText={(v) => setPhone(formatPhoneInput(v))}
                  error={phoneError}
                  prefix="+228"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  mono
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>
        {phase.name === 'timeout' ? null : (
          <BottomBar>
            <PrimaryButton
              label={phase.name === 'failed' ? t('payment.retry') : amountLabel}
              loading={busy}
              onPress={pay}
            />
          </BottomBar>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function toInput(r: ReceptionChoice) {
  return r.type === 'home'
    ? ({ type: 'home', addressId: r.address.id } as const)
    : ({ type: 'pickup', storeId: r.store.id, slotId: r.slot.id } as const);
}

function Waiting({ card, phase, offline }: { card: boolean; phase: string; offline: boolean }) {
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('payment.waiting.title')}
      style={styles.waiting}
    >
      <ActivityIndicator color={colors.ink} size="large" />
      <Label style={styles.waitTitle}>{t('payment.waiting.title')}</Label>
      <Label style={styles.muted}>
        {card && phase !== 'creating' ? t('payment.waiting.card') : t('payment.waiting.message')}
      </Label>
      {offline ? <Banner tone="info" text={t('payment.waiting.offline')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: SCREEN_MARGIN, gap: 16 },
  pad: { padding: SCREEN_MARGIN },
  block: { gap: 12 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  muted: { color: colors.inkSecondary, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  waiting: { alignItems: 'center', gap: 12, padding: 24 },
  waitTitle: { fontFamily: fonts.bold, fontSize: 22, textAlign: 'center' },
});
