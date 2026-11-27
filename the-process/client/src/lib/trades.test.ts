/** Trade Log computed columns (§6.4) — including the confirmed P&L formula. */
import { describe, expect, it } from 'vitest';
import type { Trade } from './db';
import {
  maxDollarRisk,
  moneyResult,
  positionSize,
  rewardToRisk,
  stopDistance,
  tradeR,
} from './trades';

function trade(patch: Partial<Trade> = {}): Trade {
  return {
    date: '2026-11-02',
    symbol: 'AAPL',
    direction: 'Up',
    matchedRules: 'Y',
    tradeType: 'Stock',
    setupTag: '',
    buyPrice: 100,
    stopPrice: 98,
    targetPrice: 104,
    soldAt: null,
    multiplier: 1,
    accountSizeAtLog: 10000,
    riskPctAtLog: 1,
    rDirect: null,
    followedPlan: '',
    feeling: '',
    notes: '',
    source: 'sizer',
    createdAt: 0,
    ...patch,
  };
}

describe('computed columns (§6.4)', () => {
  it('derives stop distance, reward:risk, max risk and size', () => {
    const t = trade();
    expect(stopDistance(t)).toBe(2);
    expect(rewardToRisk(t)).toBe(2);
    expect(maxDollarRisk(t)).toBe(100);
    expect(positionSize(t)).toBe(50);
  });

  it('uses the account settings frozen on the row, not current ones', () => {
    expect(maxDollarRisk(trade({ accountSizeAtLog: 25000, riskPctAtLog: 2 }))).toBe(500);
  });

  it('returns null rather than a wrong number when inputs are missing or invalid', () => {
    expect(stopDistance(trade({ stopPrice: null }))).toBeNull();
    expect(rewardToRisk(trade({ stopPrice: 100 }))).toBeNull(); // zero stop distance
    expect(maxDollarRisk(trade({ accountSizeAtLog: 0 }))).toBeNull();
    expect(maxDollarRisk(trade({ riskPctAtLog: null }))).toBeNull();
    expect(positionSize(trade({ stopPrice: 100 }))).toBeNull();
  });
});

describe('money made or lost (confirmed formula)', () => {
  it('is null until the trade closes', () => {
    expect(moneyResult(trade())).toBeNull();
    expect(tradeR(trade())).toBeNull();
  });

  it('Up: (sold − buy) × size', () => {
    const t = trade({ soldAt: 104 });
    expect(moneyResult(t)).toBe(200); // 4 × 50
    expect(tradeR(t)).toBe(2);
  });

  it('Down: (buy − sold) × size', () => {
    const t = trade({ direction: 'Down', stopPrice: 102, targetPrice: 96, soldAt: 96 });
    expect(moneyResult(t)).toBe(200);
    expect(tradeR(t)).toBe(2);
  });

  it('a stop-out at plan is −1R', () => {
    expect(tradeR(trade({ soldAt: 98 }))).toBe(-1);
  });

  it('options rows size in contracts and multiply P&L by the multiplier', () => {
    // $100 risk, $1.00 premium stop distance × 100 = $100/contract → 1 contract
    const t = trade({ tradeType: 'Call', buyPrice: 2.5, stopPrice: 1.5, targetPrice: 4.5, multiplier: 100, soldAt: 4.5 });
    expect(positionSize(t)).toBe(1);
    expect(moneyResult(t)).toBe(200); // (4.5 − 2.5) × 1 × 100
    expect(tradeR(t)).toBe(2);
  });

  it('Guardrail rows carry their R directly, ahead of any prices', () => {
    expect(tradeR(trade({ source: 'guardrail', buyPrice: null, stopPrice: null, rDirect: -1.5 }))).toBe(-1.5);
    expect(tradeR(trade({ rDirect: 0.5, soldAt: 104 }))).toBe(0.5);
  });
});
