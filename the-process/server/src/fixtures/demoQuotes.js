/**
 * Static demo quotes — served (clearly labeled "demo") when no API key is
 * configured, so a fresh install is navigable end-to-end without live data.
 *
 * Prices are plausible mid-2026 figures, not live. The UI must always show
 * the demo tag when these are on screen (spec §6.1).
 */
export const DEMO_QUOTES = {
  AAPL: { price: 310.66, changePct: -0.64 },
  MSFT: { price: 402.5, changePct: 0.42 },
  NVDA: { price: 188.32, changePct: 1.31 },
  AMZN: { price: 244.1, changePct: 0.18 },
  GOOGL: { price: 201.77, changePct: -0.22 },
  META: { price: 742.05, changePct: 0.95 },
  TSLA: { price: 289.4, changePct: -1.84 },
  JPM: { price: 305.12, changePct: 0.37 },
  V: { price: 352.6, changePct: 0.11 },
  UNH: { price: 318.9, changePct: -0.53 },
  XOM: { price: 122.48, changePct: 0.66 },
  WMT: { price: 108.23, changePct: 0.29 },
  PG: { price: 161.75, changePct: -0.08 },
  JNJ: { price: 172.4, changePct: 0.21 },
  HD: { price: 398.55, changePct: -0.44 },
  MA: { price: 588.7, changePct: 0.5 },
  COST: { price: 942.1, changePct: 0.73 },
  NFLX: { price: 1287.35, changePct: 1.12 },
  AMD: { price: 164.22, changePct: -0.91 },
  DIS: { price: 118.64, changePct: 0.14 },
};
