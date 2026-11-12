import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { formatXof } from '@streetwear/shared';
import { getApi } from '../../api';
import { t } from '../../i18n/fr';
import { colors } from '../../theme';
import { Banner, Chip, Label, SecondaryButton } from '../../ui/controls';
import { TextField } from '../../ui/TextField';
import { formatPhoneInput } from '../auth/flow';
import {
  QUARTIERS,
  ZONE_DEBOUNCE_MS,
  mapsEnabled,
  resolveZoneState,
  type AddressDraft,
  type AddressErrors,
  type ZoneState,
} from './logic';

const MapPicker = lazy(() => import('./MapPicker'));

type Props = {
  draft: AddressDraft;
  onChange: (next: AddressDraft) => void;
  errors?: AddressErrors;
  onZone?: (zone: ZoneState) => void;
  onSwitchToPickup?: () => void;
};

/** Zone résolue en direct (anti-rebond) à chaque déplacement du point ou changement de quartier. */
export function useZoneResolution(lat: number, lng: number, enabled: boolean) {
  const [zone, setZone] = useState<ZoneState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setZone({ status: 'idle' });
      return;
    }
    let alive = true;
    setZone({ status: 'loading' });
    const timer = setTimeout(() => {
      void resolveZoneState(getApi(), lat, lng).then((next) => alive && setZone(next));
    }, ZONE_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [lat, lng, enabled, attempt]);
  return { zone, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

export function AddressEditor({ draft, onChange, errors = {}, onZone, onSwitchToPickup }: Props) {
  const withMap = mapsEnabled();
  const { zone, retry } = useZoneResolution(draft.lat, draft.lng, draft.picked);
  useEffect(() => onZone?.(zone), [zone, onZone]);

  return (
    <View style={styles.wrap}>
      {withMap ? (
        <Suspense fallback={<ActivityIndicator color={colors.ink} />}>
          <MapPicker
            lat={draft.lat}
            lng={draft.lng}
            onChange={(lat, lng) => onChange({ ...draft, lat, lng, picked: true })}
          />
        </Suspense>
      ) : (
        <View style={styles.wrap}>
          <Label style={styles.muted}>{t('reception.quartier.degraded')}</Label>
          <View accessibilityLabel={t('reception.quartier.title')} style={styles.chips}>
            {QUARTIERS.map((q) => (
              <Chip
                key={q.name}
                label={q.name}
                selected={draft.picked && draft.lat === q.lat && draft.lng === q.lng}
                onPress={() =>
                  onChange({ ...draft, lat: q.lat, lng: q.lng, district: q.name, picked: true })
                }
              />
            ))}
          </View>
          {errors.location ? (
            <Label accessibilityRole="alert" style={styles.error}>
              {errors.location}
            </Label>
          ) : null}
        </View>
      )}

      {zone.status === 'loading' ? (
        <Label accessibilityLiveRegion="polite">{t('reception.zone.loading')}</Label>
      ) : null}
      {zone.status === 'in' ? (
        <Banner
          tone="info"
          text={t('reception.zone.in', {
            name: zone.zone.name,
            fee: formatXof(zone.zone.feeXof),
            hours: zone.zone.delayHours,
          })}
        />
      ) : null}
      {zone.status === 'out' ? (
        <View style={styles.wrap}>
          <Banner
            tone="danger"
            text={`${t('reception.zone.out')} ${t('reception.zone.outHint')}`}
          />
          {onSwitchToPickup ? (
            <SecondaryButton label={t('reception.zone.switchPickup')} onPress={onSwitchToPickup} />
          ) : null}
        </View>
      ) : null}
      {zone.status === 'error' ? (
        <View style={styles.wrap}>
          <Banner tone="danger" text={t('reception.zone.error')} />
          <SecondaryButton label={t('state.retry')} onPress={retry} />
        </View>
      ) : null}

      <TextField
        label={t('reception.address.district')}
        value={draft.district}
        onChangeText={(district) => onChange({ ...draft, district })}
        error={errors.district}
        autoComplete="off"
      />
      <TextField
        label={t('reception.address.landmark')}
        value={draft.landmark}
        onChangeText={(landmark) => onChange({ ...draft, landmark })}
        error={errors.landmark}
        multiline
      />
      <TextField
        label={t('reception.address.phone')}
        value={draft.phone}
        onChangeText={(phone) => onChange({ ...draft, phone: formatPhoneInput(phone) })}
        error={errors.phone}
        prefix="+228"
        keyboardType="phone-pad"
        autoComplete="tel"
        mono
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { color: colors.inkSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
