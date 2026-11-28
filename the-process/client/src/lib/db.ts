/**
 * The Process — local data layer (IndexedDB via Dexie, spec §9).
 *
 * Everything the app remembers lives here: the permanent Trade Log,
 * account settings, the screener watchlist, and small key-value state.
 * The Daily Guardrail and Analytics Dashboard are *views* over the same
 * `trades` table — there is exactly one record of truth (spec §8).
 */
import Dexie, { type Table } from 'dexie';

/** 'Y' | 'N' | '' (untagged) — used for both rule flags on a trade. */
export type YesNo = 'Y' | 'N' | '';

/**
 * One row of the permanent Trade Log (spec §6.4).
 *
 * Rows arrive from the Position Sizer, the Options Contract Ticket, the
 * Daily Guardrail, or manual entry. Guardrail rows carry only an R value
 * (`rDirect`) and no prices; computed columns render blank for them.
 */
export interface Trade {
  id?: number;
  /** Trade date, YYYY-MM-DD (local). */
  date: string;
  symbol: string;
  /** 'Up' if target ≥ entry when logged from the sizer; editable. */
  direction: 'Up' | 'Down' | '';
  /** Pre-trade: all 7 checklist rules checked at log time (§6.2.2). */
  matchedRules: YesNo;
  /** e.g. 'Stock', 'Call', 'Put', 'Spread'. */
  tradeType: string;
  /** Setup/strategy tag, e.g. 'breakout' (approved §7 enhancement). */
  setupTag: string;

  buyPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  /** Exit price, filled once the trade closes. */
  soldAt: number | null;
  /** 1 for shares; 100 for options sized via the Contract Ticket. */
  multiplier: number;

  /**
   * Account settings frozen at the moment this row was logged (§6.1) —
   * an override on the sizer applies here without changing the standing
   * default, and later settings edits never rewrite history.
   */
  accountSizeAtLog: number | null;
  riskPctAtLog: number | null;

  /** R logged directly (Daily Guardrail rows); null when prices exist. */
  rDirect: number | null;

  /** Post-trade honest self-assessment — feeds plan-adherence analytics. */
  followedPlan: YesNo;
  feeling: string;
  notes: string;

  source: 'sizer' | 'ticket' | 'guardrail' | 'manual';
  createdAt: number;
  /**
   * When the exit (soldAt) was recorded, if after logging. The cooling-off
   * timer (R-06) runs from when a loss actually happened, not from when
   * the setup was logged. Absent on older rows.
   */
  closedAt?: number | null;
  /** Automatically recorded rule breaks, e.g. 'Logged after stand-down'. */
  ruleBreaks?: string[];
}

/** The single persistent account record (spec §6.1). */
export interface AccountSettings {
  id: 'account';
  accountSize: number;
  riskPct: number;
  /** Daily Guardrail settings (§6.3). */
  maxTradesPerDay: number;
  dailyLossLimitR: number;
  /**
   * Daily limits that were LOOSENED, waiting to take effect (from the date
   * given). Loosening never applies the same day, so a limit can't be
   * raised to escape a stand-down; tightening applies at once.
   */
  pendingLimits?: {
    maxTradesPerDay?: number;
    dailyLossLimitR?: number;
    effectiveFrom: string;
  } | null;
}

/** One screener watchlist entry (spec §6.6). */
export interface WatchlistEntry {
  symbol: string;
  addedAt: number;
}

/** Small persisted UI/app state (checklist ticks, backup reminders…). */
export interface KvEntry {
  key: string;
  value: unknown;
}

class ProcessDB extends Dexie {
  trades!: Table<Trade, number>;
  settings!: Table<AccountSettings, string>;
  watchlist!: Table<WatchlistEntry, string>;
  kv!: Table<KvEntry, string>;

  constructor() {
    super('the-process');
    this.version(1).stores({
      // Indexes only — non-indexed fields are still stored.
      trades: '++id, date, symbol, followedPlan, setupTag, createdAt',
      settings: 'id',
      watchlist: 'symbol',
      kv: 'key',
    });
  }
}

export const db = new ProcessDB();

// Ask the browser to protect this origin's storage from automatic
// eviction — years of trade history should not vanish under disk
// pressure. Best-effort; the backup plan is the real safety net.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => undefined);
}

export const DEFAULT_SETTINGS: AccountSettings = {
  id: 'account',
  accountSize: 10000,
  riskPct: 1,
  maxTradesPerDay: 3,
  dailyLossLimitR: 2,
};

/** Read settings, seeding defaults on first run. */
export async function getSettings(): Promise<AccountSettings> {
  const existing = await db.settings.get('account');
  if (existing) return existing;
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(next: Omit<AccountSettings, 'id'>): Promise<void> {
  await db.settings.put({ ...next, id: 'account' });
}

/**
 * Default screener watchlist (spec §6.6 — "a broad set of large, liquid US
 * names, developer's choice"). 40 megacap/liquid names across sectors.
 */
export const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  'AMD', 'NFLX', 'ADBE', 'INTC', 'QCOM', 'JPM', 'BAC', 'V', 'MA', 'GS',
  'BRK.B', 'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'XOM', 'CVX', 'WMT',
  'COST', 'PG', 'KO', 'PEP', 'MCD', 'HD', 'NKE', 'DIS', 'BA', 'CAT',
];

/** Seed the watchlist on first run; returns the current symbols. */
export async function ensureWatchlist(): Promise<string[]> {
  const count = await db.watchlist.count();
  if (count === 0) {
    const now = Date.now();
    await db.watchlist.bulkAdd(DEFAULT_WATCHLIST.map((symbol) => ({ symbol, addedAt: now })));
    return [...DEFAULT_WATCHLIST];
  }
  return (await db.watchlist.toArray()).map((w) => w.symbol);
}
