/**
 * Risk of Ruin simulator (spec §6.8.2) — fixed-fractional Monte Carlo.
 *
 * Simulates N = 2,000 independent "careers" of M = 200 trades each.
 * Seeded PRNG so the numbers are stable across re-renders — the point
 * is the shape of the risk ladder, not simulation noise.
 */

export const CAREERS = 2000;
export const TRADES_PER_CAREER = 200;

/** The §6.8.2 risk ladder: same edge, climbing position size. */
export const RISK_LADDER = [0.5, 1, 2, 3, 5, 10] as const;

/** mulberry32 — small, fast, good-enough seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RuinInputs {
  /** 0–100 (%). */
  winRatePct: number;
  avgWinR: number;
  avgLossR: number;
  /** 0–100 (%): fraction of equity risked per trade. */
  riskPct: number;
  /** 0–100 (%): drawdown that counts as ruin (default 50). */
  ruinDrawdownPct: number;
}

export interface RuinResult {
  /** 0–1: fraction of careers that hit the ruin line. */
  ruinProbability: number;
  /** Median ending equity multiple; 0 means the median career was ruined. */
  medianEndingMultiple: number;
}

/** Plain per-trade expectancy (§6.8.2): winRate×avgWin − (1−winRate)×avgLoss. */
export function ruinExpectancy(i: RuinInputs): number {
  const p = i.winRatePct / 100;
  return p * i.avgWinR - (1 - p) * i.avgLossR;
}

/**
 * Run the Monte Carlo. Careers multiply equity by (1 + f·avgWin) on wins
 * and max(0, 1 − f·avgLoss) on losses; a career is ruined the moment
 * equity falls to or below (1 − ruinDrawdown).
 */
export function simulateRuin(i: RuinInputs, seed = 1337): RuinResult {
  const p = Math.min(1, Math.max(0, i.winRatePct / 100));
  const f = Math.max(0, i.riskPct / 100);
  const ruinLine = 1 - Math.min(0.99, Math.max(0.01, i.ruinDrawdownPct / 100));
  const rand = mulberry32(seed);

  let ruined = 0;
  const endings = new Float64Array(CAREERS);

  for (let c = 0; c < CAREERS; c++) {
    let equity = 1;
    let dead = false;
    for (let t = 0; t < TRADES_PER_CAREER; t++) {
      if (rand() < p) equity *= 1 + f * i.avgWinR;
      else equity *= Math.max(0, 1 - f * i.avgLossR);
      if (!dead && equity <= ruinLine) {
        ruined += 1;
        dead = true;
        // A ruined career records 0 — "wiped" (§6.8.2).
        break;
      }
    }
    endings[c] = dead ? 0 : equity;
  }

  endings.sort();
  const mid = CAREERS / 2;
  const median = (endings[mid - 1] + endings[mid]) / 2;

  return { ruinProbability: ruined / CAREERS, medianEndingMultiple: median };
}

/** Re-run across the fixed risk ladder, holding the edge constant (§6.8.2). */
export function ruinLadder(
  base: Omit<RuinInputs, 'riskPct'>,
  seed = 1337,
): Array<{ riskPct: number; result: RuinResult }> {
  return RISK_LADDER.map((riskPct) => ({
    riskPct,
    result: simulateRuin({ ...base, riskPct }, seed),
  }));
}

/** Color banding for results (§6.8.2): <8% low, <30% medium, else high. */
export function ruinBand(prob: number): 'low' | 'medium' | 'high' {
  return prob < 0.08 ? 'low' : prob < 0.3 ? 'medium' : 'high';
}
