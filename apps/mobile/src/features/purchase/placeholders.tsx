import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { t, type FrKey } from '../../i18n/fr';
import { SCREEN_MARGIN } from '../../theme';
import { PrimaryButton, StateView } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';

/** Emplacement navigable des étapes du lot B (réception, paiement, confirmation). */
function StepPlaceholder({ labelKey }: { labelKey: FrKey }) {
  return (
    <Screen>
      <ScreenHeader title={t(labelKey)} onBack={() => router.back()} />
      <StateView kind="empty" title={t(labelKey)} message={t('placeholder.soon')} />
      <View style={styles.cta}>
        <PrimaryButton label={t('placeholder.home')} onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

export const ReceptionPlaceholder = () => <StepPlaceholder labelKey="reception.title" />;
export const PaymentPlaceholder = () => <StepPlaceholder labelKey="payment.title" />;
export const ConfirmationPlaceholder = () => <StepPlaceholder labelKey="confirmation.title" />;

export function OrdersPlaceholder() {
  return (
    <Screen>
      <ScreenHeader title={t('orders.title')} />
      <StateView kind="empty" title={t('orders.empty.title')} message={t('orders.empty.message')} />
    </Screen>
  );
}

const styles = StyleSheet.create({ cta: { padding: SCREEN_MARGIN } });
