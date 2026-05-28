// Single source of truth for addresses + ignore list across all cron
// scripts. Mirrors src/addresses.ts (the SPA constants). If anything
// rotates, update both files in the same commit.

export const SONEIUM_CHAIN_ID = 1868;

// ERC-20 tokens
export const ASTR_TOKEN = "0x2CAE934a1e84F693fbb78CA5ED3B0A6893259441";
export const ASTR_DECIMALS = 18;

// Yoki Arcade contracts
export const YOKI_CORES = "0x1543EBfdA2D432fA26eA55c8f48b9253D2cCeDeb";
export const YOKI_JKP = "0xdcd1010E33063EA6990b488BdDDa6CC107F307b3";

// Operational wallets
export const MINTER_HOT_WALLET = "0x3dAd4128E91F82Fe7b7B631977764D0Cab024DDD";
export const YOKI_TREASURY = "0xfA2B079adf1d9FcBCb452503B23c18EE74fA907f";
export const YOKI_SAFE = "0xdA9A0a42D19206D5dA00300ac182d518F34AB126";

// Matchmaking bot wallets + their funding source. Displayed on the SPA
// and snapshotted by the bot-balances cron (1.7).
export const BOT_WALLETS = [
  { label: "Funding", address: "0x7455e5D9a8D4f043A41173F97BEdCCB2eF685861" },
  { label: "Bot 1", address: "0x6489d6328dff18145719dcc54faca762dbd05ace" },
  { label: "Bot 2", address: "0xcD018419c2C1bD59659FaB91bd49D8D302C1E7b9" },
  { label: "Bot 3", address: "0x3665D411fFb3b8F672D1e4B8d8DF4DEb00636b5A" },
  { label: "Bot 4", address: "0x84CeC056300E5f73575c44e7e8F280bd3c113320" },
];

// Daily Champions exclusion list — mirror of the prod env var
// `DC_EXCLUDED_ADDRESSES` set on the Amplify Lambdas. Forensic basis
// captured in `Yoki Arcade/leaderboard-investigations/` (internal):
//   - 0x0FDA04C5… : Days 3-5 sybil ring (May 18 audit)
//   - 0xbff6843d… : Days 14-16 sybil ring (May 28 audit), main suspect
//   - 0x52a8174f… → 0xbb51c481… : six sybils funded by 0xbff6843d
//
// Effect on yoki-monitor: the aggregate (jkp-aggregate.json) is
// rebuilt every cron tick using this set, so excluded wallets stop
// appearing in the leaderboard card going forward. Historical wins by
// these wallets are also dropped from the aggregate (the aggregate is
// stateless — no per-day deltas to preserve), but the Daily Champions
// snapshot view continues to surface finalized historical winners
// (Days 3-5 for 0x0FDA, Days 14-15 for 0xbff6843d) untouched, since
// that view is sourced from the prod API's frozen `dc:day:*:winners`
// records.
export const DC_EXCLUSION_LIST = [
  "0x0FDA04C5669F78A1De58CFECA34d50044e61FbE1",
  "0xbff6843d53e1aacdee75b4529cb079bc0fb7798a",
  "0x52a8174f7fc87c797e3e21aac2c6dece483cbc25",
  "0xa3700e6452716bda55d1d2a4ced6e1186621796b",
  "0x2caa9d2f5726315cb3e6cfe985012f78253cf12d",
  "0x95c4d2c9a416a81853367c550b43145270f45015",
  "0x5246574ab30e23dad964c84e65b5c3a4588e03f6",
  "0xbb51c481f54344d225c8dfdeee1a9dac91137c22",
];

// Wallets ignored by all player-counting logic AND Phase 2/3 leaderboard
// + trigger surfaces. Locked at YOKI_MONITOR_SPEC.md §6 / BOT_PLAYERS_SPEC
// §17.6 cap 7. Includes the 5 bot wallets (which DO play JKP), the
// 3 admin/operational wallets (which don't, but are listed for
// defense-in-depth so the leaderboard never accidentally counts a privileged
// role address if it ever stakes a match), and the Daily Champions
// exclusion list above.
export const MONITOR_IGNORE_LIST = new Set([
  ...BOT_WALLETS.map((b) => b.address.toLowerCase()),
  MINTER_HOT_WALLET.toLowerCase(),
  YOKI_TREASURY.toLowerCase(),
  YOKI_SAFE.toLowerCase(),
  ...DC_EXCLUSION_LIST.map((a) => a.toLowerCase()),
]);
