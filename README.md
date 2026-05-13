# yoki-monitor

Operational health dashboard for [Yoki Arcade](https://yoki-arcade.astar.network) on Soneium. Live at [`astarnetwork.github.io/yoki-monitor`](https://astarnetwork.github.io/yoki-monitor/).

## Phase 1 (live)

A single-page SPA showing:

- **MINTER hot-wallet ETH balance** (`0x3dAd…4DDD`) with warn/critical thresholds (< 0.01 / < 0.005 ETH).
- **Yoki Treasury ASTR balance** (`0xfA2B…907f`) + last-24h inflow line.
- **Matchmaking bot balances** (ETH + ASTR + PnL since launch for funding + bots 1–4).
- **Engagement row** — Cores holders, JKP 24h active players, JKP 7d active players.

Balances are read live via viem on page load and refreshed every 60 seconds while the tab is visible. JKP active-player counts and Cores holders are pulled from Soneium Blockscout REST and cached 5 min.

## Phase 2 (in development — `feat/phase2-jkp-detector` branch)

The §54 mitigation deliverable: detect always-winning patterns in YokiJKP matches and surface a public leaderboard.

- **JKP event walker cron (2.2)** — every 5 min, walks `MatchCreated/Joined/Revealed/Resolved/Draw/Cancelled/Swept` events from YokiJKP, maintains `data/jkp-matches.json` keyed by matchId, recomputes `data/jkp-aggregate.json` (per-address W/L/D + volume) and `data/jkp-pairs.json` (canonical pair counts).
- **Always-winning trigger cron (2.4)** — runs after the walker. Flags any address with ≥75% win-rate over ≥5 matches, posts Slack CRITICAL to `#04-yoki-arcade-alerts`, persists state in `data/flagged.json`. Self-clears when an address drops below threshold (audit-trail retained).
- **Suspicious-pairs trigger cron (2.5)** — runs after the walker. Flags pairs that have played ≥10 matches against each other AND those matches are ≥50% of either participant's total. Persists state in `data/suspicious-pairs.json`. Same dry-run gating as 2.4.
- **Public leaderboard tile (2.3)** — top 10 addresses by matches played, with W/L/D + win-rate. Bots and admin wallets are excluded by `MONITOR_IGNORE_LIST` in the aggregator. Gated behind `VITE_LEADERBOARD_ENABLED=true` so the tile stays hidden until the trigger has been validated against ~1 week of real data.
- **Treasury growth chart (2.6)** — public Recharts line chart of the hourly treasury balance JSONL, with KPI tiles for total inflow, mint count, average mint price realized, and last-24h/7d inflow. Always-on; renders an empty state until two snapshot rows are available.

**Signal-leak tradeoff:** the always-winning threshold (≥75% / ≥5) and the flagged-address list are deliberately NOT surfaced on the public SPA — only on the private Slack lane. See `planning/YOKI_MONITOR_SPEC.md §4.7` for rationale.

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
| `VITE_TREASURY_INFLOWS_JSONL_URL` | unset | URL to the public `treasury-inflows.jsonl` from Phase 1.3 cron. Drives the Phase 2.6 KPI tiles. |
| `VITE_JKP_AGGREGATE_JSON_URL` | unset | URL to the public `jkp-aggregate.json` from Phase 2.2 cron. Leaderboard renders empty state when absent. |
| `VITE_LEADERBOARD_ENABLED` | `false` | Set to `"true"` to surface the Phase 2 leaderboard tile. Off by default while the always-winning trigger is validated. |
| `VITE_REVIEW_KEY` | unset | Secret token enabling the operator review view at `/?review=<token>`. See "Review mode" below. |
| `VITE_FLAGGED_JSON_URL` | unset | Override for the `flagged.json` raw URL (review view only). |
| `VITE_SUSPICIOUS_PAIRS_JSON_URL` | unset | Override for the `suspicious-pairs.json` raw URL (review view only). |

### Cron secrets + variables (set in repo Settings → Secrets and variables → Actions)

| Name | Type | Used by | Purpose |
|---|---|---|---|
| `SONEIUM_RPC_URL` | secret | all crons | Alchemy/dRPC URL. Falls back to viem's built-in Soneium public RPC if unset. |
| `SLACK_WEBHOOK_URL_ALERTS` | secret | 1.1 / 1.3 / 2.4 | Slack incoming-webhook URL for the operator alerts channel. |
| `TREASURY_OUTFLOW_DRY_RUN` | variable | 1.3 | Set to `true` until treasury custody owner confirms expected outflows; flip to empty/false for live alerts. |
| `TREASURY_HEARTBEAT` | variable | 1.2 | Set to `true` for the first 7 days to confirm the cron is firing; mute afterwards. |
| `ALWAYS_WINNING_DRY_RUN` | variable | 2.4 | Set to `true` for the first ~1 week of Phase 2 to validate the trigger against real data without Slack noise. `flagged.json` still updates so the leaderboard tile and audit log are real. |
| `SUSPICIOUS_PAIRS_DRY_RUN` | variable | 2.5 | Same gating contract as `ALWAYS_WINNING_DRY_RUN`. `suspicious-pairs.json` updates regardless. |

## Deployment

Production deploys to `https://astarnetwork.github.io/yoki-monitor/` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) using the official `actions/deploy-pages` action (no `gh-pages` branch).

