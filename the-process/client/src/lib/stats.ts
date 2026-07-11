/**
 * Performance statistics over a sequence of R results — the §6.5 formulas,
 * exactly as specified. Used by the Trade Log's summary strip and the
 * Analytics Dashboard. All functions treat the input as ordered
 * oldest → newest.
 */

export interface CoreStats {
  total: number;
  wins: number;
  losses: number;
  /** Trades with R exactly 0 (breakeven) — counted in total, not decided. */
  breakeven: number;
  netR: number;
  grossWin: number;
  grossLoss: number;
  /** undefined when there are no decided trades (§6.5). */
  winRate: number | undefined;
  avgWin: number | undefined;
  avgLoss: number | undefined;
  /** net_R / count(all results). undefined when total = 0. */
  expectancy: number | undefined;
  /** gross_win / gross_loss; Infinity if gross_loss = 0 and gross_win > 0. */
  profitFactor: number | undefined;
}

export function coreStats(rs: number[]): CoreStats {
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const decided = wins.length + losses.length;
  const netR = rs.reduce((a, b) => a + b, 0);
  return {
    total: rs.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: rs.length - decided,
    netR,
    grossWin,
    grossLoss,
    winRate: decided === 0 ? undefined : wins.length / decided,
    avgWin: wins.length === 0 ? undefined : grossWin / wins.length,
    avgLoss: losses.length === 0 ? undefined : grossLoss / losses.length,
    expectancy: rs.length === 0 ? undefined : netR / rs.length,
    profitFactor:
      grossLoss === 0 ? (grossWin > 0 ? Infinity : undefined) : grossWin / grossLoss,
  };
}

/**
 * Equity curve & drawdown (§6.5): running cumulative sum of R starting
 * at 0, with the running-peak drawdown at each point.
 */
export interface EquityPoint {
  index: number;
  cumR: number;
  drawdown: number;
}

export function equityCurve(rs: number[]): { points: EquityPoint[]; maxDrawdown: number } {
  const points: EquityPoint[] = [];
  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  rs.forEach((r, i) => {
    cum += r;
    peak = Math.max(peak, cum);
    const drawdown = peak - cum;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    points.push({ index: i + 1, cumR: cum, drawdown });
  });
  return { points, maxDrawdown };
}

/**
 * Streaks (§6.5) — two distinct computations:
 * longest-ever runs scanning oldest → newest, and the current streak
 * scanning backward from the most recent result (an exact 0 breaks it).
 */
export interface Streaks {
  longestWin: number;
  longestLoss: number;
  /** Positive = current winning streak, negative = current losing streak. */
  current: number;
}

export function streaks(rs: number[]): Streaks {
  let longestWin = 0;
  let longestLoss = 0;
  let winRun = 0;
  let lossRun = 0;
  for (const r of rs) {
    if (r > 0) {
      winRun += 1;
      lossRun = 0;
    } else if (r < 0) {
      lossRun += 1;
      winRun = 0;
    } else {
      winRun = 0;
      lossRun = 0;
    }
    longestWin = Math.max(longestWin, winRun);
    longestLoss = Math.max(longestLoss, lossRun);
  }

  let current = 0;
  const last = rs[rs.length - 1];
  if (last !== undefined && last !== 0) {
    const dir = last > 0 ? 1 : -1;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if ((dir === 1 && r > 0) || (dir === -1 && r < 0)) current += dir;
      else break;
    }
  }
  return { longestWin, longestLoss, current };
}
