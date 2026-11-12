import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN } from '../../theme';
import { Banner, Label } from '../../ui/controls';
import { ScreenHeader } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';

export function LegalScreen({ kind }: { kind: 'mentions' | 'terms' }) {
  const title = kind === 'mentions' ? t('legal.mentions.title') : t('legal.terms.title');
  const body = kind === 'mentions' ? t('legal.mentions.body') : t('legal.terms.body');
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <Banner tone="info" text={t('legal.draft')} />
        <Label>{body}</Label>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { padding: SCREEN_MARGIN, gap: 16 } });
