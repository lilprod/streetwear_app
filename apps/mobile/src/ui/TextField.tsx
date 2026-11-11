import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MAX_FONT_SCALE, MIN_TARGET, colors, fonts, radius } from '../theme';
import { Label } from './controls';

export function TextField({
  label,
  error,
  prefix,
  mono,
  style,
  ...rest
}: TextInputProps & { label: string; error?: string | null; prefix?: string; mono?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Label style={styles.label}>{label}</Label>
      <View style={[styles.field, !!error && styles.fieldError]}>
        {prefix ? (
          <Label mono accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Label>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={colors.inkDisabled}
          style={[styles.input, mono && styles.mono, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Label accessibilityRole="alert" style={styles.error}>
          {error}
        </Label>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.ink,
  },
  mono: { fontFamily: fonts.mono, letterSpacing: 2 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
