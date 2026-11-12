import {
  AddressInputSchema,
  formatLome,
  type Address,
  type AddressInput,
  type DeliveryZoneSummary,
  type PickupSlot,
  type ReceptionInput,
  type Store,
} from '@streetwear/shared';
import type { ApiClient } from '../../api/types';
import { t } from '../../i18n/fr';
import { formatPhoneInput, toE164 } from '../auth/flow';

export const LOME_CENTER = { lat: 6.1725, lng: 1.2314 };
export const ZONE_DEBOUNCE_MS = 400;
export const NUDGE_DEGREES = 0.001;

/** Centres approximatifs de quartiers de Lomé, utilisés quand la carte n'est pas disponible. À valider avec la marque. */
export const QUARTIERS: { name: string; lat: number; lng: number }[] = [
  { name: 'Tokoin', lat: 6.145, lng: 1.215 },
  { name: 'Nyékonakpoè', lat: 6.15, lng: 1.225 },
  { name: 'Bè', lat: 6.135, lng: 1.25 },
  { name: 'Kodjoviakopé', lat: 6.125, lng: 1.205 },
  { name: 'Djidjolé', lat: 6.185, lng: 1.205 },
  { name: 'Hédzranawoé', lat: 6.185, lng: 1.23 },
  { name: 'Adidogomé', lat: 6.175, lng: 1.175 },
  { name: 'Agoè', lat: 6.235, lng: 1.22 },
  { name: 'Baguida', lat: 6.125, lng: 1.325 },
];

/** La carte exige une clé Google Maps dans le binaire Android ; `EXPO_PUBLIC_MAPS_ENABLED=true` la signale à l'app. */
export const mapsEnabled = (): boolean => process.env.EXPO_PUBLIC_MAPS_ENABLED === 'true';

export type AddressDraft = {
  lat: number;
  lng: number;
  district: string;
  landmark: string;
  phone: string;
  /** Faux tant que l'emplacement n'a pas été choisi (mode sans carte : quartier à sélectionner). */
  picked: boolean;
};

export const emptyAddressDraft = (phone = '', picked = mapsEnabled()): AddressDraft => ({
  ...LOME_CENTER,
  district: '',
  landmark: '',
  phone: formatPhoneInput(phone.replace(/^\+228/, '')),
  picked,
});

export const draftFromAddress = (a: Address): AddressDraft => ({
  lat: a.lat,
  lng: a.lng,
  district: a.district,
  landmark: a.landmark,
  phone: formatPhoneInput(a.recipientPhone.replace(/^\+228/, '')),
  picked: true,
});

export type AddressErrors = Partial<Record<'district' | 'landmark' | 'phone' | 'location', string>>;

export function validateAddress(
  draft: AddressDraft,
  label?: string,
): { ok: true; input: AddressInput } | { ok: false; errors: AddressErrors } {
  const errors: AddressErrors = {};
  const phone = toE164(draft.phone);
  if (!draft.picked) errors.location = t('reception.quartier.title');
  if (!draft.district.trim()) errors.district = t('reception.address.invalid.district');
  if (!draft.landmark.trim()) errors.landmark = t('reception.address.invalid.landmark');
  if (!phone) errors.phone = t('reception.address.invalid.phone');
  if (Object.keys(errors).length > 0 || !phone) return { ok: false, errors };
  const parsed = AddressInputSchema.safeParse({
    label: label ?? t('reception.address.defaultLabel'),
    lat: draft.lat,
    lng: draft.lng,
    district: draft.district.trim(),
    landmark: draft.landmark.trim(),
    recipientPhone: phone,
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, errors: { landmark: t('reception.address.invalid.landmark') } };
}

export type ZoneState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'in'; zone: DeliveryZoneSummary }
  | { status: 'out' }
  | { status: 'error' };

export async function resolveZoneState(
  api: ApiClient,
  lat: number,
  lng: number,
): Promise<ZoneState> {
  try {
    const zone = await api.resolveZone(lat, lng);
    return zone ? { status: 'in', zone } : { status: 'out' };
  } catch {
    return { status: 'error' };
  }
}

export const toReceptionInput = {
  home: (address: Address): ReceptionInput => ({ type: 'home', addressId: address.id }),
  pickup: (store: Store, slot: PickupSlot): ReceptionInput => ({
    type: 'pickup',
    storeId: store.id,
    slotId: slot.id,
  }),
};

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Lome',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** Les 7 prochains jours (AAAA-MM-JJ en heure de Lomé, UTC+0) avec un libellé court. */
export function pickupDays(now: Date, count = 7): { date: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getTime() + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), label: dayFormat.format(d) };
  });
}

export const slotTimeLabel = (slot: PickupSlot): string =>
  `${formatLome(slot.startsAt, 'time')} – ${formatLome(slot.endsAt, 'time')}`;

export const remainingLabel = (remaining: number): string =>
  remaining === 1
    ? t('reception.pickup.remaining.one')
    : t('reception.pickup.remaining.other', { n: remaining });

export const openingHoursLines = (store: Store): string[] =>
  Object.entries(store.openingHours).map(([days, hours]) => `${days} : ${hours}`);
