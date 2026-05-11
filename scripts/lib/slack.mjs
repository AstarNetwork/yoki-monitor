// POST a structured alert to Slack via incoming-webhook. Webhook URL is read
// from SLACK_WEBHOOK_URL_ALERTS env. If unset, logs to stderr and returns
// (so dev/testing runs don't fail).

const SEVERITY_EMOJI = {
  CRITICAL: ":rotating_light:",
  WARN: ":warning:",
  INFO: ":information_source:",
};

export async function postSlack({ severity, title, fields = [] }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL_ALERTS;
  if (!webhookUrl) {
    console.warn(`[slack] no webhook configured, would have posted: [${severity}] ${title}`);
    return;
  }

  const emoji = SEVERITY_EMOJI[severity] ?? ":mega:";
  const text = `${emoji} *${severity}* — ${title}`;

  const blocks = [{ type: "section", text: { type: "mrkdwn", text } }];
  if (fields.length > 0) {
    // Slack section blocks accept up to 10 fields.
    blocks.push({
      type: "section",
      fields: fields.slice(0, 10).map((f) => ({
        type: "mrkdwn",
        text: `*${f.label}*\n${f.value}`,
      })),
    });
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
  }
}

export function blockscoutAddressUrl(address) {
  return `https://soneium.blockscout.com/address/${address}`;
}

export function blockscoutTxUrl(txHash) {
  return `https://soneium.blockscout.com/tx/${txHash}`;
}
