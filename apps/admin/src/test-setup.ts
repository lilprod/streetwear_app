import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';
import { resetOrdersState } from './mocks/orders-handlers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  resetOrdersState();
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
