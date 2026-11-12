import { catalogHandlers, resetCatalogState } from './catalog-handlers';
import { dashboardHandlers } from './dashboard-handlers';
import { paymentsHandlers } from './payments-handlers';
import { settingsHandlers, resetSettingsState } from './settings-handlers';
import { resetTeamState, teamHandlers } from './team-handlers';

export const adminModulesHandlers = [
  ...catalogHandlers,
  ...dashboardHandlers,
  ...paymentsHandlers,
  ...settingsHandlers,
  ...teamHandlers,
];

export const resetAdminModulesState = (): void => {
  resetCatalogState();
  resetSettingsState();
  resetTeamState();
};
