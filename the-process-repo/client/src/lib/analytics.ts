/**
 * Analytics derivations (spec §6.5) — everything the dashboard shows,
 * computed as pure functions over the Trade Log so the minimum-sample
 * gates can be tested exactly. Nothing here touches the DOM or the DB.
 */
import type { Trade } from './db';
import { tradeR } from './trades';
import { streaks, type CoreStats } from './stats';

/** A decided trade result with the context the charts need. */
export interface ResultPoint {
  r: number;
  date: string; // YYYY-MM-DD
  symbol: string;
  setupTag: string;
  followedPlan: 'Y' | 'N' | '';
}

/**
 * Chronological (oldest → newest) results for every trade with a known R.
 * The single input every §6.5 computation reads from.
 */
export function resultPoints(trades: Trade[]): ResultPoint[] {
  return [...trades]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) => ({ t, r: tradeR(t) }))
    .filter((x): x is { t: Trade; r: number } => x.r != null)
    .map(({ t, r }) => ({
      r,
      date: t.date,
      symbol: t.symbol,
      setupTag: t.setupTag,
      followedPlan: t.followedPlan,
    }));
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** §6.5 histogram buckets: ≤−2, −2…−1, −1…0, 0…1, 1…2, 2…3, 3+ */
export const R_BUCKETS = ['≤−2', '−2…−1', '−1…0', '0…1', '1…2', '2…3', '3+'] as const;

export function rHistogram(rs: number[]): { bucket: string; count: number }[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rs) {
    if (r <= -2) counts[0]++;
    else if (r <= -1) counts[1]++;
    else if (r < 0) counts[2]++;
    else if (r < 1) counts[3]++;
    else if (r < 2) counts[4]++;
    else if (r < 3) counts[5]++;
    else counts[6]++;
  }
  return R_BUCKETS.map((bucket, i) => ({ bucket, count: counts[i] }));
}

/**
 * Rolling win rate (§6.5): trailing window of 20 once history allows,
 * otherwise max(5, floor(total/2)) — usable from roughly the 8th trade.
 */
export function rollingWinRate(rs: number[]): { trade: number; winRate: number }[] {
  const total = rs.length;
  if (total < 8) return [];
  const window = Math.min(20, Math.max(5, Math.floor(total / 2)));
  const points: { trade: number; winRate: number }[] = [];
  for (let i = window; i <= total; i++) {
    const slice = rs.slice(i - window, i);
    const wins = slice.filter((r) => r > 0).length;
    const decided = slice.filter((r) => r !== 0).length;
    if (decided > 0) points.push({ trade: i, winRate: (wins / decided) * 100 });
  }
  return points;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

/** Net R summed per weekday, Monday–Friday (§6.5). */
export function netRByWeekday(points: ResultPoint[]): { day: string; netR: number; count: number }[] {
  const sums = new Map(WEEKDAYS.map((d) => [d, { netR: 0, count: 0 }]));
  for (const p of points) {
    const dow = new Date(`${p.date}T12:00:00`).getDay(); // 0=Sun … 6=Sat
    if (dow >= 1 && dow <= 5) {
      const entry = sums.get(WEEKDAYS[dow - 1])!;
      entry.netR += p.r;
      entry.count += 1;
    }
  }
  return WEEKDAYS.map((day) => ({ day, ...sums.get(day)! }));
}

/** Net R per calendar month, most recent 6 months including the current one (§6.5). */
export function netRByMonth(
  points: ResultPoint[],
  now = new Date(),
): { month: string; netR: number }[] {
  const months: string[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  const sums = new Map(months.map((m) => [m, 0]));
  for (const p of points) {
    const key = p.date.slice(0, 7);
    if (sums.has(key)) sums.set(key, sums.get(key)! + p.r);
  }
  return months.map((month) => ({ month, netR: sums.get(month)! }));
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export interface PlanAdherence {
  /** null until the §6.5 minimum sample is met (≥3 per side, ≥5 tagged). */
  meaningful: boolean;
  tagged: number;
  followed: number;
  broke: number;
  adherencePct: number | null;
  avgRFollowed: number | null;
  avgRBroke: number | null;
}

export function planAdherence(points: ResultPoint[]): PlanAdherence {
  const followed = points.filter((p) => p.followedPlan === 'Y');
  const broke = points.filter((p) => p.followedPlan === 'N');
  const tagged = followed.length + broke.length;
  const avg = (xs: ResultPoint[]) =>
    xs.length === 0 ? null : xs.reduce((a, p) => a + p.r, 0) / xs.length;
  return {
    meaningful: tagged >= 5 && followed.length >= 3 && broke.length >= 3,
    tagged,
    followed: followed.length,
    broke: broke.length,
    adherencePct: tagged === 0 ? null : (followed.length / tagged) * 100,
    avgRFollowed: avg(followed),
    avgRBroke: avg(broke),
  };
}

export interface GroupRow {
  key: string;
  count: number;
  winRate: number | null;
  netR: number;
}

/** Per-symbol (or per-setup-tag) performance, sorted by net R (§6.5). */
export function groupPerformance(
  points: ResultPoint[],
  by: 'symbol' | 'setupTag',
): GroupRow[] {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const key = p[by].trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.r);
  }
  return [...groups.entries()]
    .map(([key, rs]) => {
      const wins = rs.filter((r) => r > 0).length;
      const decided = rs.filter((r) => r !== 0).length;
      return {
        key,
        count: rs.length,
        winRate: decided === 0 ? null : (wins / decided) * 100,
        netR: rs.reduce((a, b) => a + b, 0),
      };
    })
    .sort((a, b) => b.netR - a.netR);
}

// ---------------------------------------------------------------------------
// Auto-written insights (§6.5) — every gate exactly as specified.
// ---------------------------------------------------------------------------

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  text: string;
}

