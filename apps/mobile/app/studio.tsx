import { useLocalSearchParams } from 'expo-router';
import { StudioScreen } from '../src/features/studio/StudioScreen';

export default function StudioRoute() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  return <StudioScreen draftId={draft} />;
}
