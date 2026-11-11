import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { t } from '../i18n/fr';
import { useOnline } from '../features/studio/hooks';
import { colors } from '../theme';
import { Banner } from './controls';

/** Conteneur d'écran : zones sûres et bandeau « hors ligne » commun à tous les écrans. */
export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: Edge[] }) {
  const online = useOnline();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {online ? null : <Banner tone="info" text={t('state.offline.banner')} />}
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface } });
