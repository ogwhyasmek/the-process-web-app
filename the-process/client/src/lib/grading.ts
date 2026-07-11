/**
 * Screener grading model (spec §6.6) — every threshold exactly as
 * written. Pure functions over a normalized metrics shape so the
 * scoring can be golden-tested without any I/O.
 */

/** Normalized fundamentals for one stock, extracted from Finnhub metric=all. */
export interface Fundamentals {
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  ps: number | null;
  evEbitda: number | null;
  pfcf: number | null;
  revGrowthYoy: number | null;
  epsGrowthYoy: number | null;
  revGrowth5y: number | null;
  epsGrowth5y: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
  roe: number | null;
  roa: number | null;
  roi: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  debtToEquity: number | null;
  interestCoverage: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  dividendGrowth5y: number | null;
  eps: number | null;
  /** Market cap in dollars (Finnhub reports $ millions; converted here). */
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  vol3m: number | null;
  ret5d: number | null;
  ret13w: number | null;
  ret26w: number | null;
  ret52w: number | null;
  relSp13w: number | null;
  relSp26w: number | null;
  relSp52w: number | null;
  netMargin5y: number | null;
  payout5yGrowthNote?: never;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : null;

/** Map a raw Finnhub `{ metric: {...} }` blob to the normalized shape. */
export function extractFundamentals(metric: Record<string, unknown>): Fundamentals {
  const m = (k: string) => num(metric[k]);
  const capMillions = m('marketCapitalization');
  return {
    pe: m('peTTM'),
    forwardPe: m('forwardPE'),
    peg: m('pegTTM'),
    ps: m('psTTM'),
    evEbitda: m('evEbitdaTTM'),
    pfcf: m('pfcfShareTTM'),
    revGrowthYoy: m('revenueGrowthTTMYoy'),
    epsGrowthYoy: m('epsGrowthTTMYoy'),
    revGrowth5y: m('revenueGrowth5Y'),
    epsGrowth5y: m('epsGrowth5Y'),
    netMargin: m('netProfitMarginTTM'),
    operatingMargin: m('operatingMarginTTM'),
    grossMargin: m('grossMarginTTM'),
    roe: m('roeTTM'),
    roa: m('roaTTM'),
    roi: m('roiTTM'),
    currentRatio: m('currentRatioQuarterly') ?? m('currentRatioAnnual'),
    quickRatio: m('quickRatioQuarterly') ?? m('quickRatioAnnual'),
    debtToEquity: m('totalDebt/totalEquityQuarterly') ?? m('totalDebt/totalEquityAnnual'),
    interestCoverage: m('netInterestCoverageTTM') ?? m('netInterestCoverageAnnual'),
    dividendYield: m('dividendYieldIndicatedAnnual'),
    payoutRatio: m('payoutRatioTTM') ?? m('payoutRatioAnnual'),
    dividendGrowth5y: m('dividendGrowthRate5Y'),
    eps: m('epsTTM'),
    marketCap: capMillions == null ? null : capMillions * 1e6,
    week52High: m('52WeekHigh'),
    week52Low: m('52WeekLow'),
    beta: m('beta'),
    vol3m: m('3MonthADReturnStd'),
    ret5d: m('5DayPriceReturnDaily'),
    ret13w: m('13WeekPriceReturnDaily'),
    ret26w: m('26WeekPriceReturnDaily'),
    ret52w: m('52WeekPriceReturnDaily'),
    relSp13w: m('priceRelativeToS&P50013Week'),
    relSp26w: m('priceRelativeToS&P50026Week'),
    relSp52w: m('priceRelativeToS&P50052Week'),
    netMargin5y: m('netProfitMargin5Y'),
  };
}

/** A stock is "unprofitable" for grading when EPS ≤ 0 or P/E ≤ 0. */
export function isUnprofitable(f: Fundamentals): boolean {
  return (f.eps != null && f.eps <= 0) || (f.pe != null && f.pe <= 0);
}

// ---------------------------------------------------------------------------
// Sub-scores (§6.6) — each returns null when its input is unavailable.
// ---------------------------------------------------------------------------

const avg = (xs: (number | null)[]): number | null => {
  const have = xs.filter((x): x is number => x != null);
  return have.length === 0 ? null : have.reduce((a, b) => a + b, 0) / have.length;
};

export function valuationScore(f: Fundamentals): number | null {
  const peScore = isUnprofitable(f)
    ? 15
    : f.pe == null
      ? null
      : f.pe <= 12 ? 95 : f.pe <= 18 ? 85 : f.pe <= 25 ? 70 : f.pe <= 35 ? 55 : f.pe <= 50 ? 35 : 15;
  const pegScore =
    f.peg == null || f.peg <= 0
      ? null
      : f.peg <= 1 ? 95 : f.peg <= 1.5 ? 80 : f.peg <= 2 ? 65 : f.peg <= 3 ? 45 : 25;
  const psScore =
    f.ps == null ? null : f.ps <= 2 ? 85 : f.ps <= 5 ? 70 : f.ps <= 10 ? 50 : 30;
  const evScore =
    f.evEbitda == null || f.evEbitda <= 0
      ? null
      : f.evEbitda <= 10 ? 90 : f.evEbitda <= 15 ? 75 : f.evEbitda <= 25 ? 55 : 30;
  const pfcfScore =
    f.pfcf == null || f.pfcf <= 0 // only if positive (§6.6)
      ? null
      : f.pfcf <= 15 ? 90 : f.pfcf <= 25 ? 70 : f.pfcf <= 40 ? 50 : 30;
  return avg([peScore, pegScore, psScore, evScore, pfcfScore]);
}

const yoyScore = (g: number | null): number | null =>
  g == null ? null : g > 25 ? 95 : g > 15 ? 85 : g > 8 ? 70 : g > 3 ? 55 : g > 0 ? 45 : 20;
const cagrScore = (g: number | null): number | null =>
  g == null ? null : g > 12 ? 85 : g > 7 ? 70 : g > 3 ? 55 : g > 0 ? 45 : 25;

export function growthScore(f: Fundamentals): number | null {
  return avg([
    yoyScore(f.revGrowthYoy),
    yoyScore(f.epsGrowthYoy),
    cagrScore(f.revGrowth5y),
    cagrScore(f.epsGrowth5y),
  ]);
}

const marginScore = (m: number | null): number | null =>
  m == null ? null : m > 25 ? 95 : m > 15 ? 85 : m > 8 ? 70 : m > 3 ? 55 : m > 0 ? 45 : 10;

export function profitabilityScore(f: Fundamentals): number | null {
  const roeScore =
    f.roe == null ? null : f.roe > 30 ? 95 : f.roe > 18 ? 85 : f.roe > 10 ? 70 : f.roe > 5 ? 55 : f.roe > 0 ? 45 : 10;
  const roaScore =
    f.roa == null ? null : f.roa > 15 ? 95 : f.roa > 8 ? 80 : f.roa > 4 ? 65 : f.roa > 0 ? 50 : 10;
  // Note: gross margin is deliberately not part of this category (§6.6).
  return avg([marginScore(f.netMargin), marginScore(f.operatingMargin), roeScore, roaScore]);
}

export function healthScore(f: Fundamentals): number | null {
  const crScore =
    f.currentRatio == null
      ? null
      : f.currentRatio >= 2 ? 95 : f.currentRatio >= 1.5 ? 85 : f.currentRatio >= 1 ? 65 : f.currentRatio >= 0.8 ? 45 : 20;
  const deScore =
    f.debtToEquity == null
      ? null
      : f.debtToEquity <= 0.3 ? 95 : f.debtToEquity <= 0.8 ? 85 : f.debtToEquity <= 1.5 ? 65 : f.debtToEquity <= 2.5 ? 40 : 15;
  const icScore =
    f.interestCoverage == null
      ? null
      : f.interestCoverage >= 20 ? 95 : f.interestCoverage >= 8 ? 80 : f.interestCoverage >= 3 ? 60 : f.interestCoverage >= 1 ? 35 : 10;
  return avg([crScore, deScore, icScore]);
}

export function dividendScore(f: Fundamentals): number | null {
  // No score at all unless the stock pays a meaningful dividend (§6.6).
  if (f.dividendYield == null || f.dividendYield <= 0.01) return null;
  const y = f.dividendYield;
  const yieldScore = y >= 6 ? 50 : y >= 4 ? 75 : y >= 2 ? 90 : y >= 0.5 ? 70 : 55;
  const payoutScore =
    f.payoutRatio == null || f.payoutRatio <= 0
      ? null
      : f.payoutRatio <= 40 ? 95 : f.payoutRatio <= 60 ? 80 : f.payoutRatio <= 80 ? 55 : 25;
  const growth =
    f.dividendGrowth5y == null
      ? null
      : f.dividendGrowth5y >= 8 ? 90 : f.dividendGrowth5y >= 4 ? 75 : f.dividendGrowth5y >= 0 ? 60 : 35;
  return avg([yieldScore, payoutScore, growth]);
}

// ---------------------------------------------------------------------------
// Composite + letter grades
// ---------------------------------------------------------------------------

export interface Grades {
  valuation: number | null;
  growth: number | null;
  profitability: number | null;
  health: number | null;
  dividend: number | null;
  /** null → ungraded (fund/ETF — fewer than 2 core categories with data). */
  composite: number | null;
}

const WEIGHTS = { valuation: 25, growth: 25, profitability: 25, health: 15, dividend: 10 } as const;

export function gradeStock(f: Fundamentals): Grades {
  const cats = {
    valuation: valuationScore(f),
    growth: growthScore(f),
    profitability: profitabilityScore(f),
    health: healthScore(f),
    dividend: dividendScore(f),
  };
  const coreAvailable = [cats.valuation, cats.growth, cats.profitability, cats.health].filter(
    (s) => s != null,
  ).length;
  if (coreAvailable < 2) return { ...cats, composite: null };

  let weightSum = 0;
  let scoreSum = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const s = cats[key];
    if (s != null) {
      weightSum += WEIGHTS[key];
      scoreSum += s * WEIGHTS[key];
    }
  }
  return { ...cats, composite: weightSum === 0 ? null : scoreSum / weightSum };
}

export function letterGrade(score: number | null): string {
  if (score == null) return 'n/a';
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}

// ---------------------------------------------------------------------------
// Preset filters (§6.6)
// ---------------------------------------------------------------------------

export type PresetName = 'value' | 'growth' | 'dividend' | 'fortress';

export const PRESETS: Record<PresetName, { label: string; test: (f: Fundamentals) => boolean }> = {
  value: {
    label: 'Value',
    test: (f) =>
      f.pe != null && f.pe > 0 && f.pe <= 18 && f.netMargin != null && f.netMargin > 0,
  },
  growth: {
    label: 'Growth',
    test: (f) => f.revGrowthYoy != null && f.revGrowthYoy >= 15,
  },
  dividend: {
    label: 'Dividend',
    test: (f) => f.dividendYield != null && f.dividendYield >= 2.5,
  },
  fortress: {
    label: 'Fortress',
    test: (f) =>
      f.debtToEquity != null && f.debtToEquity <= 0.5 && f.netMargin != null && f.netMargin >= 15,
  },
};

/** §6.6 ticker validation: letter first, then letters/digits/periods/hyphens, ≤10. */
export const TICKER_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/;
