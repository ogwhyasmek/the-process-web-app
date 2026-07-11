/**
 * Stock Analyzer engine (spec §6.7) — the running score with bull/bear
 * sentences, the verdict, the risk grade, and technical setup detection
 * over daily OHLC bars. All pure; thresholds exactly as specified.
 */
import type { Fundamentals } from './grading';
import { isUnprofitable } from './grading';

export interface Signal {
  /** Absolute point weight, for strongest-first sorting. */
  pts: number;
  text: string;
}

export interface ScoreState {
  score: number;
  bull: Signal[];
  bear: Signal[];
}

/** Push a scored sentence; positive → bull, negative → bear, 0 → note. */
function sig(state: ScoreState, pts: number, text: string, noteSide?: 'bull' | 'bear') {
  state.score += pts;
  const side = pts > 0 ? 'bull' : pts < 0 ? 'bear' : noteSide;
  if (side) state[side].push({ pts: Math.abs(pts), text });
}

// ---------------------------------------------------------------------------
// Fundamental signals (§6.7) — skipped entirely for ETFs/funds.
// ---------------------------------------------------------------------------

export function applyFundamentalSignals(state: ScoreState, f: Fundamentals): void {
  const unprofitable = isUnprofitable(f);
  if (unprofitable) {
    sig(state, -2, "Not profitable — you're betting on a story, not on earnings that exist today.");
  } else if (f.pe != null) {
    if (f.pe <= 18) sig(state, +2, `P/E of ${f.pe.toFixed(1)} — reasonably priced for every $1 of profit.`);
    else if (f.pe > 60) sig(state, -2, `P/E of ${f.pe.toFixed(0)} — priced for perfection; disappointment gets punished hard.`);
    else if (f.pe > 35) sig(state, -1, `P/E of ${f.pe.toFixed(0)} — expensive; a lot of future growth is already in the price.`);
  }
  if (f.revGrowthYoy != null) {
    if (f.revGrowthYoy > 15) sig(state, +2, `Revenue growing ${f.revGrowthYoy.toFixed(0)}% a year — the business itself is expanding fast.`);
    else if (f.revGrowthYoy >= 5) sig(state, +1, `Revenue growing a solid ${f.revGrowthYoy.toFixed(0)}% a year.`);
    else if (f.revGrowthYoy < 0) sig(state, -2, `Revenue is shrinking (${f.revGrowthYoy.toFixed(1)}%/yr) — the business is getting smaller.`);
  }
  if (!unprofitable && f.netMargin != null) {
    if (f.netMargin > 15) sig(state, +1, `Keeps ${f.netMargin.toFixed(0)}¢ of every $1 of sales as profit — strong margins.`);
    else if (f.netMargin < 0) sig(state, -2, 'Negative profit margin — operations currently lose money.');
  }
  if (!unprofitable && f.roe != null && f.roe > 15) {
    sig(state, +1, `Return on equity ${f.roe.toFixed(0)}% — management turns shareholder money into profit efficiently.`);
  }
  if (f.debtToEquity != null) {
    if (f.debtToEquity > 2) sig(state, -1, `Heavy debt: about $${f.debtToEquity.toFixed(1)} owed per $1 of equity — less room to survive bad years.`);
    else if (f.debtToEquity < 0.5) sig(state, +1, 'Low debt — a clean balance sheet that can ride out downturns.');
  }
  if (f.dividendYield != null && f.dividendYield > 2) {
    sig(state, +1, `Pays a ${f.dividendYield.toFixed(1)}% dividend — you get paid while you wait.`);
  }
}

// ---------------------------------------------------------------------------
// Analyst consensus (§6.7) — only with ≥5 analysts.
// ---------------------------------------------------------------------------

