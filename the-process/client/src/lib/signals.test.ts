/** Stock Analyzer engine (§6.7): scoring signals, verdict, risk grade, setups. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractFundamentals, type Fundamentals } from './grading';
import {
  applyAnalystSignal,
  applyEarningsNote,
  applyFundamentalSignals,
  applyMomentumSignals,
  applyRangeSignals,
  detectSetups,
  riskGrade,
  sma,
  technicalBias,
  verdictFor,
  type Bar,
  type ScoreState,
} from './signals';

const f = (patch: Partial<Fundamentals> = {}): Fundamentals => ({ ...extractFundamentals({}), ...patch });
const fresh = (): ScoreState => ({ score: 0, bull: [], bear: [] });

/** Daily bars from a list of closes, with a ±1 high/low band. */
const barsFrom = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: i * 86400, o: c, h: c + 1, l: c - 1, c, v: 1000 }));

describe('fundamental signals (§6.7)', () => {
  it('scores a cheap, growing, profitable, low-debt dividend payer', () => {
    const s = fresh();
    applyFundamentalSignals(s, f({ pe: 15, eps: 5, revGrowthYoy: 20, netMargin: 20, roe: 20, debtToEquity: 0.3, dividendYield: 2.5 }));
    // +2 P/E, +2 revenue, +1 margin, +1 ROE, +1 low debt, +1 dividend
    expect(s.score).toBe(8);
    expect(s.bear).toHaveLength(0);
    expect(s.bull).toHaveLength(6);
  });

  it('applies the P/E bands', () => {
    const score = (pe: number) => { const s = fresh(); applyFundamentalSignals(s, f({ pe, eps: 1 })); return s.score; };
    expect(score(18)).toBe(2);
    expect(score(30)).toBe(0);
    expect(score(40)).toBe(-1);
    expect(score(61)).toBe(-2);
  });

  it('penalizes an unprofitable company once, not again via its margin', () => {
    const s = fresh();
    applyFundamentalSignals(s, f({ eps: -1, netMargin: -10, roe: 30 }));
    expect(s.score).toBe(-2);
  });

  it('applies revenue growth bands (5–15% is +1, below 0 is −2)', () => {
    const score = (g: number) => { const s = fresh(); applyFundamentalSignals(s, f({ revGrowthYoy: g })); return s.score; };
    expect(score(16)).toBe(2);
    expect(score(5)).toBe(1);
    expect(score(3)).toBe(0);
    expect(score(-1)).toBe(-2);
  });
});

describe('analyst signal (§6.7)', () => {
  const rec = (strongBuy: number, buy: number, hold: number, sell: number, strongSell: number) =>
    ({ strongBuy, buy, hold, sell, strongSell });
  const score = (r: ReturnType<typeof rec> | null) => { const s = fresh(); applyAnalystSignal(s, r); return s.score; };

  it('ignores coverage under 5 analysts', () => {
    expect(score(rec(4, 0, 0, 0, 0))).toBe(0);
    expect(score(null)).toBe(0);
  });

  it('applies the buy/sell ratio bands', () => {
    expect(score(rec(0, 0, 7, 2, 1))).toBe(-2); // 30% sell
    expect(score(rec(10, 3, 7, 0, 0))).toBe(2); // 65% buy
    expect(score(rec(5, 0, 5, 0, 0))).toBe(1); // 50% buy
    expect(score(rec(2, 0, 8, 0, 0))).toBe(-1); // mostly hold
  });
});

describe('momentum and range signals (§6.7)', () => {
  it('scores each return window ±1 and penalizes 5-day spikes and drops', () => {
    const s = fresh();
    applyMomentumSignals(s, f({ ret13w: 5, ret26w: -2, ret52w: 0, ret5d: 9 }));
    expect(s.score).toBe(1 - 1 + 1 - 1);
    const drop = fresh();
    applyMomentumSignals(drop, f({ ret5d: -9 }));
    expect(drop.score).toBe(-1);
  });

  it('scores the 52-week position, with a no-score note after a big run', () => {
    const top = fresh();
    applyRangeSignals(top, 95, f({ week52Low: 50, week52High: 100, ret52w: 80 }));
    expect(top.score).toBe(1);
    expect(top.bear).toHaveLength(1); // "already run a lot" note
    expect(top.bear[0].pts).toBe(0);

    const bottom = fresh();
    applyRangeSignals(bottom, 55, f({ week52Low: 50, week52High: 100 }));
    expect(bottom.score).toBe(-1);

    const middle = fresh();
    applyRangeSignals(middle, 75, f({ week52Low: 50, week52High: 100 }));
    expect(middle.score).toBe(0);
  });
});

describe('earnings note (§6.7)', () => {
  afterEach(() => vi.useRealTimers());

  it('adds a bear note (no score) only within 21 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T09:00:00'));
    const soon = fresh();
    expect(applyEarningsNote(soon, '2026-11-20')).toBe(true);
    expect(soon.score).toBe(0);
    expect(soon.bear).toHaveLength(1);

    expect(applyEarningsNote(fresh(), '2026-12-15')).toBe(false); // > 21 days
    expect(applyEarningsNote(fresh(), '2026-10-30')).toBe(false); // already past
    expect(applyEarningsNote(fresh(), null)).toBe(false);
  });
});

