import type { CSSProperties } from "react";

// Yoki Arcade design tokens: Poppins body + Press Start 2P arcade labels,
// cyber-cyan + dojo-amber + win-green + loss-red palette. Mirrors the
// launch app's visual chrome so the monitor reads as the same product.

export const DOJO_AMBER = "#e8a94a";
export const DOJO_EMBER = "#ff7a2a";
export const LOSS_RED = "#f87171";
export const WIN_GREEN = "#4ade80";
export const CYBER = "#00D1FF";
export const GOLD = "#C9A84C";
export const BORDER_GOLD = "rgba(201,168,76,0.5)";
export const BORDER_GOLD_SUBTLE = "rgba(201,168,76,0.25)";

export const FONT_BODY = "'Poppins', sans-serif";
export const FONT_ARCADE = "'Press Start 2P', monospace";

export const theme: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    width: "100%",
    padding: "32px 16px 64px",
    color: "rgba(255,255,255,0.95)",
    fontFamily: FONT_BODY,
    boxSizing: "border-box",
  },
  shell: {
    maxWidth: "720px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  card: {
    position: "relative",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "20px 22px",
    boxShadow: "0 0 18px rgba(0,209,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  cardWithGoldEdge: {
    border: `1px solid ${BORDER_GOLD_SUBTLE}`,
    boxShadow: "0 0 18px rgba(0,209,255,0.08), 0 0 24px rgba(232,169,74,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
  },
};
