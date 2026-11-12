import { configure } from '@testing-library/react-native';

// Sous Turborepo les suites tournent en parallèle : les attentes asynchrones (zone, paiement) ont plus de marge.
// Real timers + 400 ms debounces: under a parallel Turborepo run, 5 s is not enough.
configure({ asyncUtilTimeout: 10_000 });

jest.mock('../src/storage', () => {
  const mocks = jest.requireActual('./mocks') as typeof import('./mocks');
  const storage = jest.requireActual(
    '../src/storage/storage',
  ) as typeof import('../src/storage/storage');
  return { ...storage, getStorage: () => mocks.memoryStorage() };
});

jest.mock('expo-router', () => {
  const mocks = jest.requireActual('./mocks') as typeof import('./mocks');
  return {
    router: mocks.routerMock,
    useLocalSearchParams: () => mocks.routeParams,
    useFocusEffect: mocks.useFocusEffectMock,
  };
});

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@react-native-community/netinfo', () => {
  const mocks = jest.requireActual('./mocks') as typeof import('./mocks');
  return { __esModule: true, useNetInfo: mocks.useNetInfoMock, default: {} };
});

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const React = jest.requireActual('react') as typeof import('react');
  const MapView = React.forwardRef((props: { children?: React.ReactNode }, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return React.createElement(View, { testID: 'map' }, props.children);
  });
  MapView.displayName = 'MapView';
  const mocks = jest.requireActual('./mocks') as typeof import('./mocks');
  const Marker = (props: { onDragEnd?: (e: unknown) => void }) => {
    mocks.mapMarker.current = props;
    return React.createElement(View, { testID: 'marker' });
  };
  return { __esModule: true, default: MapView, Marker };
});
