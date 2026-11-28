/** Daily Guardrail rules (§6.3, tightened): what counts, when you're locked, and what can't unlock it. */
import { describe, expect, it } from 'vitest';
import type { AccountSettings, Trade } from './db';
import {
  applyLimitEdit,
  canUndo,
  coolingOffUntil,
  COOLING_OFF_MS,
  dayStatus,
  effectiveLimits,
  isStricter,
  latchToRecord,
  nextDay,
  RULE_BREAK_AFTER_STAND_DOWN,
  ruleBreaksForNewTrade,
  UNDO_WINDOW_MS,
} from './guardrail';

const TODAY = '2026-11-28';
const limits = { maxTradesPerDay: 3, dailyLossLimitR: 2 };
const settings = (patch: Partial<AccountSettings> = {}): AccountSettings => ({
  id: 'account', accountSize: 10000, riskPct: 1, ...limits, ...patch,
});

function trade(patch: Partial<Trade> = {}): Trade {
  return {
    date: TODAY, symbol: 'AAPL', direction: 'Up', matchedRules: '', tradeType: 'Stock', setupTag: '',
    buyPrice: null, stopPrice: null, targetPrice: null, soldAt: null, multiplier: 1,
    accountSizeAtLog: 10000, riskPctAtLog: 1, rDirect: null, followedPlan: '', feeling: '', notes: '',
    source: 'guardrail', createdAt: 0, ...patch,
  };
}
const result = (r: number, patch: Partial<Trade> = {}) => trade({ rDirect: r, ...patch });
/** A Sizer setup logged but not yet closed (no R). */
const openSetup = () => trade({ source: 'sizer', buyPrice: 100, stopPrice: 98, targetPrice: 104 });

describe('every trade today counts, whichever page logged it', () => {
  it('counts Sizer, Ticket and manual rows toward the cap — not only Guardrail entries', () => {
    const s = dayStatus(
      [result(1), trade({ source: 'manual', rDirect: null, buyPrice: 50, stopPrice: 49, soldAt: 51 }), openSetup()],
      limits, null, TODAY,
    );
    expect(s.tradesUsed).toBe(3);
    expect(s.lockedByTrades).toBe(true);
    expect(s.openTrades).toBe(1);
  });

  it('counts an open trade as taken, and its R only once it closes', () => {
    const open = dayStatus([openSetup()], limits, null, TODAY);
    expect(open.tradesUsed).toBe(1);
    expect(open.netR).toBe(0);
    const closedAtStop = dayStatus([{ ...openSetup(), soldAt: 98 }], limits, null, TODAY);
    expect(closedAtStop.netR).toBe(-1);
  });

  it('applies the §6.3 loss limit to net R across all sources', () => {
    const s = dayStatus([result(-1), trade({ source: 'manual', buyPrice: 100, stopPrice: 98, soldAt: 98 })], limits, null, TODAY);
    expect(s.lossR).toBe(2);
    expect(s.lockedByLoss).toBe(true);
    expect(s.reason).toBe('loss');
  });

  it('flags caution with one trade or ≤1R of room left', () => {
    expect(dayStatus([result(1), result(1)], limits, null, TODAY).caution).toBe(true);
    expect(dayStatus([result(-1.2)], limits, null, TODAY).caution).toBe(true);
    expect(dayStatus([result(1)], limits, null, TODAY).caution).toBe(false);
  });

  it('treats a 0 limit as "no limit"', () => {
    const s = dayStatus(Array(10).fill(result(-1)), { maxTradesPerDay: 0, dailyLossLimitR: 0 }, null, TODAY);
    expect(s.locked).toBe(false);
  });
});

describe('the stand-down latch: deleting trades never lifts it', () => {
  it('records a latch the first time a limit is hit, only once', () => {
    const hit = dayStatus([result(-2)], limits, null, TODAY);
    expect(latchToRecord(hit, TODAY, 123)).toEqual({ date: TODAY, reason: 'loss', at: 123 });
    const latch = latchToRecord(hit, TODAY, 123)!;
    expect(latchToRecord(dayStatus([result(-2)], limits, latch, TODAY), TODAY, 456)).toBeNull();
    expect(latchToRecord(dayStatus([result(1)], limits, null, TODAY), TODAY, 1)).toBeNull();
  });

  it('stays locked after the losing trades are deleted', () => {
    const latch = { date: TODAY, reason: 'loss' as const, at: 1 };
    const s = dayStatus([], limits, latch, TODAY);
    expect(s.locked).toBe(true);
    expect(s.latched).toBe(true);
    expect(s.reason).toBe('loss');
  });

  it('expires at midnight: yesterday’s latch does not lock today', () => {
    const latch = { date: '2026-11-27', reason: 'loss' as const, at: 1 };
    expect(dayStatus([], limits, latch, TODAY).locked).toBe(false);
  });
});

