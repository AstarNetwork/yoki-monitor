import type { CSSProperties } from "react";

import { FONT_ARCADE } from "../theme";

export function Footer() {
  return (
    <div style={styles.footer}>
      <div style={styles.line}>Detective control — surfaces signals, does not gate transactions</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingTop: "8px",
    textAlign: "center",
  },
  line: {
    fontFamily: FONT_ARCADE,
    fontSize: "8px",
    letterSpacing: "1px",
    color: "rgba(255,255,255,0.30)",
    textTransform: "uppercase",
  },
};
