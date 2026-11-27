/** Screener grading model (§6.6): thresholds, composite, letters, presets. */
import { describe, expect, it } from 'vitest';
import {
  dividendScore,
  extractFundamentals,
  gradeStock,
  growthScore,
  healthScore,
  isUnprofitable,
  letterGrade,
  PRESETS,
  profitabilityScore,
  TICKER_RE,
  valuationScore,
  type Fundamentals,
} from './grading';

/** Every metric unavailable; tests switch on only what they need. */
function f(patch: Partial<Fundamentals> = {}): Fundamentals {
  const blank = extractFundamentals({});
  return { ...blank, ...patch };
}

describe('extractFundamentals', () => {
  it('maps Finnhub keys and converts market cap from $M to $', () => {
    const out = extractFundamentals({
      peTTM: 25,
      marketCapitalization: 3_000_000, // $3T in millions
      'totalDebt/totalEquityAnnual': 1.2,
      currentRatioQuarterly: 1.8,
      currentRatioAnnual: 9,
    });
    expect(out.pe).toBe(25);
    expect(out.marketCap).toBe(3e12);
    expect(out.debtToEquity).toBe(1.2); // annual fallback when quarterly missing
    expect(out.currentRatio).toBe(1.8); // quarterly preferred
  });

  it('turns non-numbers into null instead of NaN', () => {
    const out = extractFundamentals({ peTTM: 'n/a', roeTTM: null, psTTM: Infinity });
    expect(out.pe).toBeNull();
    expect(out.roe).toBeNull();
    expect(out.ps).toBeNull();
  });
});

describe('isUnprofitable', () => {
  it('is true for EPS ≤ 0 or P/E ≤ 0', () => {
    expect(isUnprofitable(f({ eps: -1 }))).toBe(true);
    expect(isUnprofitable(f({ eps: 0 }))).toBe(true);
    expect(isUnprofitable(f({ pe: -5 }))).toBe(true);
    expect(isUnprofitable(f({ eps: 2, pe: 20 }))).toBe(false);
    expect(isUnprofitable(f())).toBe(false); // unknown is not "unprofitable"
  });
});

describe('category scores (§6.6 thresholds)', () => {
  it.each([
    [12, 95], [12.01, 85], [18, 85], [25, 70], [35, 55], [50, 35], [50.1, 15],
  ])('P/E %s scores %s', (pe, score) => {
    expect(valuationScore(f({ pe, eps: 1 }))).toBe(score);
  });

  it('scores an unprofitable stock 15 on P/E', () => {
    expect(valuationScore(f({ eps: -1 }))).toBe(15);
  });

  it('averages only the valuation metrics that exist, ignoring non-positive P/FCF', () => {
    // P/E 15 → 85, P/S 3 → 70, P/FCF −4 → skipped
    expect(valuationScore(f({ pe: 15, eps: 1, ps: 3, pfcf: -4 }))).toBe(77.5);
    expect(valuationScore(f())).toBeNull();
  });

  it.each([
    [26, 95], [25, 85], [16, 85], [15, 70], [8.5, 70], [8, 55], [4, 55], [3, 45], [0.1, 45], [0, 20], [-5, 20],
  ])('YoY growth %s%% scores %s (strictly-greater thresholds)', (g, score) => {
    expect(growthScore(f({ revGrowthYoy: g }))).toBe(score);
  });

  it('averages YoY and 5-year growth', () => {
    // rev YoY 30 → 95, EPS 5y 10 → 70
    expect(growthScore(f({ revGrowthYoy: 30, epsGrowth5y: 10 }))).toBe(82.5);
  });

  it('excludes gross margin from profitability', () => {
    expect(profitabilityScore(f({ grossMargin: 80 }))).toBeNull();
    // net 30 → 95, ROE 12 → 70, ROA 2 → 50
    expect(profitabilityScore(f({ netMargin: 30, roe: 12, roa: 2 }))).toBeCloseTo(71.667, 2);
  });

  it('scores financial health from current ratio, debt/equity, interest coverage', () => {
    expect(healthScore(f({ currentRatio: 2, debtToEquity: 0.3, interestCoverage: 20 }))).toBe(95);
    expect(healthScore(f({ currentRatio: 0.5, debtToEquity: 3, interestCoverage: 0.5 }))).toBeCloseTo(15, 5);
  });

  it('only scores dividends above a ~0.01% yield', () => {
    expect(dividendScore(f({ dividendYield: 0.01 }))).toBeNull();
    expect(dividendScore(f())).toBeNull();
  });

  it('treats a 6%+ yield as a possible yield trap', () => {
    expect(dividendScore(f({ dividendYield: 6 }))).toBe(50);
    expect(dividendScore(f({ dividendYield: 3 }))).toBe(90);
    // 3% → 90, payout 50 → 80, 5y growth 5 → 75
    expect(dividendScore(f({ dividendYield: 3, payoutRatio: 50, dividendGrowth5y: 5 }))).toBeCloseTo(81.667, 2);
  });
});

