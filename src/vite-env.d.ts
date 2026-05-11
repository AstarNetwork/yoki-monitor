/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SONEIUM_RPC_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_TREASURY_BALANCE_JSONL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
