import { Text, View } from 'react-native';
import { fr } from '../src/i18n/fr';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{fr['home.title']}</Text>
    </View>
  );
}
