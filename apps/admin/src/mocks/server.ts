import { setupServer } from 'msw/node';
import { handlers } from './handlers';
import { ordersHandlers } from './orders-handlers';

export const server = setupServer(...handlers, ...ordersHandlers);
