import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatTgPhone } from '@streetwear/shared';
import { endSession, useSession } from '../../auth/session';
import { t, type FrKey } from '../../i18n/fr';
import { MIN_TARGET, SCREEN_MARGIN, colors, fonts } from '../../theme';
import { Banner, Label, PrimaryButton, SecondaryButton } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';

type Row = { key: FrKey; route: string };

const MEMBER_ROWS: Row[] = [
  { key: 'account.profile', route: '/account/profile' },
  { key: 'account.addresses', route: '/account/addresses' },
  { key: 'account.designs', route: '/designs' },
  { key: 'account.orders', route: '/orders' },
];
const LEGAL_ROWS: Row[] = [
  { key: 'account.legal', route: '/account/legal' },
  { key: 'account.terms', route: '/account/terms' },
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <View style={styles.group}>
      {rows.map((row) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={t(row.key)}
          onPress={() => router.push(row.route)}
          style={styles.row}
        >
          <Label style={styles.rowText}>{t(row.key)}</Label>
          <Label importantForAccessibility="no" style={styles.chevron}>
            ›
          </Label>
        </Pressable>
      ))}
    </View>
  );
}

export function AccountScreen() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const expired = useSession((s) => s.expired);
  const who = user?.name ?? (user?.phone ? formatTgPhone(user.phone) : '');
  return (
    <Screen>
      <ScreenHeader title={t('account.title')} />
      <ScrollView contentContainerStyle={styles.body}>
        {expired ? <Banner tone="info" text={t('session.expired')} /> : null}
        {status === 'authenticated' ? (
          <>
            {who ? <Label style={styles.who}>{t('account.signedAs', { who })}</Label> : null}
            <Rows rows={MEMBER_ROWS} />
          </>
        ) : (
          <>
            <Label style={styles.muted}>{t('account.guest')}</Label>
            <PrimaryButton
              label={t('account.login')}
              onPress={() => router.push('/purchase/login')}
            />
          </>
        )}
        <Rows rows={LEGAL_ROWS} />
        {status === 'authenticated' ? (
          <View style={styles.group}>
            <SecondaryButton label={t('account.logout')} onPress={() => void endSession()} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('account.delete')}
              onPress={() => router.push('/account/delete')}
              style={styles.danger}
            >
              <Label style={styles.dangerText}>{t('account.delete')}</Label>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 20 },
  group: { gap: 8 },
  who: { fontFamily: fonts.semibold },
  muted: { color: colors.inkSecondary },
  row: {
    minHeight: MIN_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { fontSize: 16 },
  chevron: { fontSize: 22, color: colors.inkSecondary },
  danger: { minHeight: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontFamily: fonts.semibold },
});
