import { StyleSheet, View } from 'react-native';
import { t } from '../../i18n/fr';
import { colors, radius } from '../../theme';
import { Banner, Label, SecondaryButton } from '../../ui/controls';
import type { Availability, Unavailable } from './availability';

const TITLE = {
  pattern: 'studio.unavailable.pattern',
  font: 'studio.unavailable.font',
  color: 'studio.unavailable.color',
} as const;

export const noticeTestId = (u: Unavailable) => `layer-unavailable-${u.layerId ?? 'color'}`;

export function UnavailableNotices({
  availability,
  onReplace,
  onRemove,
}: {
  availability: Availability;
  onReplace: (item: Unavailable) => void;
  onRemove: (layerId: string) => void;
}) {
  const { unavailable, unverified } = availability;
  if (unavailable.length === 0 && unverified.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {unavailable.map((u) => {
        const title = t(TITLE[u.kind]);
        const hint = t(
          u.kind === 'color' ? 'studio.unavailable.hint.color' : 'studio.unavailable.hint',
        );
        return (
          <View
            key={`${u.kind}-${u.layerId ?? 'color'}`}
            testID={noticeTestId(u)}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${title}. ${hint}`}
            style={styles.row}
          >
            <Label style={styles.title}>{title}</Label>
            <Label style={styles.hint}>{hint}</Label>
            <View style={styles.actions}>
              <SecondaryButton
                testID={`${noticeTestId(u)}-replace`}
                label={t('studio.unavailable.replace')}
                onPress={() => onReplace(u)}
              />
              {u.layerId ? (
                <SecondaryButton
                  testID={`${noticeTestId(u)}-remove`}
                  label={t('studio.unavailable.remove')}
                  onPress={() => onRemove(u.layerId as string)}
                />
              ) : null}
            </View>
          </View>
        );
      })}
      {unavailable.length === 0 ? (
        <Banner testID="studio-unverified" tone="info" text={t('studio.unverified')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  row: { backgroundColor: colors.dangerBg, borderRadius: radius.field, padding: 12, gap: 6 },
  title: { color: colors.danger, fontWeight: '600' },
  hint: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
