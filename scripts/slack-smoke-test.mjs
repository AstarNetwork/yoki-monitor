#!/usr/bin/env node
// Manual Slack smoke test. Posts one INFO + one WARN + one CRITICAL
// synthetic alert to validate the webhook + formatting end-to-end without
// waiting for a real threshold breach.
//
// Triggered via .github/workflows/slack-smoke-test.yml workflow_dispatch.
// Safe to delete the workflow + this script once you've validated the
// pipeline; nothing else in the repo depends on either.

import { postSlack } from "./lib/slack.mjs";

const SEVERITIES = ["INFO", "WARN", "CRITICAL"];

async function main() {
  const sentAt = new Date().toISOString();
  for (const severity of SEVERITIES) {
    await postSlack({
      severity,
      title: `Smoke test (${severity}) — yoki-monitor pipeline check`,
      fields: [
        { label: "Sent at", value: sentAt },
        { label: "Note", value: "Manual smoke test. No action required." },
      ],
    });
    console.log(`[smoke-test] posted ${severity}`);
  }
}

main().catch((err) => {
  console.error("[smoke-test] error:", err);
  process.exit(1);
});
