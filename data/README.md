# Cron data files

Committed by the GitHub Actions workflows under `.github/workflows/`. Each cron tick appends one row to its JSONL file and the workflow commits + pushes back to `main`.

| File | Owner | Contents |
|---|---|---|
| `minter-balance.jsonl` | 1.1 | `{ timestamp, blockNumber, balanceWei, balanceEth, severity }` — one row per 15-min tick |
| `treasury-balance.jsonl` | 1.2 | `{ timestamp, blockNumber, balanceAstrWei, balanceAstr }` — one row per hourly tick |
| `treasury-inflows.jsonl` | 1.3 | `{ timestamp, blockNumber, txHash, from, valueWei, valueAstr, logIndex }` — one row per inflow Transfer event |
| `treasury-outflows.jsonl` | 1.3 | `{ timestamp, blockNumber, txHash, to, valueWei, valueAstr, logIndex, dryRun }` — one row per outflow Transfer event |
| `.checkpoint-treasury.json` | 1.3 | `{ blockNumber, timestamp }` — last fully-processed block; used to resume the walker on the next tick |
| `bot-balances.jsonl` | 1.7 | `{ timestamp, blockNumber, balances: { [address]: { label, eth: {wei, eth}, astr: {wei, astr} } } }` — one row per hourly tick covering all 5 bot wallets |

The Phase 1.4 SPA reads `treasury-balance.jsonl` via `raw.githubusercontent.com` to draw the 24h-inflow line (deferred to Phase 2's chart for the full curve). All other files back the Phase 2 dashboard.

## Audit log

Git history of this folder IS the audit log. Every row gets a commit; revert any unexpected drift via git.

## Bootstrap (treasury flow walker)

First run of 1.3 with no checkpoint will look back `BOOTSTRAP_LOOKBACK` (1,000,000 blocks ≈ 3 weeks). To backfill from YokiCores deploy precisely, dispatch the workflow manually with an `initial_block` input set to the deploy block (YokiCores was deployed on Soneium on 2026-04-29; look up the exact block on Blockscout).
