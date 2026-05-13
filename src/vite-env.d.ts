/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SONEIUM_RPC_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_TREASURY_BALANCE_JSONL_URL?: string;
  readonly VITE_TREASURY_INFLOWS_JSONL_URL?: string;
  readonly VITE_JKP_AGGREGATE_JSON_URL?: string;
  readonly VITE_LEADERBOARD_ENABLED?: string;
  readonly VITE_REVIEW_KEY?: string;
  readonly VITE_FLAGGED_JSON_URL?: string;
  readonly VITE_SUSPICIOUS_PAIRS_JSON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
