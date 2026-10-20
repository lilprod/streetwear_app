import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { t } from '../src/i18n/fr';
import { Label, PrimaryButton, SecondaryButton } from '../src/ui/controls';
import { fonts } from '../src/theme';

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <Label style={styles.title}>{t('home.title')}</Label>
      <PrimaryButton label={t('home.createDesign')} onPress={() => router.push('/studio')} />
      <SecondaryButton label={t('home.myDesigns')} onPress={() => router.push('/designs')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 20, gap: 12 },
  title: {
    fontFamily: fonts.bold,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    marginBottom: 24,
  },
});
