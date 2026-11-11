import { router, useLocalSearchParams } from 'expo-router';
import { StudioScreen } from '../../src/features/studio/StudioScreen';

export default function StudioRoute() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  return (
    <StudioScreen
      key={draft ?? 'current'}
      draftId={draft}
      hideBack
      onContinue={(localId) =>
        router.push({ pathname: '/purchase/size', params: { draft: localId } })
      }
    />
  );
}
