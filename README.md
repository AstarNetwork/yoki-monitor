# yoki-monitor

Operational health dashboard for [Yoki Arcade](https://yoki-arcade.astar.network) on Soneium. Live at [`astarnetwork.github.io/yoki-monitor`](https://astarnetwork.github.io/yoki-monitor/).

## Phase 1 (live)

A single-page SPA showing:

- **MINTER hot-wallet ETH balance** (`0x3dAd…4DDD`) with warn/critical thresholds (< 0.01 / < 0.005 ETH).
- **Yoki Treasury ASTR balance** (`0xfA2B…907f`) + last-24h inflow line.
- **Matchmaking bot balances** (ETH + ASTR + PnL since launch for funding + bots 1–4).
- **Engagement row** — Cores holders, JKP 24h active players, JKP 7d active players.

Balances are read live via viem on page load and refreshed every 60 seconds while the tab is visible. JKP active-player counts and Cores holders are pulled from Soneium Blockscout REST and cached 5 min.

## Phase 2

- **Treasury growth chart (2.6)**: LIVE. Public Recharts line chart of the treasury balance JSONL, with KPI tiles for total inflow, mint count, average mint price realized, and last-24h/7d inflow. Always-on; renders an empty state until two snapshot rows are available.

### Retired 2026-07-28: the §54 JKP detector

Yoki Arcade entered maintenance mode; the JKP detector stack was retired to stop
the cron noise. **The code and the accumulated data are kept, not deleted**; only
the workflow that drove them is gone. Final state at shutdown: 12,077 matches,
3,358 addresses, 4,183 pairs, **zero addresses flagged and zero suspicious pairs**
across the full run.

- **JKP event walker cron (2.2)**: RETIRED. Walked `MatchCreated/Joined/Revealed/Resolved/Draw/Cancelled/Swept` events from YokiJKP, maintained `data/jkp-matches.json` keyed by matchId, recomputed `data/jkp-aggregate.json` (per-address W/L/D + volume) and `data/jkp-pairs.json` (canonical pair counts). These files are now frozen.
- **Always-winning trigger cron (2.4)**: RETIRED. Flagged any address with ≥75% win-rate over ≥5 matches, posted Slack CRITICAL to `#04-yoki-arcade-alerts`, persisted state in `data/flagged.json`. Never fired.
- **Suspicious-pairs trigger cron (2.5)**: RETIRED. Flagged pairs that had played ≥10 matches against each other AND where those matches were ≥50% of either participant's total. Persisted state in `data/suspicious-pairs.json`. Never fired.
- **Public leaderboard tile (2.3)**: HIDDEN. `VITE_LEADERBOARD_ENABLED` was flipped to `false` at retirement: with the walker gone, `jkp-aggregate.json` no longer updates, and a public leaderboard that silently freezes is worse than no leaderboard.

To revive any of this, restore `.github/workflows/jkp-events.yml` from git history
(last present at `de6f4540`) and flip `VITE_LEADERBOARD_ENABLED` back to `true`.
The scripts under `scripts/` are untouched and still work.

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
| `VITE_JKP_AGGREGATE_JSON_URL` | unset | URL to the frozen `jkp-aggregate.json`. Only relevant if the 2.2 cron is revived. |
| `VITE_LEADERBOARD_ENABLED` | `false` | Set to `"true"` to surface the leaderboard tile. **Held at `false` since the 2.2 cron was retired 2026-07-28**; the underlying data no longer updates. |
| `VITE_REVIEW_KEY` | unset | Secret token enabling the operator review view at `/?review=<token>`. See "Review mode" below. |
| `VITE_FLAGGED_JSON_URL` | unset | Override for the `flagged.json` raw URL (review view only). |
| `VITE_SUSPICIOUS_PAIRS_JSON_URL` | unset | Override for the `suspicious-pairs.json` raw URL (review view only). |

### Cron secrets + variables (set in repo Settings → Secrets and variables → Actions)

| Name | Type | Used by | Purpose |
|---|---|---|---|
| `SONEIUM_RPC_URL` | secret | all crons | Alchemy/dRPC URL. Falls back to viem's built-in Soneium public RPC if unset. |
| `SLACK_WEBHOOK_URL_ALERTS` | secret | 1.2 / 1.3 | Slack incoming-webhook URL for the operator alerts channel. |
| `TREASURY_OUTFLOW_DRY_RUN` | variable | 1.3 | **Set to `false` on 2026-07-28, outflow alerts are now LIVE.** Was `true` from 2026-05-11, during which five real outflows (totalling 184,500 ASTR) were recorded to `treasury-outflows.jsonl` without ever alerting. |
| `TREASURY_HEARTBEAT` | variable | 1.2 | `true` posts a Slack balance heartbeat **at most once a week** (see "Weekly heartbeat" below). Clear or set `false` to mute. |

## Deployment

Production deploys to `https://astarnetwork.github.io/yoki-monitor/` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) using the official `actions/deploy-pages` action (no `gh-pages` branch).