describe('composite grade (§6.6)', () => {
  const quality = f({
    pe: 15, eps: 5, // valuation 85
    revGrowthYoy: 20, // growth 85
    netMargin: 20, // profitability 85
    currentRatio: 2, // health 95
  });

  it('weights categories 25/25/25/15 (+10 dividend) and renormalizes', () => {
    // (85·25 + 85·25 + 85·25 + 95·15) / 90
    expect(gradeStock(quality).composite).toBeCloseTo((85 * 75 + 95 * 15) / 90, 6);
    const withDiv = gradeStock({ ...quality, dividendYield: 3 }); // dividend 90
    expect(withDiv.composite).toBeCloseTo((85 * 75 + 95 * 15 + 90 * 10) / 100, 6);
  });

  it('leaves a stock ungraded with fewer than 2 core categories (e.g. an ETF)', () => {
    expect(gradeStock(f({ pe: 15, eps: 1 })).composite).toBeNull();
    expect(gradeStock(f({ dividendYield: 2 })).composite).toBeNull();
    expect(gradeStock(f({ pe: 15, eps: 1, currentRatio: 2 })).composite).not.toBeNull();
  });
});

describe('letterGrade', () => {
  it.each([
    [85, 'A'], [84.99, 'B'], [70, 'B'], [55, 'C'], [40, 'D'], [39.99, 'F'], [null, 'n/a'],
  ])('%s → %s', (score, letter) => {
    expect(letterGrade(score)).toBe(letter);
  });
});

describe('preset screens (§6.6)', () => {
  it('Value: 0 < P/E ≤ 18 and positive net margin', () => {
    expect(PRESETS.value.test(f({ pe: 18, netMargin: 1 }))).toBe(true);
    expect(PRESETS.value.test(f({ pe: 18.5, netMargin: 1 }))).toBe(false);
    expect(PRESETS.value.test(f({ pe: -3, netMargin: 1 }))).toBe(false);
    expect(PRESETS.value.test(f({ pe: 10, netMargin: 0 }))).toBe(false);
  });

  it('Growth / Dividend / Fortress thresholds', () => {
    expect(PRESETS.growth.test(f({ revGrowthYoy: 15 }))).toBe(true);
    expect(PRESETS.growth.test(f({ revGrowthYoy: 14.9 }))).toBe(false);
    expect(PRESETS.dividend.test(f({ dividendYield: 2.5 }))).toBe(true);
    expect(PRESETS.dividend.test(f({ dividendYield: 2.4 }))).toBe(false);
    expect(PRESETS.fortress.test(f({ debtToEquity: 0.5, netMargin: 15 }))).toBe(true);
    expect(PRESETS.fortress.test(f({ debtToEquity: 0.6, netMargin: 15 }))).toBe(false);
  });

  it('never passes a stock whose data is missing', () => {
    for (const preset of Object.values(PRESETS)) expect(preset.test(f())).toBe(false);
  });
});

describe('ticker validation (§6.6)', () => {
  it.each(['AAPL', 'BRK.B', 'BF-B', 'A', 'ABCDEFGHIJ'])('accepts %s', (t) => {
    expect(TICKER_RE.test(t)).toBe(true);
  });
  it.each(['', '1ABC', '.AB', 'ABCDEFGHIJK', 'AB CD', 'AB/C'])('rejects %j', (t) => {
    expect(TICKER_RE.test(t)).toBe(false);
  });
});