Pushing to `main` triggers a build + deploy automatically, EXCEPT when the only changes are under `data/**` or `**/*.md` — those are cron-driven and don't affect the SPA. Manual rebuilds: Actions → "1.4 Deploy SPA to GitHub Pages" → Run workflow.

Optional build-time variable:

| Name | Type | Purpose |
|---|---|---|
| `VITE_SONEIUM_RPC_URL` | repo variable | Paid Alchemy/dRPC URL baked into the SPA. Falls back to Soneium public RPC if unset. |

## Cron workers

GitHub Actions workflows under `.github/workflows/`:

| Workflow | Cadence | What it does |
|---|---|---|
| `minter-balance.yml` (1.1) | every 15 min | Read MINTER ETH balance, append to `data/minter-balance.jsonl`, Slack alert on warn/critical threshold cross (60-min same-severity throttle). |
| `treasury-balance.yml` (1.2) | every hour | Read treasury ASTR balance, append to `data/treasury-balance.jsonl`. Silent unless `TREASURY_HEARTBEAT=true`. |
| `treasury-flow.yml` (1.3) | every 15 min | Walk ASTR Transfer events to/from treasury since last checkpoint, append to `data/treasury-{inflows,outflows}.jsonl`, Slack CRITICAL on any outflow (dry-run gated until custody confirmed). |
| `bot-balances.yml` (1.7) | every hour | Read ETH + ASTR balance for the 5 matchmaking bot wallets (funding + bots 1–4) in parallel, append to `data/bot-balances.jsonl`. Silent — the bot Lambda owns its own auto-disable alerts. |
| `jkp-events.yml` (2.2 / 2.4 / 2.5) | every 5 min | Walk YokiJKP match-lifecycle events, update `data/jkp-matches.json` + `data/jkp-aggregate.json` + `data/jkp-pairs.json`, run always-winning trigger (≥75% / ≥5) and suspicious-pairs trigger (≥10 / ≥50%). Slack CRITICAL on newly-flagged addresses/pairs, INFO on cleared. |

All workflows commit the JSONL/JSON deltas back to `main` from a bot identity. Concurrency-guarded so overlapping ticks serialize.

## Review mode

The public dashboard surfaces balances, growth, and engagement only — it does NOT list flagged addresses or suspicious pairs. Those live in Slack and in two JSON files in `data/`.

A casually-gated operator surface is available at `/?review=<VITE_REVIEW_KEY>`. It replaces the public layout with two tables:

- **Always-winning flags** — pulled from `data/flagged.json` (written by the 2.4 trigger).
- **Suspicious pairs** — pulled from `data/suspicious-pairs.json` (written by the 2.5 trigger).

Each row carries the trigger evidence (W/L/D, win-rate, pair count, share %) and a status badge (Active / Cleared). The filter bar at the top toggles between Active (default), Cleared, and All.

**Security model — important to understand:**

- `VITE_REVIEW_KEY` is compiled into the JS bundle as a plain string at build time. Anyone who downloads the bundle and `grep`s it can find the key in seconds.
- The underlying JSON files are already public at `raw.githubusercontent.com/AstarNetwork/yoki-monitor/main/data/`. The review URL hides the rendered view from a casual visitor; it does NOT hide the data from anyone who knows where to look.
- This is "don't put it on the front page" gating, not authentication. The §54 signal-leak tradeoff still applies — the heuristics themselves are documented in the spec.

If real concealment is required, the two trigger output files would need to live in a separate private repo with the cron pushing there.

## What this is NOT

- Not preventive — surfaces signals, does not pause matches or freeze accounts.
- Not exhaustive on Phase 2 — the raw event-log view + Phase 3 (Safe events, Cores history, anomaly substitution artifact) remain ahead.
- Not an in-page alerts surface — alerting lives in the GitHub Actions cron workers and posts to an internal Slack channel.
