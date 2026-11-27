/**
 * Analytics derivations (§6.5). The insight tests pin each minimum-sample
 * gate: an insight must stay silent one trade short of its gate and fire
 * once the gate is met — the spec is explicit that firing early is a bug.
 */
import { describe, expect, it } from 'vitest';
import type { Trade } from './db';
import {
  generateInsights,
  groupPerformance,
  netRByMonth,
  netRByWeekday,
  planAdherence,
  resultPoints,
  rHistogram,
  rollingWinRate,
  type ResultPoint,
} from './analytics';
import { coreStats } from './stats';

const pt = (r: number, patch: Partial<ResultPoint> = {}): ResultPoint => ({
  r,
  date: '2026-11-03', // a Tuesday
  symbol: 'AAPL',
  setupTag: '',
  followedPlan: '',
  ...patch,
});

/** Spread results over distinct weekdays-agnostic dates so the trade cap isn't tripped. */
const spread = (rs: number[], patch: Partial<ResultPoint> = {}) =>
  rs.map((r, i) => pt(r, { date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, ...patch }));

const insights = (points: ResultPoint[], maxTradesPerDay = 0, riskPct = 1) =>
  generateInsights({ points, stats: coreStats(points.map((p) => p.r)), maxTradesPerDay, riskPct }).map((i) => i.text);

describe('resultPoints', () => {
  it('orders by date then creation time and drops trades with no R yet', () => {
    const base = { direction: 'Up', matchedRules: '', tradeType: 'Stock', setupTag: '', buyPrice: null, stopPrice: null, targetPrice: null, soldAt: null, multiplier: 1, accountSizeAtLog: 10000, riskPctAtLog: 1, followedPlan: '', feeling: '', notes: '', source: 'guardrail' } as const;
    const trades: Trade[] = [
      { ...base, symbol: 'B', date: '2026-11-02', createdAt: 2, rDirect: 2 },
      { ...base, symbol: 'A', date: '2026-11-02', createdAt: 1, rDirect: -1 },
      { ...base, symbol: 'OPEN', date: '2026-11-01', createdAt: 0, rDirect: null },
      { ...base, symbol: 'C', date: '2026-11-01', createdAt: 9, rDirect: 1 },
    ];
    expect(resultPoints(trades).map((p) => p.symbol)).toEqual(['C', 'A', 'B']);
  });
});

describe('rHistogram (§6.5 buckets)', () => {
  it('puts boundary values in the right bucket', () => {
    const counts = rHistogram([-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 2, 2.9, 3, 7]).map((b) => b.count);
    // ≤−2 | −2…−1 | −1…0 | 0…1 | 1…2 | 2…3 | 3+
    expect(counts).toEqual([2, 2, 1, 2, 1, 2, 2]);
  });
});

describe('rollingWinRate (§6.5)', () => {
  it('stays empty under 8 trades', () => {
    expect(rollingWinRate(Array(7).fill(1))).toEqual([]);
  });

  it('shrinks the window for small samples: max(5, floor(n/2))', () => {
    const pts = rollingWinRate(Array(12).fill(1)); // window 6
    expect(pts[0].trade).toBe(6);
    expect(pts).toHaveLength(7);
  });

  it('caps the window at 20 trades', () => {
    const rs = [...Array(20).fill(-1), ...Array(30).fill(1)];
    const pts = rollingWinRate(rs);
    expect(pts[0]).toEqual({ trade: 20, winRate: 0 });
    expect(pts.at(-1)).toEqual({ trade: 50, winRate: 100 });
  });
});

