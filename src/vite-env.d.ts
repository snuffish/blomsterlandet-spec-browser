/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the stock CORS bridge (see worker/README.md). Inlined at build time.
   * Unset disables live stock entirely and the app behaves as it did before the feature.
   */
  readonly VITE_STOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
