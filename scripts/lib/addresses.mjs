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

// Wallets ignored by all player-counting logic. Same set as BOT_WALLETS
// but as a lowercased Set for O(1) membership checks.
export const MONITOR_IGNORE_LIST = new Set(BOT_WALLETS.map((b) => b.address.toLowerCase()));
