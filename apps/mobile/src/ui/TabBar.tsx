import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n/fr';
import { MIN_TARGET, colors, fonts } from '../theme';
import { Label } from './controls';

export type TabItem = { name: string; label: string; glyph: string };

export const TAB_ITEMS: TabItem[] = [
  { name: 'index', label: t('tab.home'), glyph: '⌂' },
  { name: 'studio', label: t('tab.studio'), glyph: '✎' },
  { name: 'orders', label: t('tab.orders'), glyph: '▤' },
  { name: 'account', label: t('tab.account'), glyph: '◉' },
];

export function TabBar({
  items = TAB_ITEMS,
  activeName,
  onSelect,
}: {
  items?: TabItem[];
  activeName: string;
  onSelect: (name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('tab.bar')}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      {items.map((item) => {
        const active = item.name === activeName;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.name)}
            style={styles.item}
          >
            <Text
              importantForAccessibility="no"
              style={[styles.glyph, { color: active ? colors.ink : colors.inkSecondary }]}
            >
              {item.glyph}
            </Text>
            <Label style={[styles.label, active && styles.labelOn]}>{item.label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingTop: 6,
  },
  item: {
    flex: 1,
    minHeight: MIN_TARGET + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 20, lineHeight: 24 },
  label: { fontSize: 11, lineHeight: 14, color: colors.inkSecondary },
  labelOn: { color: colors.ink, fontFamily: fonts.semibold },
});
