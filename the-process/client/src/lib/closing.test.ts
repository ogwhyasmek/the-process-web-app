/** One-step closing of open trades. */
import { describe, expect, it } from 'vitest';
import type { Trade } from './db';
import { closeUpdate, isClosable, isOpen, openTrades, previewR, quickExits } from './closing';
import { tradeR } from './trades';

function trade(patch: Partial<Trade> = {}): Trade {
  return {
    date: '2026-11-28', symbol: 'NVDA', direction: 'Up', matchedRules: 'Y', tradeType: 'Stock', setupTag: '',
    buyPrice: 100, stopPrice: 98, targetPrice: 104, soldAt: null, multiplier: 1,
    accountSizeAtLog: 10000, riskPctAtLog: 1, rDirect: null, followedPlan: '', feeling: '', notes: '',
    source: 'sizer', createdAt: 0, ...patch,
  };
}

describe('which trades are open and closable', () => {
  it('treats a logged setup with no exit as open and closable', () => {
    expect(isOpen(trade())).toBe(true);
    expect(isClosable(trade())).toBe(true);
  });

  it('treats closed trades and Guardrail results as not open', () => {
    expect(isOpen(trade({ soldAt: 104 }))).toBe(false);
    expect(isOpen(trade({ source: 'guardrail', rDirect: -1, buyPrice: null, stopPrice: null }))).toBe(false);
  });

  it('needs entry, stop and frozen account settings to close from a price', () => {
    expect(isClosable(trade({ stopPrice: null }))).toBe(false);
    expect(isClosable(trade({ buyPrice: null }))).toBe(false);
    expect(isClosable(trade({ stopPrice: 100 }))).toBe(false); // zero stop distance
    expect(isClosable(trade({ accountSizeAtLog: null }))).toBe(false);
  });

  it('lists open trades oldest first', () => {
    const list = openTrades([
      trade({ symbol: 'B', date: '2026-11-28', createdAt: 2 }),
      trade({ symbol: 'CLOSED', soldAt: 1 }),
      trade({ symbol: 'A', date: '2026-11-20', createdAt: 9 }),
      trade({ symbol: 'C', date: '2026-11-28', createdAt: 1 }),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['A', 'C', 'B']);
  });
});

describe('closing', () => {
  it('previews the R an exit would record', () => {
    expect(previewR(trade(), 98)).toBe(-1);
    expect(previewR(trade(), 104)).toBe(2);
    expect(previewR(trade(), NaN)).toBeNull();
  });

  it('previews options trades with the contract multiplier', () => {
    const call = trade({ tradeType: 'Call', buyPrice: 2.5, stopPrice: 1.5, targetPrice: 4.5, multiplier: 100 });
    expect(previewR(call, 4.5)).toBe(2);
  });

  it('records the exit, the close time and the plan self-check', () => {
    const t = trade();
    const update = closeUpdate(t, 98, 5000, 'N');
    expect(update).toEqual({ soldAt: 98, closedAt: 5000, followedPlan: 'N' });
    expect(tradeR({ ...t, ...update })).toBe(-1);
  });

  it('keeps an existing plan tag when none is given', () => {
    expect(closeUpdate(trade({ followedPlan: 'Y' }), 104, 1).followedPlan).toBe('Y');
  });

  it('offers stop and target as one-click exits', () => {
    expect(quickExits(trade())).toEqual([
      { label: 'Stopped out', exit: 98 },
      { label: 'Hit target', exit: 104 },
    ]);
    expect(quickExits(trade({ targetPrice: null }))).toEqual([{ label: 'Stopped out', exit: 98 }]);
  });
});
