import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { ordersHandlers } from './orders-handlers';
import { adminModulesHandlers } from './admin-modules-handlers';

export const worker = setupWorker(...handlers, ...ordersHandlers, ...adminModulesHandlers);
