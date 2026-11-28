/**
 * Closing open trades in one step (making logging effortless).
 *
 * A setup logged from the Position Sizer or Contract Ticket is "open"
 * until its exit price is recorded — and an open trade never reaches
 * Analytics. These helpers let any page close one with a single action
 * (stopped out / hit target / exit at a price), so honest records are
 * the easy path rather than a chore.
 */
import type { Trade, YesNo } from './db';
import { tradeR } from './trades';

/** Logged, not closed: no exit price yet, and no R entered directly. */
export function isOpen(t: Trade): boolean {
  return t.soldAt == null && t.rDirect == null;
}

/**
 * Can this open trade be closed from an exit price? Needs the entry and
 * stop (to size it) and the account settings frozen on the row.
 */
export function isClosable(t: Trade): boolean {
  return (
    isOpen(t) &&
    t.buyPrice != null &&
    t.stopPrice != null &&
    t.buyPrice !== t.stopPrice &&
    t.accountSizeAtLog != null &&
    t.riskPctAtLog != null
  );
}

/** Open trades worth closing, oldest first. */
export function openTrades(trades: Trade[]): Trade[] {
  return trades
    .filter(isClosable)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

/** The R a trade would record if closed at `exit` (null if it can't be computed). */
export function previewR(t: Trade, exit: number): number | null {
  if (!isFinite(exit)) return null;
  return tradeR({ ...t, soldAt: exit });
}

/**
 * The fields to save when closing a trade. Stamps closedAt (the cooling-
 * off timer runs from it) and records the plan self-check if given.
 */
export function closeUpdate(
  t: Trade,
  exit: number,
  now: number,
  followedPlan: YesNo = '',
): Pick<Trade, 'soldAt' | 'closedAt' | 'followedPlan'> {
  return {
    soldAt: exit,
    closedAt: now,
    followedPlan: followedPlan || t.followedPlan,
  };
}

/** One-click exits available for this trade. */
export function quickExits(t: Trade): Array<{ label: string; exit: number }> {
  const out: Array<{ label: string; exit: number }> = [];
  if (t.stopPrice != null) out.push({ label: 'Stopped out', exit: t.stopPrice });
  if (t.targetPrice != null && t.targetPrice !== t.buyPrice) out.push({ label: 'Hit target', exit: t.targetPrice });
  return out;
}
