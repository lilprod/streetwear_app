import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CUSTOMER_TIMELINE,
  ORDER_STATUS_LABELS_FR,
  customerTimelineIndex,
  formatXof,
  type OrderStatus,
  type Size,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import { MIN_TARGET, SCREEN_MARGIN, colors, fonts, radius, statusTones } from '../theme';
import { Label } from './controls';

export function PriceRow({
  label,
  xof,
  strong,
  note,
}: {
  label: string;
  xof?: number;
  strong?: boolean;
  note?: string;
}) {
  const amount = xof === undefined ? (note ?? '') : formatXof(xof);
  return (
    <View accessible accessibilityLabel={t('price.row', { label, amount })} style={styles.priceRow}>
      <Label style={[styles.priceLabel, strong && styles.priceStrong]}>{label}</Label>
      <Label mono={xof !== undefined} style={[strong && styles.priceStrong, styles.priceValue]}>
        {amount}
      </Label>
    </View>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  decrementLabel,
  incrementLabel,
  valueLabel,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  decrementLabel: string;
  incrementLabel: string;
  valueLabel: string;
  disabled?: boolean;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        accessibilityState={{ disabled: disabled || atMin }}
        disabled={disabled || atMin}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.stepBtn, (disabled || atMin) && styles.dim]}
      >
        <Text importantForAccessibility="no" style={styles.stepGlyph}>
          −
        </Text>
      </Pressable>
      <Label
        mono
        accessibilityLiveRegion="polite"
        accessibilityLabel={valueLabel}
        style={styles.stepValue}
      >
        {value}
      </Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        accessibilityState={{ disabled: disabled || atMax }}
        disabled={disabled || atMax}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.stepBtn, (disabled || atMax) && styles.dim]}
      >
        <Text importantForAccessibility="no" style={styles.stepGlyph}>
          +
        </Text>
      </Pressable>
    </View>
  );
}

