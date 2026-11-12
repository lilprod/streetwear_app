import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { getApi } from '../../api';
import { endSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN } from '../../theme';
import { Banner, Label, PrimaryButton, SecondaryButton } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { TextField } from '../../ui/TextField';
import { getStorage } from '../../storage';
import { clearCodes } from '../notifications/codes';
import { clearAttempt } from '../payment/flow';
import { resetCheckout } from '../reception/store';

export const normalizeConfirmation = (v: string): string => v.trim().toLocaleUpperCase('fr-FR');

/** Suppression (anonymisation) du compte : confirmation explicite par saisie du mot demandé. */
export function DeleteAccountScreen() {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const expected = t('delete.word');
  const confirmed = normalizeConfirmation(word) === expected;

  const submit = async () => {
    if (!confirmed) return;
    setBusy(true);
    setFailed(false);
    try {
      await getApi().deleteMe();
      const storage = getStorage();
      clearCodes(storage);
      clearAttempt(storage);
      resetCheckout();
      await endSession();
      router.replace('/');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('delete.title')} onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Banner tone="danger" text={t('delete.warning')} />
          <Label>{t('delete.orders')}</Label>
          {failed ? <Banner tone="danger" text={t('delete.error')} /> : null}
          <TextField
            label={t('delete.confirmLabel', { word: expected })}
            value={word}
            onChangeText={setWord}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <PrimaryButton
            label={t('delete.confirm')}
            disabled={!confirmed}
            loading={busy}
            onPress={() => void submit()}
          />
          <SecondaryButton label={t('delete.cancel')} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: SCREEN_MARGIN, gap: 16 },
});
