import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatTgPhone } from '@streetwear/shared';
import { getApi } from '../../api';
import type { OAuthProvider } from '../../api/types';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts } from '../../theme';
import { Banner, Label, PrimaryButton, SecondaryButton } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { TextField } from '../../ui/TextField';
import { syncGuestCartToAccount } from '../cart/store';
import {
  checkProfile,
  describeLoginError,
  formatPhoneInput,
  requestCode,
  saveProfile,
  signInWithProvider,
  toE164,
  verifyCode,
} from './flow';
import { getSocialProvider } from './social';

type Step = 'phone' | 'code' | 'profile';

export function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'phone' | 'name' | 'email' | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const finish = async () => {
    await syncGuestCartToAccount();
    if (next === 'reception') router.replace('/purchase/reception');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const afterAuth = async (user: { name: string | null }) => {
    if (user.name) await finish();
    else setStep('profile');
  };

  const onSendCode = (resend = false) =>
    run(async () => {
      if (!toE164(phone)) {
        setFieldError('phone');
        setError(t('login.phone.invalid'));
        return;
      }
      setFieldError(null);
      try {
        await requestCode(getApi(), phone);
        setCode('');
        setStep('code');
        if (resend) setNotice(t('login.code.resent'));
      } catch (e) {
        setError(describeLoginError(e).message);
      }
    });

  const onVerify = (value: string) =>
    run(async () => {
      try {
        const result = await verifyCode(getApi(), phone, value);
        await afterAuth(result.user);
      } catch (e) {
        const failure = describeLoginError(e);
        setError(failure.message);
        setCode('');
      }
    });

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void onVerify(digits);
  };

  const onSocial = (provider: OAuthProvider) =>
    run(async () => {
      const social = getSocialProvider(provider);
      if (!social?.isAvailable()) {
        setError(t('login.social.unavailable'));
        return;
      }
      try {
        const token = await social.getIdToken();
        if (!token) {
          setNotice(t('login.social.cancelled'));
          return;
        }
        const result = await signInWithProvider(getApi(), provider, token);
        await afterAuth(result.user);
      } catch (e) {
        setError(describeLoginError(e).message);
      }
    });

  const onSaveProfile = () =>
    run(async () => {
      const check = checkProfile(name, email);
      if (check.error || !check.name) {
        setFieldError(check.error ?? 'name');
        return;
      }
      setFieldError(null);
      try {
        await saveProfile(getApi(), check.name, check.email);
        await finish();
      } catch (e) {
        const used = (e as { code?: string }).code === 'EMAIL_ALREADY_USED';
        setError(used ? t('login.profile.emailUsed') : t('login.profile.error'));
      }
    });

  const apple = getSocialProvider('apple');
  const google = getSocialProvider('google');
  const phoneLabel = toE164(phone) ? formatTgPhone(toE164(phone) as string) : '';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('login.title')}
        onBack={() => {
          if (step === 'code') setStep('phone');
          else if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="danger" text={error} /> : null}
          {notice ? <Banner tone="info" text={notice} /> : null}

          {step === 'phone' ? (
            <>
              <Label style={styles.lead}>{t('login.subtitle')}</Label>
              <TextField
                label={t('login.phone.label')}
                prefix={t('login.phone.prefix')}
                mono
                value={phone}
                onChangeText={(v) => setPhone(formatPhoneInput(v))}
                placeholder={t('login.phone.placeholder')}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                error={fieldError === 'phone' ? t('login.phone.invalid') : null}
                onSubmitEditing={() => void onSendCode()}
              />
              <PrimaryButton
                label={t('login.send')}
                loading={busy}
                onPress={() => void onSendCode()}
              />
              {apple?.isAvailable() || google?.isAvailable() ? (
                <Label style={styles.or}>{t('login.or')}</Label>
              ) : null}
              {apple?.isAvailable() ? (
                <SecondaryButton
                  label={t('login.apple')}
                  disabled={busy}
                  onPress={() => void onSocial('apple')}
                />
              ) : null}
              {google?.isAvailable() ? (
                <SecondaryButton
                  label={t('login.google')}
                  disabled={busy}
                  onPress={() => void onSocial('google')}
                />
              ) : null}
            </>
          ) : null}

          {step === 'code' ? (
            <>
              <Label accessibilityRole="header" style={styles.h2}>
                {t('login.code.title')}
              </Label>
              <Label style={styles.lead}>{t('login.code.subtitle', { phone: phoneLabel })}</Label>
              <TextField
                label={t('login.code.label')}
                mono
                value={code}
                onChangeText={onCodeChange}
                placeholder={t('login.code.placeholder')}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                importantForAutofill="yes"
                autoFocus
              />
              <PrimaryButton
                label={t('login.code.verify')}
                loading={busy}
                disabled={code.length !== 6}
                onPress={() => void onVerify(code)}
              />
              <SecondaryButton
                label={t('login.code.resend')}
                disabled={busy}
                onPress={() => void onSendCode(true)}
              />
              <SecondaryButton
                label={t('login.code.change')}
                disabled={busy}
                onPress={() => setStep('phone')}
              />
            </>
          ) : null}

          {step === 'profile' ? (
            <>
              <Label accessibilityRole="header" style={styles.h2}>
                {t('login.profile.title')}
              </Label>
              <Label style={styles.lead}>{t('login.profile.subtitle')}</Label>
              <TextField
                label={t('login.profile.name')}
                value={name}
                onChangeText={setName}
                textContentType="name"
                autoComplete="name"
                error={fieldError === 'name' ? t('login.profile.invalidName') : null}
              />
              <TextField
                label={t('login.profile.email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                autoComplete="email"
                error={fieldError === 'email' ? t('login.profile.invalidEmail') : null}
              />
              <PrimaryButton
                label={t('login.profile.save')}
                loading={busy}
                onPress={() => void onSaveProfile()}
              />
            </>
          ) : null}
          <View />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: SCREEN_MARGIN, gap: 16 },
  lead: { color: colors.inkSecondary },
  h2: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  or: { textAlign: 'center', color: colors.inkSecondary },
});
