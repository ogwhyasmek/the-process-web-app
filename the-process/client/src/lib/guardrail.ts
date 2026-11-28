/**
 * Daily Guardrail rules (spec §6.3, tightened 2026-11): one place that
 * decides whether you're clear to trade, so the Guardrail, Cockpit and
 * Trade Log can never disagree. All pure — the React hook that feeds it
 * live data is useGuardrail.ts.
 *
 * The decisions, as chosen by the user:
 * - Every trade dated today counts toward the cap, whichever page logged
 *   it; open trades count as taken, and their R counts once closed.
 * - Once stood down, the day stays stood down until midnight (a "latch"):
 *   deleting or editing trades can't lift it.
 * - Limits: tightening applies at once; loosening only from tomorrow.
 * - Undo is a 2-minute typo fix, not a way out. There is no "reset day".
 *   One exception: undoing the very entry that triggered the stand-down
 *   (a mistyped result) lifts it — then the rules simply run again.
 * - 30 minutes after a loss, the Cockpit can't log a new setup (R-06).
 * - While stood down, the Cockpit can't log new setups; the Trade Log can
 *   still record a trade that really happened, flagged as a rule break.
 */
import type { AccountSettings, Trade } from './db';
import { tradeR } from './trades';

export const UNDO_WINDOW_MS = 2 * 60 * 1000;
export const COOLING_OFF_MS = 30 * 60 * 1000;
/** kv key holding today's stand-down latch. */
export const STAND_DOWN_KEY = 'guardrail.standDown';
export const RULE_BREAK_AFTER_STAND_DOWN = 'Logged after stand-down';

export interface Limits {
  maxTradesPerDay: number;
  dailyLossLimitR: number;
}

/** Recorded the first time a day hits a limit; holds until midnight. */
export interface StandDownLatch {
  date: string; // YYYY-MM-DD
  reason: 'trades' | 'loss';
  at: number;
  /** The trade that tipped the day over, if known (for the undo exception). */
  triggerId?: number;
}

const LIMIT_KEYS = ['maxTradesPerDay', 'dailyLossLimitR'] as const;

/** Next calendar day for a local YYYY-MM-DD date. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
}

/** Is limit `a` stricter than `b`? 0 means "no limit", the loosest. */
export function isStricter(a: number, b: number): boolean {
  return a > 0 && (b === 0 || a < b);
}

/**
 * The limits in force today, plus any loosening still waiting. A pending
 * change whose date has arrived is simply in force.
 */
export function effectiveLimits(
  s: AccountSettings,
  today: string,
): Limits & { pending: (Partial<Limits> & { effectiveFrom: string }) | null } {
  const limits: Limits = { maxTradesPerDay: s.maxTradesPerDay, dailyLossLimitR: s.dailyLossLimitR };
  const p = s.pendingLimits;
  if (!p) return { ...limits, pending: null };
  if (today >= p.effectiveFrom) {
    return {
      maxTradesPerDay: p.maxTradesPerDay ?? limits.maxTradesPerDay,
      dailyLossLimitR: p.dailyLossLimitR ?? limits.dailyLossLimitR,
      pending: null,
    };
  }
  return { ...limits, pending: p };
}

/**
 * Apply an edit to the daily limits: a stricter value takes effect now; a
 * looser one waits until tomorrow. Setting a value back to what's in
 * force cancels a pending loosening. Returns the settings to save.
 */
export function applyLimitEdit(s: AccountSettings, next: Limits, today: string): AccountSettings {
  const eff = effectiveLimits(s, today);
  const current: Limits = { maxTradesPerDay: eff.maxTradesPerDay, dailyLossLimitR: eff.dailyLossLimitR };
  const pending: Partial<Limits> = {};
  if (eff.pending) {
    for (const k of LIMIT_KEYS) if (eff.pending[k] !== undefined) pending[k] = eff.pending[k];
  }
  for (const k of LIMIT_KEYS) {
    if (next[k] === current[k]) {
      delete pending[k];
    } else if (isStricter(next[k], current[k])) {
      current[k] = next[k];
      delete pending[k];
    } else {
      pending[k] = next[k];
    }
  }
  const hasPending = Object.keys(pending).length > 0;
  return {
    ...s,
    ...current,
    pendingLimits: hasPending ? { ...pending, effectiveFrom: nextDay(today) } : null,
  };
}

