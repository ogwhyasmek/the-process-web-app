/**
 * Live Daily Guardrail state for any page (Guardrail, Cockpit, Trade Log):
 * today's trades, the limits in force, the stand-down status, and the
 * cooling-off clock — all from guardrail.ts, so every page agrees.
 *
 * Also records the stand-down latch the moment a limit is hit, so later
 * deleting or editing trades can't lift it before midnight.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from './db';
import { kvSet } from './kv';
import { lastLossToday } from './trades';
import { todayIso } from './format';
import {
  coolingOffUntil,
  dayStatus,
  effectiveLimits,
  latchToRecord,
  STAND_DOWN_KEY,
  type StandDownLatch,
} from './guardrail';

export function useGuardrail() {
  // Re-evaluated every few seconds: the date rolls over at midnight and
  // the cooling-off/undo windows count down.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const today = todayIso();

  const data = useLiveQuery(async () => {
    const [trades, stored, latchRow, lastLossAt] = await Promise.all([
      db.trades.where('date').equals(today).sortBy('createdAt'),
      // Read-only here (liveQuery can't write); getSettings() seeds elsewhere.
      db.settings.get('account'),
      db.kv.get(STAND_DOWN_KEY),
      lastLossToday(today),
    ]);
    return {
      trades,
      settings: stored ?? DEFAULT_SETTINGS,
      latch: (latchRow?.value as StandDownLatch | undefined) ?? null,
      lastLossAt,
    };
  }, [today]);

  const limits = data ? effectiveLimits(data.settings, today) : null;
  const status = data && limits ? dayStatus(data.trades, limits, data.latch, today) : null;

  // Hit a limit and not latched yet → latch the day.
  const lastTradeId = data?.trades.length ? data.trades[data.trades.length - 1].id : undefined;
  const toLatch = status ? latchToRecord(status, today, now, lastTradeId) : null;
  useEffect(() => {
    if (toLatch) kvSet(STAND_DOWN_KEY, toLatch).catch(() => undefined);
  }, [toLatch?.date, toLatch?.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loaded: !!data,
    today,
    now,
    trades: data?.trades ?? [],
    latch: data?.latch ?? null,
    settings: data?.settings ?? DEFAULT_SETTINGS,
    limits,
    status,
    coolingUntil: data ? coolingOffUntil(data.lastLossAt, now) : null,
  };
}
