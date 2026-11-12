import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatTgPhone } from '@streetwear/shared';
import { getApi } from '../../api';
import { useSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors } from '../../theme';
import { Banner, Label, PrimaryButton } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { TextField } from '../../ui/TextField';
import { checkProfile, saveProfile } from '../auth/flow';

export function ProfileScreen() {
  const user = useSession((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [fieldError, setFieldError] = useState<{ name?: string; email?: string }>({});
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName((n) => n || (user?.name ?? ''));
    setEmail((m) => m || (user?.email ?? ''));
  }, [user]);

  const save = async () => {
    const check = checkProfile(name, email);
    if (check.error) {
      setFieldError(
        check.error === 'name'
          ? { name: t('profile.invalidName') }
          : { email: t('profile.invalidEmail') },
      );
      return;
    }
    setFieldError({});
    setBusy(true);
    setMessage(null);
    try {
      await saveProfile(getApi(), check.name as string, check.email);
      setMessage({ tone: 'info', text: t('profile.saved') });
    } catch (e) {
      const used = (e as { code?: string }).code === 'EMAIL_ALREADY_USED';
      setMessage({ tone: 'danger', text: used ? t('profile.emailUsed') : t('profile.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('profile.title')} onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {message ? <Banner tone={message.tone} text={message.text} /> : null}
          <TextField
            label={t('profile.name')}
            value={name}
            onChangeText={setName}
            error={fieldError.name}
            autoComplete="name"
          />
          <TextField
            label={t('profile.email')}
            value={email}
            onChangeText={setEmail}
            error={fieldError.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <View style={styles.phone}>
            <Label style={styles.muted}>{t('profile.phone')}</Label>
            <Label mono>{user?.phone ? formatTgPhone(user.phone) : t('profile.phone.none')}</Label>
          </View>
          <PrimaryButton label={t('profile.save')} loading={busy} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: SCREEN_MARGIN, gap: 16 },
  phone: { gap: 4 },
  muted: { color: colors.inkSecondary, fontSize: 14 },
});
