/** Spec §6.5 core stats, equity curve/drawdown, and the two streak computations. */
import { describe, expect, it } from 'vitest';
import { coreStats, equityCurve, streaks } from './stats';

describe('coreStats (§6.5)', () => {
  it('computes every figure for a mixed sample', () => {
    const s = coreStats([2, -1, 0, 3, -1]);
    expect(s.total).toBe(5);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.breakeven).toBe(1);
    expect(s.netR).toBe(3);
    expect(s.grossWin).toBe(5);
    expect(s.grossLoss).toBe(2);
    expect(s.winRate).toBe(0.5); // breakevens are not "decided"
    expect(s.avgWin).toBe(2.5);
    expect(s.avgLoss).toBe(1);
    expect(s.expectancy).toBeCloseTo(0.6); // net / ALL results, breakevens included
    expect(s.profitFactor).toBe(2.5);
  });

  it('leaves figures undefined when there is nothing to compute them from', () => {
    const empty = coreStats([]);
    expect(empty.winRate).toBeUndefined();
    expect(empty.expectancy).toBeUndefined();
    expect(empty.profitFactor).toBeUndefined();
    expect(coreStats([0, 0]).winRate).toBeUndefined(); // no decided trades
    expect(coreStats([1]).avgLoss).toBeUndefined();
    expect(coreStats([-1]).avgWin).toBeUndefined();
  });

  it('reports an infinite profit factor with wins and no losses', () => {
    expect(coreStats([1, 2]).profitFactor).toBe(Infinity);
  });
});

describe('equityCurve (§6.5)', () => {
  it('accumulates R and measures drawdown from the running peak', () => {
    const { points, maxDrawdown } = equityCurve([2, -1, -2, 3, -1]);
    expect(points.map((p) => p.cumR)).toEqual([2, 1, -1, 2, 1]);
    expect(points.map((p) => p.drawdown)).toEqual([0, 1, 3, 0, 1]);
    expect(maxDrawdown).toBe(3);
    expect(points[0].index).toBe(1);
  });

  it('counts a slide from the starting 0 as drawdown', () => {
    expect(equityCurve([-1, -1]).maxDrawdown).toBe(2);
  });

  it('handles an empty log', () => {
    expect(equityCurve([])).toEqual({ points: [], maxDrawdown: 0 });
  });
});

describe('streaks (§6.5)', () => {
  it('finds the longest runs scanning oldest → newest', () => {
    const s = streaks([1, 1, 1, -1, -1, 1, -1, -1, -1, -1]);
    expect(s.longestWin).toBe(3);
    expect(s.longestLoss).toBe(4);
  });

  it('reports the current streak backward from the latest result', () => {
    expect(streaks([-1, 1, 1]).current).toBe(2);
    expect(streaks([1, -1, -1, -1]).current).toBe(-3);
  });

  it('lets an exact 0 break both kinds of streak', () => {
    expect(streaks([1, 1, 0, 1]).longestWin).toBe(2);
    expect(streaks([1, 1, 0]).current).toBe(0); // latest is a scratch
    expect(streaks([-1, 0, -1, -1]).current).toBe(-2);
  });

  it('is all zeros for an empty log', () => {
    expect(streaks([])).toEqual({ longestWin: 0, longestLoss: 0, current: 0 });
  });
});