export interface Recommendation {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export function applyAnalystSignal(state: ScoreState, rec: Recommendation | null): void {
  if (!rec) return;
  const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
  if (total < 5) return;
  const buyN = rec.strongBuy + rec.buy;
  const sellN = rec.sell + rec.strongSell;
  const buyR = buyN / total;
  const sellR = sellN / total;
  if (sellR >= 0.3) sig(state, -2, `${sellN} of ${total} analysts say Sell — rare and loud; analysts almost never say sell.`);
  else if (buyR >= 0.65) sig(state, +2, `${buyN} of ${total} analysts covering it rate it a Buy.`);
  else if (buyR >= 0.5) sig(state, +1, `A slim majority of the ${total} analysts covering it rate it a Buy.`);
  else sig(state, -1, `Most of the ${total} analysts are sitting on Hold — little conviction either way.`);
}

// ---------------------------------------------------------------------------
// Momentum + 52-week range signals (§6.7)
// ---------------------------------------------------------------------------

export function applyMomentumSignals(state: ScoreState, f: Fundamentals): void {
  const windows: Array<[number | null, string]> = [
    [f.ret13w, '3-month'],
    [f.ret26w, '6-month'],
    [f.ret52w, '1-year'],
  ];
  for (const [ret, label] of windows) {
    if (ret == null) continue;
    if (ret >= 0) sig(state, +1, `${label} return is positive (${ret >= 0 ? '+' : ''}${ret.toFixed(0)}%) — the trend has been up.`);
    else sig(state, -1, `${label} return is negative (${ret.toFixed(0)}%) — the trend has been down.`);
  }
  if (f.ret5d != null) {
    if (f.ret5d > 8) sig(state, -1, `Up ${f.ret5d.toFixed(1)}% in 5 days — a spike; chasing it here is paying top-of-move prices.`);
    else if (f.ret5d < -8) sig(state, -1, `Down ${f.ret5d.toFixed(1)}% in 5 days — a sharp drop; catching falling knives costs fingers.`);
  }
}

export function applyRangeSignals(state: ScoreState, price: number, f: Fundamentals): void {
  if (f.week52High == null || f.week52Low == null || f.week52High <= f.week52Low) return;
  const pos = (price - f.week52Low) / (f.week52High - f.week52Low);
  if (pos >= 0.85) {
    sig(state, +1, 'Trading in the top 15% of its 52-week range — strength, not weakness.');
    if (f.ret52w != null && f.ret52w > 60) {
      // Bear-list note only, no score change (§6.7).
      sig(state, 0, `Already up ${f.ret52w.toFixed(0)}% in a year and near the top of its range — a lot of the move may be behind it.`, 'bear');
    }
  } else if (pos <= 0.2) {
    sig(state, -1, 'Trading in the bottom 20% of its 52-week range — the market has been selling this.');
  }
}

/** Earnings within 21 days: bear note + UI callout, no score (§6.7). */
export function applyEarningsNote(state: ScoreState, earningsDate: string | null): boolean {
  if (!earningsDate) return false;
  const days = (new Date(`${earningsDate}T12:00:00`).getTime() - Date.now()) / 86400e3;
  if (days < 0 || days > 21) return false;
  sig(state, 0, `Earnings on ${earningsDate} (${Math.ceil(days)} days away) — event risk: the stock can gap through any stop overnight.`, 'bear');
  return true;
}

// ---------------------------------------------------------------------------
// Verdict (§6.7)
// ---------------------------------------------------------------------------

export interface Verdict {
  label: string;
  detail: string;
  /** −1 … +1 position for the gauge needle. */
  gauge: number;
}

export function verdictFor(score: number): Verdict {
  const gauge = Math.max(-1, Math.min(1, score / 8));
  if (score >= 5) return { gauge, label: 'leans long', detail: 'Clearly more bullish signals than bearish ones.' };
  if (score >= 2) return { gauge, label: 'mild long bias', detail: 'Leaning long, but not decisively.' };
  if (score > -2) return { gauge, label: 'no edge either way — wait', detail: 'The signals cancel out. Waiting costs nothing.' };
  if (score > -5) return { gauge, label: 'mild short bias', detail: 'For most people this simply reads: avoid the stock.' };
  return {
    gauge,
    label: 'leans short',
    detail: 'Mostly bearish signals. Shorting carries theoretically unlimited loss — for most people this just means staying away.',
  };
}

// ---------------------------------------------------------------------------
// Risk grade (§6.7) — independent of direction.
// ---------------------------------------------------------------------------

export interface RiskGrade {
  points: number;
  label: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
  reasons: string[];
}

export function riskGrade(
  f: Fundamentals,
  price: number | null,
  earningsWithin3w: boolean,
): RiskGrade {
  let points = 0;
  const reasons: string[] = [];
  const add = (p: number, why: string) => {
    points += p;
    reasons.push(why);
  };

  if (f.beta != null) {
    if (f.beta > 1.5) add(2, `Swings about ${f.beta.toFixed(1)}× harder than the market.`);
    else if (f.beta >= 1.2) add(1, `Somewhat jumpier than the market (beta ${f.beta.toFixed(1)}).`);
  }
  if (f.vol3m != null) {
    if (f.vol3m > 45) add(2, `Very high recent volatility (${f.vol3m.toFixed(0)}% over 3 months).`);
    else if (f.vol3m >= 30) add(1, `Elevated recent volatility (${f.vol3m.toFixed(0)}% over 3 months).`);
  }
  if (isUnprofitable(f)) add(2, 'Not yet profitable — priced on hope, so sentiment moves it hard.');
  if (f.debtToEquity != null && f.debtToEquity > 2) add(1, 'Heavy debt load amplifies bad news.');
  if (f.marketCap != null) {
    if (f.marketCap < 2e9) add(2, 'Small company — thinner trading, easier to whipsaw.');
    else if (f.marketCap < 10e9) add(1, 'Mid-size company — moves harder than megacaps.');
  }
  if (price != null && f.week52High != null && price < 0.6 * f.week52High) {
    add(1, 'Trading below 60% of its 52-week high — broken stocks often stay broken a while.');
  }
  if (earningsWithin3w) add(1, 'Earnings inside 3 weeks — overnight gap risk.');

  const label = points <= 1 ? 'LOW' : points <= 3 ? 'MEDIUM' : points <= 5 ? 'HIGH' : 'VERY HIGH';
  return { points, label, reasons };
}

// ---------------------------------------------------------------------------
// Technical read (§6.7) — moving averages + auto-detected setups over bars.
// ---------------------------------------------------------------------------

export interface Bar {
  t: number; // seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Simple moving average series; null until enough history. */
export function sma(closes: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= window) sum -= closes[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

export interface DetectedSetup {
  kind: 'golden-cross' | 'death-cross' | 'breakout' | 'breakdown' | 'cooling' | 'turning';
  side: 'bullish' | 'bearish';
  /** Index into the bars array where the marker is drawn. */
  index: number;
  thesis: string;
}

/**
 * Detect the §6.7 setups over the full bar history:
 * - golden/death cross: 50-day SMA crossing the 200-day (recent = last ~60 sessions)
 * - breakout/breakdown: last close above the prior 60-session high (or below the low),
 *   excluding the most recent 5 sessions from the reference band
 * - momentum shifts: strong 6-month move with a flat/opposite last week
 */
export function detectSetups(bars: Bar[]): DetectedSetup[] {
  const setups: DetectedSetup[] = [];
  const closes = bars.map((b) => b.c);
  const n = closes.length;
  if (n < 30) return setups;

  // --- moving-average crosses (need 200 days of history) ---
  if (n >= 201) {
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const from = Math.max(200, n - 60);
    for (let i = n - 1; i >= from; i--) {
      const a50 = s50[i - 1]!;
      const b50 = s50[i]!;
      const a200 = s200[i - 1]!;
      const b200 = s200[i]!;
      if (a50 <= a200 && b50 > b200) {
        setups.push({
          kind: 'golden-cross',
          side: 'bullish',
          index: i,
          thesis: 'Golden cross — the 50-day average just climbed above the 200-day; medium-term trend turning up.',
        });
        break;
      }
      if (a50 >= a200 && b50 < b200) {
        setups.push({
          kind: 'death-cross',
          side: 'bearish',
          index: i,
          thesis: 'Death cross — the 50-day average just fell below the 200-day; medium-term trend turning down.',
        });
        break;
      }
    }
  }

  // --- breakout / breakdown vs recent structure ---
  if (n >= 70) {
    const last = bars[n - 1];
    const band = bars.slice(n - 65, n - 5);
    const resistance = Math.max(...band.map((b) => b.h));
    const support = Math.min(...band.map((b) => b.l));
    if (last.c > resistance) {
      setups.push({
        kind: 'breakout',
        side: 'bullish',
        index: n - 1,
        thesis: `Breakout — closed above the ${resistance.toFixed(2)} ceiling that capped the last three months.`,
      });
    } else if (last.c < support) {
      setups.push({
        kind: 'breakdown',
        side: 'bearish',
        index: n - 1,
        thesis: `Breakdown — closed below the ${support.toFixed(2)} floor that held for the last three months.`,
      });
    }
  }

  // --- momentum deceleration / acceleration ---
  if (n >= 130) {
    const last = closes[n - 1];
    const w = closes[n - 6]; // ~5 sessions back
    const m6 = closes[n - 126]; // ~6 months back
    const ret5d = ((last - w) / w) * 100;
    const ret6m = ((last - m6) / m6) * 100;
    if (ret6m > 20 && ret5d <= 0) {
      setups.push({
        kind: 'cooling',
        side: 'bearish',
        index: n - 1,
        thesis: `Cooling off — up ${ret6m.toFixed(0)}% in six months but flat-to-down this week. Not yet reversing, but the easy stretch may be done.`,
      });
    } else if (ret6m < -10 && ret5d > 5) {
      setups.push({
        kind: 'turning',
        side: 'bullish',
        index: n - 1,
        thesis: `Possible turn — down ${Math.abs(ret6m).toFixed(0)}% over six months but up ${ret5d.toFixed(1)}% this week. One green week isn't a trend; watch it.`,
      });
    }
  }

  return setups;
}

/** Overall technical bias from how the detected setups skew (§6.7). */
export function technicalBias(setups: DetectedSetup[]): 'bullish' | 'bearish' | 'neutral' {
  const score = setups.reduce((a, s) => a + (s.side === 'bullish' ? 1 : -1), 0);
  return score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
}

/** Fold the technical bias into the running score/gauge (±1). */
export function applyTechnicalBias(state: ScoreState, setups: DetectedSetup[]): void {
  const bias = technicalBias(setups);
  if (bias === 'neutral') return;
  const names = setups.map((s) => s.kind.replace('-', ' ')).join(', ');
  if (bias === 'bullish') sig(state, +1, `The chart's detected setups skew bullish (${names}).`);
  else sig(state, -1, `The chart's detected setups skew bearish (${names}).`);
}
