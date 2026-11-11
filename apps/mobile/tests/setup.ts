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