describe('verdict (§6.7)', () => {
  it.each([
    [5, 'leans long'], [4, 'mild long bias'], [2, 'mild long bias'],
    [1.9, 'no edge either way — wait'], [-1.9, 'no edge either way — wait'],
    [-2, 'mild short bias'], [-4.9, 'mild short bias'], [-5, 'leans short'],
  ])('score %s → %s', (score, label) => {
    expect(verdictFor(score).label).toBe(label);
  });

  it('clamps the gauge to −1…+1', () => {
    expect(verdictFor(20).gauge).toBe(1);
    expect(verdictFor(-20).gauge).toBe(-1);
    expect(verdictFor(4).gauge).toBe(0.5);
  });
});

describe('risk grade (§6.7)', () => {
  it('is LOW for a stable megacap', () => {
    const r = riskGrade(f({ beta: 1, vol3m: 20, eps: 5, marketCap: 1e12, week52High: 100 }), 95, false);
    expect(r.label).toBe('LOW');
    expect(r.reasons).toHaveLength(0);
  });

  it('adds up every risk factor with a reason for each', () => {
    const r = riskGrade(
      f({ beta: 1.8, vol3m: 50, eps: -1, debtToEquity: 3, marketCap: 1e9, week52High: 100 }),
      50,
      true,
    );
    // beta 2 + vol 2 + unprofitable 2 + debt 1 + small cap 2 + <60% of high 1 + earnings 1
    expect(r.points).toBe(11);
    expect(r.label).toBe('VERY HIGH');
    expect(r.reasons).toHaveLength(7);
  });

  it.each([[1, 'LOW'], [3, 'MEDIUM'], [5, 'HIGH'], [6, 'VERY HIGH']])('%s points → %s', (pts, label) => {
    // beta 1.2–1.5 is exactly +1 point; earnings adds +1
    const patches: Record<number, Partial<Fundamentals>> = {
      1: { beta: 1.3 },
      3: { beta: 1.8, vol3m: 35 },
      5: { beta: 1.8, vol3m: 50, marketCap: 5e9 },
      6: { beta: 1.8, vol3m: 50, marketCap: 1e9 },
    };
    expect(riskGrade(f(patches[pts]), null, false).label).toBe(label);
  });
});

describe('sma', () => {
  it('is null until the window fills, then the rolling mean', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe('detectSetups (§6.7 technical read)', () => {
  it('finds nothing in a short or flat series', () => {
    expect(detectSetups(barsFrom(Array(20).fill(100)))).toEqual([]);
    expect(detectSetups(barsFrom(Array(250).fill(100)))).toEqual([]);
  });

  it('detects a breakout above the prior three-month high', () => {
    const closes = [...Array(99).fill(100), 110];
    const setups = detectSetups(barsFrom(closes));
    expect(setups.map((s) => s.kind)).toContain('breakout');
    expect(technicalBias(setups)).toBe('bullish');
  });

  it('detects a breakdown below the prior three-month low', () => {
    const setups = detectSetups(barsFrom([...Array(99).fill(100), 90]));
    expect(setups.map((s) => s.kind)).toContain('breakdown');
    expect(technicalBias(setups)).toBe('bearish');
  });

  it('detects a recent golden cross and places it where the 50-day crosses the 200-day', () => {
    // A long decline, then a sharp rally: the 50-day overtakes the 200-day late.
    const closes = [
      ...Array.from({ length: 200 }, (_, i) => 200 - i * 0.5), // 200 → 100.5
      ...Array.from({ length: 60 }, (_, i) => 100 + i * 2.5), // 100 → 247.5
    ];
    const setups = detectSetups(barsFrom(closes));
    const cross = setups.find((s) => s.kind === 'golden-cross');
    expect(cross).toBeDefined();
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const i = cross!.index;
    expect(s50[i - 1]!).toBeLessThanOrEqual(s200[i - 1]!);
    expect(s50[i]!).toBeGreaterThan(s200[i]!);
    expect(i).toBeGreaterThanOrEqual(closes.length - 60);
  });

  it('flags cooling momentum: a big 6-month gain with a flat-to-down week', () => {
    const closes = [
      ...Array.from({ length: 125 }, (_, i) => 100 + i * 0.4), // 100 → 149.6
      149, 148.5, 148, 147.5, 147,
    ];
    const kinds = detectSetups(barsFrom(closes)).map((s) => s.kind);
    expect(kinds).toContain('cooling');
    expect(kinds).not.toContain('breakout');
  });

  it('nets mixed setups to a neutral bias', () => {
    expect(technicalBias([
      { kind: 'breakout', side: 'bullish', index: 0, thesis: '' },
      { kind: 'cooling', side: 'bearish', index: 0, thesis: '' },
    ])).toBe('neutral');
    expect(technicalBias([])).toBe('neutral');
  });
});