describe('weekday and month breakdowns', () => {
  it('sums R per weekday, ignoring weekends', () => {
    const rows = netRByWeekday([
      pt(2, { date: '2026-11-02' }), // Mon
      pt(-1, { date: '2026-11-02' }),
      pt(3, { date: '2026-11-06' }), // Fri
      pt(5, { date: '2026-11-07' }), // Sat — ignored
    ]);
    expect(rows.find((r) => r.day === 'Mon')).toEqual({ day: 'Mon', netR: 1, count: 2 });
    expect(rows.find((r) => r.day === 'Fri')?.netR).toBe(3);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(3);
  });

  it('covers the 6 most recent months, including the current one', () => {
    const rows = netRByMonth(
      [pt(2, { date: '2026-11-15' }), pt(-1, { date: '2026-06-01' }), pt(9, { date: '2026-05-31' })],
      new Date(2026, 10, 20),
    );
    expect(rows.map((r) => r.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(rows[0].netR).toBe(-1); // May is outside the window
    expect(rows[5].netR).toBe(2);
  });

  it('crosses a year boundary correctly', () => {
    expect(netRByMonth([], new Date(2027, 1, 1)).map((r) => r.month)[0]).toBe('2026-09');
  });
});

describe('planAdherence (§6.5 gate: ≥5 tagged, ≥3 per side)', () => {
  it('is not meaningful until both sides have 3', () => {
    const p = planAdherence([...Array(4).fill(pt(1, { followedPlan: 'Y' })), ...Array(2).fill(pt(-1, { followedPlan: 'N' }))]);
    expect(p.meaningful).toBe(false);
    expect(p.tagged).toBe(6);
  });

  it('computes adherence and each side’s average R', () => {
    const p = planAdherence([
      ...Array(3).fill(pt(2, { followedPlan: 'Y' })),
      ...Array(3).fill(pt(-1, { followedPlan: 'N' })),
      pt(5), // untagged — ignored
    ]);
    expect(p.meaningful).toBe(true);
    expect(p.adherencePct).toBe(50);
    expect(p.avgRFollowed).toBe(2);
    expect(p.avgRBroke).toBe(-1);
  });
});

describe('groupPerformance', () => {
  it('groups by key, skips blanks, sorts by net R', () => {
    const rows = groupPerformance(
      [pt(2, { symbol: 'NVDA' }), pt(-1, { symbol: 'NVDA' }), pt(-3, { symbol: 'TSLA' }), pt(1, { symbol: ' ' })],
      'symbol',
    );
    expect(rows.map((r) => r.key)).toEqual(['NVDA', 'TSLA']);
    expect(rows[0]).toEqual({ key: 'NVDA', count: 2, winRate: 50, netR: 1 });
  });
});

describe('generateInsights — minimum-sample gates (§6.5)', () => {
  it('says nothing for an empty log', () => {
    expect(insights([])).toEqual([]);
  });

  it('flags a small sample below 30 trades, and stops at 30', () => {
    expect(insights(spread(Array(29).fill(0.5))).some((t) => /too small a sample/.test(t))).toBe(true);
    expect(insights(spread(Array(30).fill(0.5))).some((t) => /too small a sample/.test(t))).toBe(false);
  });

  it('gives expectancy messaging only from 10 trades', () => {
    const has = (n: number) => insights(spread(Array(n).fill(-0.5))).some((t) => /Expectancy is/.test(t));
    expect(has(9)).toBe(false);
    expect(has(10)).toBe(true);
  });

  it('flags slipping stops (avg loss > 1.2R) only from 5 losses', () => {
    const has = (n: number) => insights(spread(Array(n).fill(-1.5))).some((t) => /average loss is/.test(t));
    expect(has(4)).toBe(false);
    expect(has(5)).toBe(true);
  });

  it('calls out a single trade worse than −2R with no gate', () => {
    expect(insights([pt(-2.5)]).some((t) => /worst trade cost -2.5R/.test(t))).toBe(true);
    expect(insights([pt(-2)]).some((t) => /worst trade/.test(t))).toBe(false);
  });

  it('reads profit factor from 15 trades, and only when it is finite', () => {
    const healthy = (n: number) => spread([...Array(n - 1).fill(2), -1]);
    expect(insights(healthy(14)).some((t) => /Profit factor/.test(t))).toBe(false);
    expect(insights(healthy(15)).some((t) => /healthy engine/.test(t))).toBe(true);
    expect(insights(spread(Array(15).fill(1))).some((t) => /Profit factor/.test(t))).toBe(false); // ∞
  });

  it('flags a losing weekday only with 5+ trades on it', () => {
    const tuesdays = (n: number) => Array.from({ length: n }, () => pt(-0.5, { date: '2026-11-03' }));
    // Many trades on one date would also trip the cap insight, so the cap is off (0).
    expect(insights(tuesdays(4)).some((t) => /Tuesdays are costing you/.test(t))).toBe(false);
    expect(insights(tuesdays(5)).some((t) => /Tuesdays are costing you/.test(t))).toBe(true);
  });

  it('counts days over the trade cap', () => {
    const pts = [
      ...Array(4).fill(pt(1, { date: '2026-11-02' })),
      ...Array(4).fill(pt(1, { date: '2026-11-03' })),
      ...Array(3).fill(pt(1, { date: '2026-11-04' })),
    ];
    expect(insights(pts, 3).some((t) => /cap on 2 days/.test(t))).toBe(true);
    expect(insights(pts, 0).some((t) => /cap/.test(t))).toBe(false); // 0 = no cap
  });

  it('reports recent form from 20 trades', () => {
    const cold = (n: number) => spread([...Array(n - 10).fill(1), ...Array(10).fill(-0.5)]);
    expect(insights(cold(19)).some((t) => /Recent form is cold/.test(t))).toBe(false);
    expect(insights(cold(20)).some((t) => /Recent form is cold/.test(t))).toBe(true);
  });

  it('prices a 5-trade losing streak at the current risk %', () => {
    const texts = insights(spread([1, -1, -1, -1, -1, -1]), 0, 1);
    expect(texts.some((t) => /longest losing streak is 5.*4\.9% of the account/.test(t))).toBe(true);
    expect(insights(spread([-1, -1, -1, -1])).some((t) => /losing streak/.test(t))).toBe(false);
  });

  it('prices plan adherence from 10 tagged trades with 3+ per side', () => {
    const tagged = (yes: number, no: number) =>
      spread([...Array(yes).fill(1), ...Array(no).fill(-1)]).map((p, i) => ({ ...p, followedPlan: (i < yes ? 'Y' : 'N') as 'Y' | 'N' }));
    expect(insights(tagged(6, 3)).some((t) => /Following your plan is worth/.test(t))).toBe(false); // 9 tagged
    expect(insights(tagged(7, 3)).some((t) => /Following your plan is worth \+2\.00R/.test(t))).toBe(true);
  });

  it('needs 3+ per side for the gap, even with 10+ tagged', () => {
    const pts = spread(Array(12).fill(1)).map((p, i) => ({ ...p, followedPlan: (i < 10 ? 'Y' : 'N') as 'Y' | 'N' }));
    expect(insights(pts).some((t) => /Following your plan is worth/.test(t))).toBe(false); // only 2 broke
  });

  it('flags plan adherence below 75%', () => {
    const pts = spread(Array(10).fill(1)).map((p, i) => ({ ...p, followedPlan: (i < 7 ? 'Y' : 'N') as 'Y' | 'N' }));
    expect(insights(pts).some((t) => /Plan adherence is 70%/.test(t))).toBe(true);
  });

  it('suggests a ban for a symbol down 2R+ over 5+ trades', () => {
    const tsla = (n: number) => spread(Array(n).fill(-0.5), { symbol: 'TSLA' });
    expect(insights(tsla(4)).some((t) => /TSLA has cost you/.test(t))).toBe(false);
    expect(insights(tsla(5)).some((t) => /TSLA has cost you -2.5R/.test(t))).toBe(true);
  });
});
