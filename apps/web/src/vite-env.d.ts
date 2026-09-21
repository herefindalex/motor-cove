/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOTORCOVE_API_URL?: string;
  readonly VITE_MOTORCOVE_DEMO_WALLET?: string;
  readonly VITE_MOTORCOVE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
