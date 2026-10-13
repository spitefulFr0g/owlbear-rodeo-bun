/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Empty to connect to the server that served the page */
  readonly VITE_BROKER_URL: string;
  readonly VITE_MAINTENANCE: string;
  /** The version in package.json, set by vite.config.mjs */
  readonly VITE_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
