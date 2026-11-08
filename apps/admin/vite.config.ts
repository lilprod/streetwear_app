import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The API has no CORS: in dev, /v1 is proxied to it (same origin as in recette and production).
    proxy: { '/v1': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
