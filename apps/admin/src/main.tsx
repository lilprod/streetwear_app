import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app';
import './index.css';
import { initSentry } from './sentry';

initSentry(import.meta.env.VITE_SENTRY_DSN, import.meta.env.VITE_APP_ENV);

async function start() {
  if (import.meta.env.VITE_USE_MSW === 'true') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('Élément #root introuvable');
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void start();
