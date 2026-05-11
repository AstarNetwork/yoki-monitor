# yoki-monitor

Operational health dashboard for [Yoki Arcade](https://yoki-arcade.astar.network) on Soneium. Live at [`astarnetwork.github.io/yoki-monitor`](https://astarnetwork.github.io/yoki-monitor/).

## Phase 1 (current)

A single-page SPA showing:

- **MINTER hot-wallet ETH balance** (`0x3dAd…4DDD`) with warn/critical thresholds (< 0.01 / < 0.005 ETH).
- **Yoki Treasury ASTR balance** (`0xfA2B…907f`).

Both balances are read live via viem on page load and refreshed every 60 seconds while the tab is visible.

The Phase 1 GitHub Actions cron workers (MINTER balance alert, treasury balance snapshotter, treasury inflow/outflow walker) live alongside the SPA in this repo and will commit JSONL data to `data/` for the Phase 2 chart layer.

## Local development

```bash
npm install
npm run dev
```

By default, the Vite config serves under base path `/yoki-monitor/` (matching the gh-pages deploy URL). To preview at `/` locally:

```bash
VITE_BASE_PATH=/ npm run dev
```

## Configuration

### SPA env vars (build-time, in Vercel/Amplify-style)

All optional. Falls back gracefully:

| Var | Default | Purpose |
|---|---|---|
| `VITE_SONEIUM_RPC_URL` | Soneium public RPC | Alchemy/dRPC paid endpoint if public RPC is throttling. |
| `VITE_BASE_PATH` | `/yoki-monitor/` | Override for non-gh-pages hosting paths. |
| `VITE_TREASURY_BALANCE_JSONL_URL` | unset | URL to the public `treasury-balance.jsonl` from Phase 1.2 cron. Page hides 24h-delta when absent. |

### Cron secrets + variables (set in repo Settings → Secrets and variables → Actions)

| Name | Type | Used by | Purpose |
|---|---|---|---|
| `SONEIUM_RPC_URL` | secret | all crons | Alchemy/dRPC URL. Falls back to viem's built-in Soneium public RPC if unset. |
| `SLACK_WEBHOOK_URL_ALERTS` | secret | 1.1 / 1.3 | Slack incoming-webhook URL for the operator alerts channel. |
| `TREASURY_OUTFLOW_DRY_RUN` | variable | 1.3 | Set to `true` until treasury custody owner confirms expected outflows; flip to empty/false for live alerts. |
| `TREASURY_HEARTBEAT` | variable | 1.2 | Set to `true` for the first 7 days to confirm the cron is firing; mute afterwards. |

## Deployment

Production deploys to `https://astarnetwork.github.io/yoki-monitor/` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) using the official `actions/deploy-pages` action (no `gh-pages` branch).

Pushing to `main` triggers a build + deploy automatically, EXCEPT when the only changes are under `data/**` or `**/*.md` — those are cron-driven and don't affect the SPA. Manual rebuilds: Actions → "1.4 Deploy SPA to GitHub Pages" → Run workflow.

Optional build-time variable:

| Name | Type | Purpose |
|---|---|---|
| `VITE_SONEIUM_RPC_URL` | repo variable | Paid Alchemy/dRPC URL baked into the SPA. Falls back to Soneium public RPC if unset. |

## Phase 1 cron workers

Three GitHub Actions workflows under `.github/workflows/`:

| Workflow | Cadence | What it does |
|---|---|---|
| `minter-balance.yml` (1.1) | every 15 min | Read MINTER ETH balance, append to `data/minter-balance.jsonl`, Slack alert on warn/critical threshold cross (60-min same-severity throttle). |
| `treasury-balance.yml` (1.2) | every hour | Read treasury ASTR balance, append to `data/treasury-balance.jsonl`. Silent unless `TREASURY_HEARTBEAT=true`. |
| `treasury-flow.yml` (1.3) | every 15 min | Walk ASTR Transfer events to/from treasury since last checkpoint, append to `data/treasury-{inflows,outflows}.jsonl`, Slack CRITICAL on any outflow (dry-run gated until custody confirmed). |
| `bot-balances.yml` (1.7) | every hour | Read ETH + ASTR balance for the 5 matchmaking bot wallets (funding + bots 1–4) in parallel, append to `data/bot-balances.jsonl`. Silent — the bot Lambda owns its own auto-disable alerts. |

All three commit the JSONL deltas back to `main` from a bot identity. Concurrency-guarded so overlapping ticks serialize.

## What this is NOT

- Not preventive — surfaces signals, does not pause matches or freeze accounts.
- Not the full leaderboard dashboard — JKP per-address W/L/D, event log, and treasury growth chart land in Phase 2.
- Not an in-page alerts surface — alerting lives in the GitHub Actions cron workers and posts to an internal Slack channel.
