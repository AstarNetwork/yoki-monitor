import { BLOCKSCOUT_API_BASE } from "./addresses";

// Soneium Blockscout v2 REST helpers. Kept small — only the endpoints
// we actually call.

export type TokenInfo = {
  // Blockscout v2 token response includes many fields; we only need this one.
  holders_count?: string;
};

export async function fetchTokenInfo(token: string, signal?: AbortSignal): Promise<TokenInfo> {
  const res = await fetch(`${BLOCKSCOUT_API_BASE}/tokens/${token}`, { signal });
  if (!res.ok) throw new Error(`Blockscout token info ${res.status}`);
  return (await res.json()) as TokenInfo;
}

export type BlockscoutLog = {
  address: { hash: string };
  block_number: number;
  block_hash: string;
  data: string;
  index: number;
  topics: (string | null)[];
  tx_hash?: string;
  transaction_hash?: string;
  // Soneium Blockscout returns `block_timestamp` as ISO 8601. We tolerate
  // the older `timestamp` field name too in case the deployment is
  // upgraded mid-flight.
  block_timestamp?: string;
  timestamp?: string;
};

export type LogsPage = {
  items: BlockscoutLog[];
  next_page_params: Record<string, string | number> | null;
};

// Fetch one page of address logs. Verified 2026-05-11: Soneium Blockscout
// rejects `topic_0`/`topic0` query filters with 422, so topic filtering
// happens client-side. `extra` is the `next_page_params` object returned
// by the previous page; pass through verbatim.
export async function fetchAddressLogsPage(
  address: string,
  extra?: Record<string, string | number> | null,
  signal?: AbortSignal,
): Promise<LogsPage> {
  let url = `${BLOCKSCOUT_API_BASE}/addresses/${address}/logs`;
  if (extra && Object.keys(extra).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extra)) {
      params.append(key, String(value));
    }
    url += `?${params.toString()}`;
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Blockscout logs ${res.status}`);
  return (await res.json()) as LogsPage;
}

// Walk paginated logs newest-first. Stops when `stopBefore(log)` returns
// true on the FIRST log of a page (we've crossed out of the window). On
// each page, keeps only logs that pass `keep(log)` — used for client-side
// topic filtering. Caps at `maxPages` for safety.
export async function walkAddressLogs(
  address: string,
  stopBefore: (log: BlockscoutLog) => boolean,
  keep: (log: BlockscoutLog) => boolean,
  maxPages = 80,
  signal?: AbortSignal,
): Promise<BlockscoutLog[]> {
  const collected: BlockscoutLog[] = [];
  let cursor: Record<string, string | number> | null | undefined = undefined;

  for (let i = 0; i < maxPages; i++) {
    const page = await fetchAddressLogsPage(address, cursor, signal);
    for (const log of page.items) {
      if (stopBefore(log)) return collected;
      if (keep(log)) collected.push(log);
    }
    if (!page.next_page_params) return collected;
    cursor = page.next_page_params;
  }
  return collected;
}
