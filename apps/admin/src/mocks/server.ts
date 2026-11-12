import { setupServer } from 'msw/node';
import { handlers } from './handlers';
import { ordersHandlers } from './orders-handlers';
import { logisticsHandlers } from './logistics-handlers';

export const server = setupServer(...handlers, ...ordersHandlers, ...logisticsHandlers);
