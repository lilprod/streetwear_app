import { Tabs } from 'expo-router/js-tabs';
import { TAB_ITEMS, TabBar } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          activeName={state.routes[state.index]?.name ?? 'index'}
          onSelect={(name) => {
            const route = state.routes.find((r) => r.name === name);
            if (route) navigateToTab(route.key);
          }}
        />
      )}
    >
      {TAB_ITEMS.map((item) => (
        <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
      ))}
    </Tabs>
  );
}
