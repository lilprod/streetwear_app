import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatTgPhone } from '@streetwear/shared';
import { endSession, useSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors } from '../../theme';
import { Banner, Label, PrimaryButton, SecondaryButton } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';

/** Point d'accroche du lot B : profil, adresses, designs, commandes, suppression du compte, mentions. */
export function AccountScreen() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const expired = useSession((s) => s.expired);
  const who = user?.name ?? (user?.phone ? formatTgPhone(user.phone) : '');
  return (
    <Screen>
      <ScreenHeader title={t('account.title')} />
      <View style={styles.body}>
        {expired ? <Banner tone="info" text={t('session.expired')} /> : null}
        {status === 'authenticated' ? (
          <>
            {who ? <Label>{t('account.signedAs', { who })}</Label> : null}
            <SecondaryButton label={t('account.logout')} onPress={() => void endSession()} />
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 16 },
  muted: { color: colors.inkSecondary },
});
