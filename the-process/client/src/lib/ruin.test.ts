/** Risk of Ruin Monte Carlo (§6.8.2). */
import { describe, expect, it } from 'vitest';
import { CAREERS, mulberry32, ruinBand, ruinExpectancy, ruinLadder, simulateRuin } from './ruin';

const edge = { winRatePct: 45, avgWinR: 2, avgLossR: 1, ruinDrawdownPct: 50 };

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('simulateRuin', () => {
  it('gives identical results for the same seed (stable across re-renders)', () => {
    expect(simulateRuin({ ...edge, riskPct: 5 })).toEqual(simulateRuin({ ...edge, riskPct: 5 }));
  });

  it('never ruins and never moves equity at 0% risk', () => {
    expect(simulateRuin({ ...edge, riskPct: 0 })).toEqual({ ruinProbability: 0, medianEndingMultiple: 1 });
  });

  it('never ruins a 100% win rate, compounding every trade', () => {
    const r = simulateRuin({ ...edge, winRatePct: 100, riskPct: 1 });
    expect(r.ruinProbability).toBe(0);
    expect(r.medianEndingMultiple).toBeCloseTo(Math.pow(1.02, 200), 6);
  });

  it('ruins every career that never wins, and records the median as wiped (0)', () => {
    const r = simulateRuin({ ...edge, winRatePct: 0, riskPct: 10 });
    expect(r.ruinProbability).toBe(1);
    expect(r.medianEndingMultiple).toBe(0);
  });

  it('counts landing exactly ON the drawdown line as ruin ("falls to or below")', () => {
    // Wins change nothing (avgWin 0); each loss at 50% risk × 1R lands
    // exactly on the 50% line. So a career is ruined iff it has ≥1 loss:
    // P = 1 − 0.995^200 ≈ 63.3%. If the line were exclusive it would take
    // two losses (≈26.4%), which this would catch.
    const r = simulateRuin({ winRatePct: 99.5, avgWinR: 0, avgLossR: 1, riskPct: 50, ruinDrawdownPct: 50 });
    expect(r.ruinProbability).toBeCloseTo(1 - Math.pow(0.995, 200), 1);
  });

  it('counts ruin at the drawdown line, not only at zero', () => {
    // Every loss at 50% risk halves equity: one loss reaches a 50% drawdown.
    const r = simulateRuin({ ...edge, winRatePct: 0, riskPct: 50, ruinDrawdownPct: 50 });
    expect(r.ruinProbability).toBe(1);
  });

  it('reports a probability over the full career count', () => {
    const r = simulateRuin({ ...edge, riskPct: 10 });
    expect(Number.isInteger(r.ruinProbability * CAREERS)).toBe(true);
  });
});

describe('ruinLadder', () => {
  it('runs the fixed ladder, and ruin never falls as risk % climbs', () => {
    const ladder = ruinLadder(edge);
    expect(ladder.map((r) => r.riskPct)).toEqual([0.5, 1, 2, 3, 5, 10]);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].result.ruinProbability).toBeGreaterThanOrEqual(ladder[i - 1].result.ruinProbability);
    }
    expect(ladder.at(-1)!.result.ruinProbability).toBeGreaterThan(ladder[0].result.ruinProbability);
  });
});

describe('ruinExpectancy and ruinBand', () => {
  it('computes winRate × avgWin − lossRate × avgLoss', () => {
    expect(ruinExpectancy({ ...edge, riskPct: 1 })).toBeCloseTo(0.45 * 2 - 0.55 * 1);
  });

  it('bands at 8% and 30%', () => {
    expect(ruinBand(0.079)).toBe('low');
    expect(ruinBand(0.08)).toBe('medium');
    expect(ruinBand(0.299)).toBe('medium');
    expect(ruinBand(0.3)).toBe('high');
  });
});