describe('limit edits: tighten now, loosen tomorrow', () => {
  it('knows which values are stricter (0 = no limit)', () => {
    expect(isStricter(2, 3)).toBe(true);
    expect(isStricter(3, 2)).toBe(false);
    expect(isStricter(5, 0)).toBe(true);
    expect(isStricter(0, 5)).toBe(false);
  });

  it('applies a tightening immediately', () => {
    const s = applyLimitEdit(settings(), { maxTradesPerDay: 2, dailyLossLimitR: 1 }, TODAY);
    expect(s.maxTradesPerDay).toBe(2);
    expect(s.dailyLossLimitR).toBe(1);
    expect(s.pendingLimits).toBeNull();
  });

  it('holds a loosening until tomorrow, so it can’t escape today’s stand-down', () => {
    const s = applyLimitEdit(settings(), { maxTradesPerDay: 10, dailyLossLimitR: 0 }, TODAY);
    expect(effectiveLimits(s, TODAY)).toMatchObject({ maxTradesPerDay: 3, dailyLossLimitR: 2 });
    expect(s.pendingLimits).toEqual({ maxTradesPerDay: 10, dailyLossLimitR: 0, effectiveFrom: '2026-11-29' });
    expect(effectiveLimits(s, '2026-11-29')).toMatchObject({ maxTradesPerDay: 10, dailyLossLimitR: 0, pending: null });
  });

  it('handles a mixed edit field by field', () => {
    const s = applyLimitEdit(settings(), { maxTradesPerDay: 2, dailyLossLimitR: 5 }, TODAY);
    expect(s.maxTradesPerDay).toBe(2); // tighter → now
    expect(s.dailyLossLimitR).toBe(2); // looser → still 2 today
    expect(s.pendingLimits).toEqual({ dailyLossLimitR: 5, effectiveFrom: '2026-11-29' });
  });

  it('cancels a pending loosening when set back to today’s value', () => {
    const loosened = applyLimitEdit(settings(), { maxTradesPerDay: 10, dailyLossLimitR: 2 }, TODAY);
    expect(applyLimitEdit(loosened, limits, TODAY).pendingLimits).toBeNull();
  });

  it('promotes a pending change once its day arrives, then edits from there', () => {
    const loosened = applyLimitEdit(settings(), { maxTradesPerDay: 10, dailyLossLimitR: 2 }, TODAY);
    const nextDayEdit = applyLimitEdit(loosened, { maxTradesPerDay: 8, dailyLossLimitR: 2 }, '2026-11-29');
    expect(nextDayEdit.maxTradesPerDay).toBe(8); // 8 is stricter than the now-effective 10
    expect(nextDayEdit.pendingLimits).toBeNull();
  });

  it('rolls the date over month and year ends', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});

describe('undo is a 2-minute typo fix', () => {
  it('allows undoing a Guardrail entry within 2 minutes only', () => {
    expect(canUndo(result(-1, { createdAt: 0 }), UNDO_WINDOW_MS)).toBe(true);
    expect(canUndo(result(-1, { createdAt: 0 }), UNDO_WINDOW_MS + 1)).toBe(false);
  });

  it('never undoes a row logged from another page', () => {
    expect(canUndo(trade({ source: 'sizer', createdAt: 0 }), 1000)).toBe(false);
    expect(canUndo(undefined, 0)).toBe(false);
  });
});

describe('cooling-off after a loss (R-06)', () => {
  it('runs 30 minutes from the loss', () => {
    expect(coolingOffUntil(1000, 1000 + COOLING_OFF_MS - 1)).toBe(1000 + COOLING_OFF_MS);
    expect(coolingOffUntil(1000, 1000 + COOLING_OFF_MS)).toBeNull();
    expect(coolingOffUntil(null, 0)).toBeNull();
  });
});

describe('rule-break flag for trades recorded while stood down', () => {
  it('flags a trade dated today on a stood-down day', () => {
    const locked = dayStatus([result(-2)], limits, null, TODAY);
    expect(ruleBreaksForNewTrade(TODAY, TODAY, locked)).toEqual([RULE_BREAK_AFTER_STAND_DOWN]);
  });

  it('does not flag on a clear day, or a trade dated another day', () => {
    const clear = dayStatus([], limits, null, TODAY);
    const locked = dayStatus([result(-2)], limits, null, TODAY);
    expect(ruleBreaksForNewTrade(TODAY, TODAY, clear)).toEqual([]);
    expect(ruleBreaksForNewTrade('2026-11-20', TODAY, locked)).toEqual([]);
  });
});