export function SizePicker({
  sizes,
  value,
  onChange,
}: {
  sizes: { size: Size; available: boolean }[];
  value: Size | null;
  onChange: (s: Size) => void;
}) {
  return (
    <View style={styles.sizeGrid}>
      {sizes.map(({ size, available }) => {
        const selected = value === size;
        return (
          <View key={size} style={styles.sizeCell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                available
                  ? t('purchase.size.pick', { size })
                  : t('purchase.size.soldOut.label', { size })
              }
              accessibilityState={{ selected, disabled: !available }}
              disabled={!available}
              onPress={() => onChange(size)}
              style={[styles.size, selected && styles.sizeOn, !available && styles.sizeOff]}
            >
              <Label
                style={[
                  styles.sizeText,
                  selected && styles.sizeTextOn,
                  !available && styles.sizeTextOff,
                ]}
              >
                {size}
              </Label>
              {!available ? (
                <Label style={styles.soldOut}>{t('purchase.size.soldOut')}</Label>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const TONE_OF: Record<OrderStatus, keyof typeof statusTones> = {
  pending_payment: 'neutral',
  payment_failed: 'danger',
  expired: 'neutral',
  paid: 'info',
  deposit_paid: 'info',
  in_production: 'production',
  ready: 'success',
  shipped: 'shipping',
  ready_for_pickup: 'success',
  delivered: 'neutral',
  delivery_failed: 'danger',
  returned: 'neutral',
  cancelled: 'danger',
  refunded: 'neutral',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = statusTones[TONE_OF[status]];
  const label = ORDER_STATUS_LABELS_FR[status];
  return (
    <View
      accessible
      accessibilityLabel={t('status.badge', { label })}
      style={[styles.badge, { backgroundColor: tone.bg }]}
    >
      <View style={[styles.badgeDot, { backgroundColor: tone.ink }]} />
      <Label style={[styles.badgeText, { color: tone.ink }]}>{label}</Label>
    </View>
  );
}

export type TimelineStep = { key: string; label: string; state: 'done' | 'current' | 'todo' };

export function timelineSteps(status: OrderStatus): TimelineStep[] {
  const index = customerTimelineIndex(status);
  return CUSTOMER_TIMELINE.map((step, i) => ({
    key: step.key,
    label: step.labelFr,
    state:
      index < 0
        ? 'todo'
        : i < index || status === 'delivered'
          ? 'done'
          : i === index
            ? 'current'
            : 'todo',
  }));
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View accessibilityLabel={t('timeline.label')} style={styles.timeline}>
      {steps.map((step, i) => (
        <View
          key={step.key}
          accessible
          accessibilityLabel={t(`timeline.${step.state}`, { label: step.label })}
          style={styles.tlRow}
        >
          <View style={styles.tlRail}>
            <View
              style={[
                styles.tlDot,
                step.state === 'done' && styles.tlDone,
                step.state === 'current' && styles.tlCurrent,
              ]}
            />
            {i < steps.length - 1 ? <View style={styles.tlLine} /> : null}
          </View>
          <Label style={[styles.tlLabel, step.state === 'todo' && styles.tlTodoText]}>
            {step.label}
          </Label>
        </View>
      ))}
    </View>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {children}
    </View>
  );
}

export function PatternTile({
  name,
  imageUrl,
  badge,
  label,
  onPress,
}: {
  name: string;
  imageUrl: string;
  badge?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tile}
    >
      <Image
        source={{ uri: imageUrl }}
        accessibilityIgnoresInvertColors
        importantForAccessibility="no"
        style={styles.tileImage}
        resizeMode="cover"
      />
      <Label numberOfLines={1} style={styles.tileName}>
        {name}
      </Label>
      {badge ? <Label style={styles.tileBadge}>{badge}</Label> : null}
    </Pressable>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View importantForAccessibility="no" style={[styles.skeleton, style, { opacity }]} />
  );
}

export function SkeletonScreen({ rows = 3 }: { rows?: number }) {
  return (
    <View
      accessible
      accessibilityLabel={t('state.loading.label')}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
      style={styles.skeletonScreen}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={{ height: 72 }} />
      ))}
    </View>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          style={styles.back}
        >
          <Text importantForAccessibility="no" style={styles.backGlyph}>
            ‹
          </Text>
        </Pressable>
      ) : null}
      <Label accessibilityRole="header" style={styles.headerTitle}>
        {title}
      </Label>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
    gap: 12,
  },
  priceLabel: { color: colors.inkSecondary, flexShrink: 1 },
  priceValue: { textAlign: 'right' },
  priceStrong: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
  },
  stepBtn: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 22, color: colors.ink },
  stepValue: { minWidth: 36, textAlign: 'center', fontSize: 16 },
  dim: { opacity: 0.35 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  sizeCell: { width: '25%', padding: 4 },
  size: {
    minHeight: 56,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sizeOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  sizeOff: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  sizeText: { fontFamily: fonts.semibold, fontSize: 16 },
  sizeTextOn: { color: colors.surface },
  sizeTextOff: { color: colors.inkDisabled, textDecorationLine: 'line-through' },
  soldOut: { fontSize: 11, lineHeight: 14, color: colors.inkSecondary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold },
  timeline: { paddingVertical: 4 },
  tlRow: { flexDirection: 'row', minHeight: 44, gap: 12 },
  tlRail: { width: 20, alignItems: 'center' },
  tlDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  tlDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  tlCurrent: { borderWidth: 5, borderColor: colors.ink },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  tlLabel: { flex: 1, fontFamily: fonts.semibold },
  tlTodoText: { color: colors.inkSecondary, fontFamily: fonts.regular },
  bottomBar: {
    paddingTop: 12,
    paddingHorizontal: SCREEN_MARGIN,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.9)',
    gap: 8,
  },
  tile: { width: 132, gap: 6, minHeight: MIN_TARGET },
  tileImage: {
    width: 132,
    height: 132,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
  },
  tileName: { fontFamily: fonts.semibold, fontSize: 14 },
  tileBadge: { fontSize: 11, lineHeight: 14, color: colors.inkSecondary },
  skeleton: { borderRadius: radius.card, backgroundColor: colors.surfaceMuted },
  skeletonScreen: { padding: SCREEN_MARGIN, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  back: { width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 28, color: colors.ink },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 20,
    lineHeight: 26,
    paddingLeft: 12,
  },
});
