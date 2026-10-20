/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USE_MSW: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_APP_ENV: string;
}
