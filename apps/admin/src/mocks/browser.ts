import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { ordersHandlers } from './orders-handlers';

export const worker = setupWorker(...handlers, ...ordersHandlers);