export interface InsightInput {
  points: ResultPoint[];
  stats: CoreStats;
  maxTradesPerDay: number;
  riskPct: number;
}

export function generateInsights(input: InsightInput): Insight[] {
  const { points, stats, maxTradesPerDay, riskPct } = input;
  const rs = points.map((p) => p.r);
  const out: Insight[] = [];
  const total = stats.total;
  if (total === 0) return out;

  // Below ~30 trades: the sample itself is the headline (no other gate).
  if (total < 30) {
    out.push({
      tone: 'info',
      text: `${total} trade${total === 1 ? '' : 's'} logged so far — too small a sample for real conclusions. The patterns below are weather, not climate, until you pass 30.`,
    });
  }

  // ≥10 total: expectancy messaging.
  if (total >= 10 && stats.expectancy !== undefined) {
    out.push(
      stats.expectancy >= 0
        ? {
            tone: 'good',
            text: `Expectancy is +${stats.expectancy.toFixed(2)}R per trade — on average, the method makes money each time you follow it.`,
          }
        : {
            tone: 'warn',
            text: `Expectancy is ${stats.expectancy.toFixed(2)}R per trade — negative. Trade smaller while you find the leak; size can't fix a method that loses on average.`,
          },
    );
  }

  // ≥5 losing trades: stops slipping.
  if (stats.losses >= 5 && stats.avgLoss !== undefined && stats.avgLoss > 1.2) {
    out.push({
      tone: 'warn',
      text: `Your average loss is ${stats.avgLoss.toFixed(2)}R against a 1R plan — stops are being widened or slipped. The plan only works if −1R means −1R.`,
    });
  }

  // No gate: a single worst trade beyond roughly −2R.
  const worst = Math.min(...rs);
  if (worst < -2) {
    out.push({
      tone: 'warn',
      text: `Your worst trade cost ${worst.toFixed(1)}R — one trade doing double-plus its planned damage. Whatever let that happen deserves a written rule of its own.`,
    });
  }

  // ≥15 total, PF finite: profit-factor read.
  if (total >= 15 && stats.profitFactor !== undefined && isFinite(stats.profitFactor)) {
    if (stats.profitFactor >= 1.5) {
      out.push({
        tone: 'good',
        text: `Profit factor ${stats.profitFactor.toFixed(2)} — you make $${stats.profitFactor.toFixed(2)} for every $1 you lose. Above 1.5 is a healthy engine.`,
      });
    } else if (stats.profitFactor < 1) {
      out.push({
        tone: 'warn',
        text: `Profit factor ${stats.profitFactor.toFixed(2)} — below 1, gross losses outweigh gross wins. That's the definition of a leak.`,
      });
    }
  }

  // Weekday with ≥5 trades and materially negative net R.
  const DAY_NAMES: Record<string, string> = {
    Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays',
  };
  for (const { day, netR, count } of netRByWeekday(points)) {
    if (count >= 5 && netR < -1) {
      out.push({
        tone: 'warn',
        text: `${DAY_NAMES[day]} are costing you: ${netR.toFixed(1)}R across ${count} trades. With that sample it's starting to look like a real pattern, not noise.`,
      });
    }
  }

  // Trade-cap breaches, counted across days (no gate).
  if (maxTradesPerDay > 0) {
    const byDay = new Map<string, number>();
    for (const p of points) byDay.set(p.date, (byDay.get(p.date) ?? 0) + 1);
    const breaches = [...byDay.values()].filter((n) => n > maxTradesPerDay).length;
    if (breaches > 0) {
      out.push({
        tone: 'warn',
        text: `You broke your own ${maxTradesPerDay}-trades-per-day cap on ${breaches} day${breaches === 1 ? '' : 's'}. The cap only protects you on the days you want to ignore it.`,
      });
    }
  }

  // ≥20 total: recent form over the last 10.
  if (total >= 20) {
    const last10 = rs.slice(-10).reduce((a, b) => a + b, 0);
    if (last10 <= -3) {
      out.push({
        tone: 'warn',
        text: `Recent form is cold: ${last10.toFixed(1)}R over your last 10 trades. A smaller size and a stricter checklist beat a comeback swing.`,
      });
    } else if (last10 >= 5) {
      out.push({
        tone: 'good',
        text: `Recent form is hot: +${last10.toFixed(1)}R over your last 10 trades. Enjoy it — and keep the size rules exactly where they are.`,
      });
    }
  }

  // Longest losing streak ≥5: what it costs at current risk %.
  const st = streaks(rs);
  if (st.longestLoss >= 5 && riskPct > 0) {
    const frac = riskPct / 100;
    const cost = (1 - Math.pow(1 - frac, st.longestLoss)) * 100;
    out.push({
      tone: 'info',
      text: `Your longest losing streak is ${st.longestLoss}. At ${riskPct}% risk per trade that run costs about ${cost.toFixed(1)}% of the account — the Risk of Ruin simulator shows how fast that grows if risk % creeps up.`,
    });
  }

  // Plan-adherence insights (≥10 tagged, ≥3 each side for the gap).
  const plan = planAdherence(points);
  if (plan.tagged >= 10) {
    if (plan.followed >= 3 && plan.broke >= 3 && plan.avgRFollowed != null && plan.avgRBroke != null) {
      const gap = plan.avgRFollowed - plan.avgRBroke;
      out.push({
        tone: gap >= 0 ? 'good' : 'warn',
        text: `Following your plan is worth ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}R per trade versus breaking it (${plan.avgRFollowed.toFixed(2)}R vs ${plan.avgRBroke.toFixed(2)}R). That number is your discipline, priced.`,
      });
    }
    if (plan.adherencePct != null && plan.adherencePct < 75) {
      out.push({
        tone: 'warn',
        text: `Plan adherence is ${plan.adherencePct.toFixed(0)}% — you broke your own plan on more than a quarter of tagged trades. The edge you're looking for is probably right there.`,
      });
    }
  }

  // Symbol with ≥5 trades and net R ≤ −2: temporary ban candidate.
  for (const row of groupPerformance(points, 'symbol')) {
    if (row.count >= 5 && row.netR <= -2) {
      out.push({
        tone: 'warn',
        text: `${row.key} has cost you ${row.netR.toFixed(1)}R across ${row.count} trades — worth a temporary ban until you can say why you keep trading it.`,
      });
    }
  }

  return out;
}