export interface DayStatus {
  /** Every trade dated today, from any page — open ones included. */
  tradesUsed: number;
  /** Trades logged today that haven't closed yet (no R). */
  openTrades: number;
  netR: number;
  lossR: number;
  roomLeftR: number;
  tradesLeft: number;
  lockedByTrades: boolean;
  lockedByLoss: boolean;
  /** Stood down earlier today; holds even if trades were since removed. */
  latched: boolean;
  locked: boolean;
  caution: boolean;
  /** Why the day is stood down, if it is. */
  reason: 'trades' | 'loss' | null;
}

/** §6.3 formulas over ALL of today's trades, plus the day's latch. */
export function dayStatus(
  todayTrades: Trade[],
  limits: Limits,
  latch: StandDownLatch | null | undefined,
  today: string,
): DayStatus {
  const rs = todayTrades.map(tradeR);
  const closed = rs.filter((r): r is number => r != null);
  const tradesUsed = todayTrades.length;
  const netR = closed.reduce((a, b) => a + b, 0);
  const lossR = Math.max(0, -netR);
  const { maxTradesPerDay: maxTrades, dailyLossLimitR: lossLimit } = limits;
  const roomLeftR = Math.max(0, lossLimit - lossR);
  const tradesLeft = Math.max(0, maxTrades - tradesUsed);
  const lockedByTrades = maxTrades > 0 && tradesUsed >= maxTrades;
  const lockedByLoss = lossLimit > 0 && lossR >= lossLimit;
  const latched = latch?.date === today;
  const locked = lockedByTrades || lockedByLoss || latched;
  return {
    tradesUsed,
    openTrades: rs.length - closed.length,
    netR,
    lossR,
    roomLeftR,
    tradesLeft,
    lockedByTrades,
    lockedByLoss,
    latched,
    locked,
    caution: !locked && ((maxTrades > 0 && tradesLeft <= 1) || (lossLimit > 0 && roomLeftR <= 1)),
    reason: lockedByLoss ? 'loss' : lockedByTrades ? 'trades' : latched ? latch!.reason : null,
  };
}

/**
 * The latch to record when a limit is hit and today isn't latched yet.
 * `triggerId` is the most recent of today's trades — the one that tipped it.
 */
export function latchToRecord(
  status: DayStatus,
  today: string,
  now: number,
  triggerId?: number,
): StandDownLatch | null {
  if (status.latched || !(status.lockedByLoss || status.lockedByTrades)) return null;
  return {
    date: today,
    reason: status.lockedByLoss ? 'loss' : 'trades',
    at: now,
    ...(triggerId != null ? { triggerId } : {}),
  };
}

/**
 * The one way a stand-down lifts before midnight: undoing (within the
 * 2-minute window) the exact entry that triggered it — a typo fix. After
 * that the normal rules run again, so still being over a limit re-locks.
 */
export function undoLiftsStandDown(
  latch: StandDownLatch | null | undefined,
  undone: Trade | undefined,
  today: string,
  now: number,
): boolean {
  return (
    !!latch &&
    latch.date === today &&
    latch.triggerId != null &&
    undone?.id === latch.triggerId &&
    canUndo(undone, now)
  );
}

/** "Undo last" is a typo fix: only a Guardrail entry, only within 2 minutes. */
export function canUndo(t: Trade | undefined, now: number): boolean {
  return !!t && t.source === 'guardrail' && now - t.createdAt <= UNDO_WINDOW_MS;
}

/** When the R-06 cooling-off ends, or null if no loss is cooling. */
export function coolingOffUntil(lastLossAt: number | null | undefined, now: number): number | null {
  if (lastLossAt == null) return null;
  const until = lastLossAt + COOLING_OFF_MS;
  return until > now ? until : null;
}

/** Rule breaks to stamp on a trade being recorded right now. */
export function ruleBreaksForNewTrade(tradeDate: string, today: string, status: DayStatus): string[] {
  return tradeDate === today && status.locked ? [RULE_BREAK_AFTER_STAND_DOWN] : [];
}
