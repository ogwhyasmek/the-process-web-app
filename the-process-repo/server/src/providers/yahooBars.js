/**
 * Daily OHLC bars via Yahoo Finance's public chart endpoint.
 *
 * Why Yahoo: the spec (§6.7, §9) needs 1+ year of daily bars for the
 * Technical Read chart, and Finnhub's free tier returns 403 for candles
 * (verified 2026-07-08). Yahoo's chart API needs no key — just a browser
 * User-Agent. It is unofficial, so this adapter is deliberately the only
 * file that knows about it; if it ever breaks, swap this file out.
 *
 * Bars are cached for ~12h upstream of this module, so request volume
 * stays negligible.
 */

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

/**
 * Fetch ~15 months of daily bars (enough history that a 200-day moving
 * average exists across the whole displayed 6–12 month window).
 *
 * @param {string} symbol
 * @returns {Promise<{bars: Array<{t: number, o: number, h: number, l: number, c: number, v: number}>}>}
 *   t = trade-day timestamp (seconds). Days with null closes (halts) are dropped.
 */
export async function fetchDailyBars(symbol) {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=15mo&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Yahoo chart responded ${res.status} for ${symbol}`);
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) {
    throw new Error(`Yahoo chart returned no series for ${symbol}`);
  }

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue; // skip halted/partial days
    bars.push({
      t: ts[i],
      o: q.open?.[i] ?? c,
      h: q.high?.[i] ?? c,
      l: q.low?.[i] ?? c,
      c,
      v: q.volume?.[i] ?? 0,
    });
  }
  if (bars.length === 0) throw new Error(`Yahoo chart returned an empty series for ${symbol}`);
  return { bars };
}
