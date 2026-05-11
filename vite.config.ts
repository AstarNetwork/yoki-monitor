import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// gh-pages serves the site under `/yoki-monitor/` once the repo is published
// to AstarNetwork/yoki-monitor. Override via VITE_BASE_PATH locally if you
// want to preview against `/`.
const basePath = process.env.VITE_BASE_PATH ?? "/yoki-monitor/";

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    target: "es2020",
    sourcemap: true,
  },
});
