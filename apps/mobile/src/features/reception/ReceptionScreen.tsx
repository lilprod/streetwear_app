import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Address, PickupSlot, Store } from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError } from '../../api/types';
import { useSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts } from '../../theme';
import { Banner, Chip, Label, PrimaryButton, Segmented, StateView } from '../../ui/controls';
import { BottomBar, ScreenHeader, SkeletonScreen } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { AddressEditor } from './AddressEditor';
import {
  draftFromAddress,
  emptyAddressDraft,
  openingHoursLines,
  pickupDays,
  remainingLabel,
  slotTimeLabel,
  toReceptionInput,
  validateAddress,
  type AddressDraft,
  type AddressErrors,
  type ZoneState,
} from './logic';
import { checkoutStore, setCheckout } from './store';

type Mode = 'home' | 'pickup';
type Load<T> =
  { status: 'loading' } | { status: 'error'; offline: boolean } | { status: 'ready'; data: T };

export function ReceptionScreen() {
  const user = useSession((s) => s.user);
  const [mode, setMode] = useState<Mode>(checkoutStore.getState().preferredMode ?? 'home');
  const [draft, setDraft] = useState<AddressDraft>(() => emptyAddressDraft(user?.phone ?? ''));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [zone, setZone] = useState<ZoneState>({ status: 'idle' });
  const [saved, setSaved] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getApi()
      .listAddresses()
      .then((list) => alive && setSaved(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const [store, setStore] = useState<Load<Store>>({ status: 'loading' });
  const [storeTry, setStoreTry] = useState(0);
  useEffect(() => {
    if (mode !== 'pickup') return;
    let alive = true;
    setStore({ status: 'loading' });
    getApi()
      .listStores()
      .then((list) => {
        const first = list[0];
        if (!alive) return;
        setStore(first ? { status: 'ready', data: first } : { status: 'error', offline: false });
      })
      .catch(
        (e: unknown) =>
          alive && setStore({ status: 'error', offline: e instanceof ApiError && e.isNetwork }),
      );
    return () => {
      alive = false;
    };
  }, [mode, storeTry]);

  const days = useMemo(() => pickupDays(new Date()), []);
  const [date, setDate] = useState(days[0]?.date ?? '');
  const [slots, setSlots] = useState<Load<PickupSlot[]>>({ status: 'loading' });
  const [slotId, setSlotId] = useState<string | null>(null);
  const [slotTry, setSlotTry] = useState(0);
  const storeId = store.status === 'ready' ? store.data.id : null;
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    setSlots({ status: 'loading' });
    setSlotId(null);
    getApi()
      .listSlots(storeId, date)
      .then((list) => alive && setSlots({ status: 'ready', data: list }))
      .catch(
        (e: unknown) =>
          alive && setSlots({ status: 'error', offline: e instanceof ApiError && e.isNetwork }),
      );
    return () => {
      alive = false;
    };
  }, [storeId, date, slotTry]);

  const edit = useCallback((next: AddressDraft) => {
    setDraft(next);
    setSelectedId(null);
    setErrors({});
    setFailure(null);
  }, []);
  const pick = (a: Address) => {
    setDraft(draftFromAddress(a));
    setSelectedId(a.id);
    setErrors({});
    setFailure(null);
  };
  const switchToPickup = useCallback(() => setMode('pickup'), []);

  const goPayment = async () => {
    setBusy(true);
    setFailure(null);
    const api = getApi();
    try {
      if (mode === 'home') {
        let address = saved.find((a) => a.id === selectedId);
        if (!address) {
          const check = validateAddress(draft);
          if (!check.ok) {
            setErrors(check.errors);
            return;
          }
          address = await api.createAddress(check.input);
          setSaved((list) => [...list, address as Address]);
          setSelectedId(address.id);
        }
        if (!address.zone) {
          setZone({ status: 'out' });
          return;
        }
        const quote = await api.quoteCart(toReceptionInput.home(address));
        setCheckout({
          reception: { type: 'home', address, zone: address.zone },
          quote,
          preferredMode: null,
        });
      } else {
        const chosen =
          slots.status === 'ready' ? slots.data.find((s) => s.id === slotId) : undefined;
        if (store.status !== 'ready' || !chosen) {
          setFailure(t('reception.pickup.chooseSlot'));
          return;
        }
        const quote = await api.quoteCart(toReceptionInput.pickup(store.data, chosen));
        setCheckout({
          reception: { type: 'pickup', store: store.data, slot: chosen },
          quote,
          preferredMode: null,
        });
      }
      router.push('/purchase/payment');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SLOT_FULL') {
        setFailure(t('reception.pickup.full'));
        setSlotTry((n) => n + 1);
      } else if (e instanceof ApiError && e.code === 'OUT_OF_ZONE') {
        setZone({ status: 'out' });
      } else {
        setFailure(
          mode === 'home' && !(e instanceof ApiError && e.code === 'VALIDATION_FAILED')
            ? t('reception.address.saveError')
            : t('reception.quote.error'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const homeBlocked = mode === 'home' && (zone.status === 'out' || zone.status === 'loading');
  const pickupBlocked = mode === 'pickup' && !slotId;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('reception.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/purchase/cart'))}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Segmented<Mode>
            label={t('reception.mode.label')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'home', label: t('reception.mode.home') },
              { value: 'pickup', label: t('reception.mode.pickup') },
            ]}
          />
          {failure ? <Banner tone="danger" text={failure} /> : null}

          {mode === 'home' ? (
            <>
              {saved.length > 0 ? (
                <View style={styles.block}>
                  <Label style={styles.title}>{t('reception.saved.title')}</Label>
                  <View style={styles.chips}>
                    {saved.map((a) => (
                      <Chip
                        key={a.id}
                        label={`${a.label} · ${a.district}`}
                        selected={selectedId === a.id}
                        onPress={() => pick(a)}
                      />
                    ))}
                    <Chip
                      label={t('reception.saved.new')}
                      selected={selectedId === null}
                      onPress={() => edit(emptyAddressDraft(user?.phone ?? ''))}
                    />
                  </View>
                </View>
              ) : null}
              <Label style={styles.title}>{t('reception.address.title')}</Label>
              <AddressEditor
                draft={draft}
                onChange={edit}
                errors={errors}
                onZone={setZone}
                onSwitchToPickup={switchToPickup}
              />
            </>
          ) : (
            <PickupSection
              store={store}
              retryStore={() => setStoreTry((n) => n + 1)}
              days={days}
              date={date}
              onDate={setDate}
              slots={slots}
              retrySlots={() => setSlotTry((n) => n + 1)}
              slotId={slotId}
              onSlot={setSlotId}
            />
          )}
        </ScrollView>
        <BottomBar>
          <PrimaryButton
            label={t('reception.continue')}
            loading={busy}
            disabled={homeBlocked || pickupBlocked}
            onPress={() => void goPayment()}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PickupSection(props: {
  store: Load<Store>;
  retryStore: () => void;
  days: { date: string; label: string }[];
  date: string;
  onDate: (d: string) => void;
  slots: Load<PickupSlot[]>;
  retrySlots: () => void;
  slotId: string | null;
  onSlot: (id: string) => void;
}) {
  const { store, slots } = props;
  if (store.status === 'loading') return <SkeletonScreen rows={2} />;
  if (store.status === 'error') {
    return (
      <StateView
        kind={store.offline ? 'offline' : 'error'}
        message={t('reception.storeError')}
        onRetry={props.retryStore}
      />
    );
  }
  return (
    <View style={styles.block}>
      <Label style={styles.title}>{t('reception.pickup.title')}</Label>
      <View accessible style={styles.card}>
        <Label style={styles.strong}>{store.data.name}</Label>
        <Label>{store.data.address}</Label>
        <Label style={styles.muted}>{t('reception.pickup.hours')}</Label>
        {openingHoursLines(store.data).map((line) => (
          <Label key={line} mono style={styles.small}>
            {line}
          </Label>
        ))}
      </View>
      <Label style={styles.title}>{t('reception.pickup.day')}</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {props.days.map((d) => (
          <Chip
            key={d.date}
            label={d.label}
            selected={props.date === d.date}
            onPress={() => props.onDate(d.date)}
          />
        ))}
      </ScrollView>
      <Label style={styles.title}>{t('reception.pickup.slots')}</Label>
      {slots.status === 'loading' ? <SkeletonScreen rows={1} /> : null}
      {slots.status === 'error' ? (
        <StateView
          kind={slots.offline ? 'offline' : 'error'}
          message={t('reception.pickup.slotsError')}
          onRetry={props.retrySlots}
        />
      ) : null}
      {slots.status === 'ready' && slots.data.length === 0 ? (
        <Label style={styles.muted}>{t('reception.pickup.noSlots')}</Label>
      ) : null}
      {slots.status === 'ready' ? (
        <View style={styles.chips}>
          {slots.data.map((s) => (
            <Chip
              key={s.id}
              label={`${slotTimeLabel(s)} · ${remainingLabel(s.remaining)}`}
              selected={props.slotId === s.id}
              onPress={() => props.onSlot(s.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: SCREEN_MARGIN, gap: 16 },
  block: { gap: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  strong: { fontFamily: fonts.semibold },
  muted: { color: colors.inkSecondary, fontSize: 14 },
  small: { fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
});
