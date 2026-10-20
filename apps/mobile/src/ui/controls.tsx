import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { formatXof } from '@streetwear/shared';
import { MAX_FONT_SCALE, MIN_TARGET, colors, fonts, radius } from '../theme';
import { t } from '../i18n/fr';

export function Label({ mono, style, ...rest }: TextProps & { mono?: boolean }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[styles.text, mono && styles.mono, style]}
      {...rest}
    />
  );
}

export function Amount({ xof, style }: { xof: number; style?: TextProps['style'] }) {
  return (
    <Label mono style={style}>
      {formatXof(xof)}
    </Label>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.primary, (disabled || loading) && styles.primaryOff, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Label style={styles.primaryText}>{label}</Label>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.secondary, disabled && styles.off, style]}
    >
      <Label style={styles.secondaryText}>{label}</Label>
    </Pressable>
  );
}

export function IconButton({
  glyph,
  label,
  onPress,
  disabled,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.icon, disabled && styles.off]}
    >
      <Text importantForAccessibility="no" style={styles.iconGlyph}>
        {glyph}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Label style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Label style={[styles.tabText, active && styles.tabTextActive]}>{o.label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

const checkColor = (hex: string): string =>
  parseInt(hex.slice(1, 3), 16) * 0.299 +
    parseInt(hex.slice(3, 5), 16) * 0.587 +
    parseInt(hex.slice(5, 7), 16) * 0.114 >
  150
    ? '#0A0A0A'
    : '#FFFFFF';

export function Swatch({
  hex,
  label,
  selected,
  onPress,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.swatchRing, selected && styles.swatchRingOn]}
    >
      <View style={[styles.swatch, { backgroundColor: hex }]}>
        {selected ? (
          <Text importantForAccessibility="no" style={{ color: checkColor(hex), fontSize: 16 }}>
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  fontFamily,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  fontFamily?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Label
        style={[styles.chipText, selected && styles.chipTextOn, fontFamily ? { fontFamily } : null]}
      >
        {label}
      </Label>
    </Pressable>
  );
}

export function StateView({
  kind,
  title,
  message,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error' | 'offline';
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.state}>
      {kind === 'loading' ? <ActivityIndicator color={colors.ink} size="large" /> : null}
      <Label style={styles.stateTitle}>
        {title ??
          (kind === 'loading'
            ? t('state.loading')
            : kind === 'offline'
              ? t('state.offline.title')
              : kind === 'error'
                ? t('state.error.title')
                : t('state.empty.title'))}
      </Label>
      {message ? <Label style={styles.stateMessage}>{message}</Label> : null}
      {onRetry && kind !== 'loading' && kind !== 'empty' ? (
        <SecondaryButton label={t('state.retry')} onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function Banner({ text, tone }: { text: string; tone: 'info' | 'danger' }) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, tone === 'danger' && { backgroundColor: colors.dangerBg }]}
    >
      <Label style={[styles.bannerText, tone === 'danger' && { color: colors.danger }]}>
        {text}
      </Label>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
  mono: { fontFamily: fonts.mono },
  primary: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryOff: { backgroundColor: colors.inkDisabled },
  primaryText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 16 },
  secondary: {
    minHeight: MIN_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryText: { fontFamily: fonts.semibold },
  off: { opacity: 0.4 },
  icon: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    borderRadius: MIN_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 20, color: colors.ink },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.segmented,
    borderRadius: radius.segmented,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 14, color: colors.inkSecondary },
  segmentTextActive: { color: colors.ink, fontFamily: fonts.semibold },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: {
    flex: 1,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.ink },
  tabText: { color: colors.inkSecondary },
  tabTextActive: { color: colors.ink, fontFamily: fonts.semibold },
  swatchRing: {
    width: MIN_TARGET + 4,
    height: MIN_TARGET + 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchRingOn: { borderColor: colors.ink },
  swatch: {
    width: MIN_TARGET - 4,
    height: MIN_TARGET - 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 40,
    minWidth: MIN_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14 },
  chipTextOn: { color: colors.surface },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateTitle: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, textAlign: 'center' },
  stateMessage: { color: colors.inkSecondary, textAlign: 'center' },
  banner: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  bannerText: { fontSize: 13, lineHeight: 18 },
});
