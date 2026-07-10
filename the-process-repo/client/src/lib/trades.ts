/**
 * Trade Log helpers shared by every tool that writes or reads trades
 * (Position Sizer, Contract Ticket, Daily Guardrail, the Log page,
 * Analytics). One source of truth for the confirmed §6.4 math.
 */
import { db, type Trade } from './db';

/** Max dollar risk frozen on the row (§6.4): account size × risk %. */
export function maxDollarRisk(t: Trade): number | null {
  if (t.accountSizeAtLog == null || t.riskPctAtLog == null) return null;
  if (t.accountSizeAtLog <= 0 || t.riskPctAtLog <= 0) return null;
  return t.accountSizeAtLog * (t.riskPctAtLog / 100);
}

/** Stop distance (§6.4): |buy − stop|. */
export function stopDistance(t: Trade): number | null {
  if (t.buyPrice == null || t.stopPrice == null) return null;
  return Math.abs(t.buyPrice - t.stopPrice);
}

/** Reward vs. risk (§6.4): |target − buy| / stop distance. */
export function rewardToRisk(t: Trade): number | null {
  const dist = stopDistance(t);
  if (dist == null || dist === 0 || t.targetPrice == null || t.buyPrice == null) return null;
  return Math.abs(t.targetPrice - t.buyPrice) / dist;
}

/**
 * Position size (§6.4): floor(max dollar risk / stop distance) — per-unit.
 * For options rows the multiplier makes each unit a contract:
 * floor(max risk / (stop distance × multiplier)).
 */
export function positionSize(t: Trade): number | null {
  const risk = maxDollarRisk(t);
  const dist = stopDistance(t);
  const mult = t.multiplier || 1;
  if (risk == null || dist == null || dist === 0) return null;
  return Math.floor(risk / (dist * mult));
}

/**
 * Money made or lost (§6.4, formula confirmed 2026-07-08):
 * Up: (sold − buy) × size; Down: (buy − sold) × size; × multiplier for
 * options rows. Null until the trade closes (soldAt set).
 */
export function moneyResult(t: Trade): number | null {
  const size = positionSize(t);
  if (size == null || t.soldAt == null || t.buyPrice == null) return null;
  const perUnit = t.direction === 'Down' ? t.buyPrice - t.soldAt : t.soldAt - t.buyPrice;
  return perUnit * size * (t.multiplier || 1);
}

/**
 * Score in R (§6.4): money ÷ max dollar risk. Guardrail rows carry their
 * R directly (rDirect) since they have no prices.
 */
export function tradeR(t: Trade): number | null {
  if (t.rDirect != null) return t.rDirect;
  const money = moneyResult(t);
  const risk = maxDollarRisk(t);
  if (money == null || risk == null || risk === 0) return null;
  return money / risk;
}

/** Insert a row; returns its id. Fields not supplied default to blank. */
export async function addTrade(partial: Omit<Trade, 'id' | 'createdAt'>): Promise<number> {
  return db.trades.add({ ...partial, createdAt: Date.now() });
}

/**
 * Most recent losing trade logged today, for the cooling-off timer
 * (checklist rule R-06 — approved §7 enhancement). Returns epoch ms or null.
 */
export async function lastLossToday(todayIsoDate: string): Promise<number | null> {
  const todays = await db.trades.where('date').equals(todayIsoDate).toArray();
  let last: number | null = null;
  for (const t of todays) {
    const r = tradeR(t);
    if (r != null && r < 0 && (last == null || t.createdAt > last)) last = t.createdAt;
  }
  return last;
}