Pushing to `main` triggers a build + deploy automatically, EXCEPT when the only changes are under `data/**` or `**/*.md` — those are cron-driven and don't affect the SPA. Manual rebuilds: Actions → "1.4 Deploy SPA to GitHub Pages" → Run workflow.

Optional build-time variable:

| Name | Type | Purpose |
|---|---|---|
| `VITE_SONEIUM_RPC_URL` | repo variable | Paid Alchemy/dRPC URL baked into the SPA. Falls back to Soneium public RPC if unset. |

## Cron workers

GitHub Actions workflows under `.github/workflows/`:

Three scheduled workflows remain, all daily and deliberately staggered:

| Workflow | Cadence (UTC) | What it does |
|---|---|---|
| `treasury-balance.yml` (1.2) | daily 09:05 | Read treasury ASTR balance, append to `data/treasury-balance.jsonl`. Silent unless `TREASURY_HEARTBEAT=true`, and then at most weekly. |
| `treasury-flow.yml` (1.3) | daily 09:25 | Walk ASTR Transfer events to/from treasury since last checkpoint, append to `data/treasury-{inflows,outflows}.jsonl`, Slack CRITICAL on any outflow. |
| `bot-balances.yml` (1.7) | daily 09:45 | Read ETH + ASTR balance for the 5 matchmaking bot wallets (funding + bots 1–4) in parallel, append to `data/bot-balances.jsonl`. Silent; the bot Lambda owns its own auto-disable alerts. |

All workflows commit the JSONL/JSON deltas back to `main` from a bot identity.

**Why the 20-minute stagger matters.** Each workflow's `concurrency` group only
serialises it against *itself*, never against its siblings, and the commit step is
a bare `git commit && git push` with no rebase or retry. When two crons ran at the
same minute the second push died with `! [rejected] main -> main (fetch first)` and
failed the whole run. At the old cadences (5 min / 15 min / hourly) they collided
constantly at `:00`, `:15` and `:30`. Daily runs 20 minutes apart cannot overlap,
each job finishes in well under a minute, so the race is eliminated structurally
rather than patched. **If you ever re-tighten a cadence, add `git pull --rebase`
to the commit step first.**

Schedules are offset from the top of the hour on purpose: GitHub drops scheduled
runs under load, and `:00` is the worst slot.

Retired: `minter-balance.yml` (1.1, disabled 2026-06-03 when MINTER_ROLE was
revoked and the hot wallet went inert), `daily-champions.yml` (2.5a, campaign
ended 2026-06-02 and its backing endpoint was deleted 2026-06-18), and
`jkp-events.yml` (2.2/2.4/2.5, see Phase 2 above).

### Weekly heartbeat

With `TREASURY_HEARTBEAT=true`, 1.2 posts a balance line to Slack at most once
every 6.5 days, tracked via `data/.heartbeat-treasury.json`. The gate is on
elapsed time, not on a weekday+hour match: with a single daily tick, a fixed-slot
gate would either miss a dropped run and go silent for two weeks, or drift a day
later every week. The state file is written only after Slack accepts the post, so
a failed post retries on the next daily tick.

### Data note: timestamps in the flow JSONLs

Rows in `treasury-inflows.jsonl` / `treasury-outflows.jsonl` written **before
2026-07-28** carry the time the cron happened to observe the transfer, not the
time it occurred. The 2026-06-09 outflow, for example, landed on-chain at
`14:30:29Z` but is recorded as `16:47:20Z`. From 2026-07-28 the walker stamps the
**block** timestamp, which the daily cadence made essential: walk time would
otherwise be up to 24h off. `blockNumber` was always accurate and is the field to
trust for anything older.

## Review mode

> **Frozen since 2026-07-28.** The 2.4 and 2.5 triggers were retired, so both files
> below are static. Both ended their run empty: zero flagged addresses, zero
> suspicious pairs. The view still renders, it just no longer updates.

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
- Not real-time: since 2026-07-28 the crons run once a day, so an outflow alert can be up to ~24h behind the event. Accepted tradeoff for maintenance mode; tighten `treasury-flow.yml` if the game becomes active again.
- Not watching JKP any more: the §54 detector was retired 2026-07-28. See Phase 2.
- Not an in-page alerts surface — alerting lives in the GitHub Actions cron workers and posts to an internal Slack channel.
