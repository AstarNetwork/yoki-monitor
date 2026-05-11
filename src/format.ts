import { formatUnits } from "viem";

import { ASTR_DECIMALS } from "./addresses";

// Format a wei BigInt as a fixed-decimal ETH string. Mirrors the launch app's
// useTokenBalance display: keeps 4 decimals so 0.0247 ETH is legible at the
// thresholds we care about (0.01 warn / 0.005 critical).
export function formatEth(wei: bigint, decimals = 4): string {
  const raw = formatUnits(wei, 18);
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(decimals);
}

// Format an ASTR BigInt with thousands separators and no decimals (treasury
// balances are large; decimals add noise without information).
export function formatAstr(wei: bigint): string {
  const raw = formatUnits(wei, ASTR_DECIMALS);
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return "—";
  return Math.round(num).toLocaleString("en-US");
}

// Signed ASTR delta for the 24h-inflow line. Returns "+1,250" or "-340".
export function formatAstrDelta(deltaWei: bigint): string {
  const raw = formatUnits(deltaWei, ASTR_DECIMALS);
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return "—";
  const rounded = Math.round(num);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : "";
  return `${sign}${rounded.toLocaleString("en-US")}`;
}

// "0xfA2B0790…907f" abbreviation pattern matching the launch app header.
export function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 10)}…${address.slice(-4)}`;
}

// "HH:MM:SS UTC" for the last-refresh label.
export function formatUtcTime(date: Date): string {
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mm = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}
