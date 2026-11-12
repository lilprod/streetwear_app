import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ORDER_STATUS_LABELS_FR,
  formatLome,
  formatXof,
  type OrderSummary,
} from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError } from '../../api/types';
import { useSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { MIN_TARGET, SCREEN_MARGIN, colors, fonts, radius } from '../../theme';
import { Amount, Label, PrimaryButton, SecondaryButton, StateView } from '../../ui/controls';
import { ScreenHeader, SkeletonScreen, StatusBadge } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';

type State =
  | { status: 'loading' }
  | { status: 'error'; offline: boolean }
  | { status: 'ready'; items: OrderSummary[]; next: string | null; more: boolean };

export function OrdersScreen() {
  const session = useSession((s) => s.status);
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    try {
      const page = await getApi().listOrders();
      setState({ status: 'ready', items: page.items, next: page.nextCursor, more: false });
    } catch (e) {
      setState((s) =>
        s.status === 'ready'
          ? s
          : { status: 'error', offline: e instanceof ApiError && e.isNetwork },
      );
    }
  }, []);

  const loadMore = async () => {
    if (state.status !== 'ready' || !state.next) return;
    setState({ ...state, more: true });
    try {
      const page = await getApi().listOrders(state.next);
      setState({
        status: 'ready',
        items: [...state.items, ...page.items],
        next: page.nextCursor,
        more: false,
      });
    } catch {
      setState({ ...state, more: false });
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (session === 'authenticated') void load();
    }, [session, load]),
  );

  let content;
  if (session === 'anonymous') {
    content = (
      <>
        <StateView kind="empty" title={t('orders.empty.title')} message={t('orders.login')} />
        <View style={styles.pad}>
          <PrimaryButton
            label={t('orders.loginCta')}
            onPress={() => router.push('/purchase/login')}
          />
        </View>
      </>
    );
  } else if (session === 'booting' || state.status === 'loading') {
    content = <SkeletonScreen />;
  } else if (state.status === 'error') {
    content = (
      <StateView
        kind={state.offline ? 'offline' : 'error'}
        message={t('orders.error')}
        onRetry={() => void load()}
      />
    );
  } else if (state.items.length === 0) {
    content = (
      <StateView kind="empty" title={t('orders.empty.title')} message={t('orders.empty.message')} />
    );
  } else {
    content = (
      <ScrollView contentContainerStyle={styles.list}>
        {state.items.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={t('orders.row', {
              number: o.number,
              status: ORDER_STATUS_LABELS_FR[o.status],
              amount: formatXof(o.totalXof),
            })}
            onPress={() => router.push(`/orders/${o.id}`)}
            style={styles.row}
          >
            <View style={styles.rowTop}>
              <Label style={styles.number}>{o.number}</Label>
              <StatusBadge status={o.status} />
            </View>
            <Label style={styles.muted}>
              {`${formatLome(o.createdAt, 'date')} · ${t('orders.items', { n: o.itemCount })}`}
            </Label>
            <Amount xof={o.totalXof} />
          </Pressable>
        ))}
        {state.next ? (
          <SecondaryButton
            label={t('orders.more')}
            disabled={state.more}
            onPress={() => void loadMore()}
          />
        ) : null}
      </ScrollView>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('orders.title')} />
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: SCREEN_MARGIN, gap: 12 },
  pad: { padding: SCREEN_MARGIN },
  row: {
    minHeight: MIN_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  number: { fontFamily: fonts.semibold },
  muted: { color: colors.inkSecondary, fontSize: 14 },
});
