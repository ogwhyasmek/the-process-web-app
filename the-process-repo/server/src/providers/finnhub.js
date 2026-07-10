/**
 * Finnhub adapter — quotes, company fundamentals, profiles,
 * analyst recommendations, and earnings dates.
 *
 * All calls are funneled through one ThrottleQueue (~1/sec) so the
 * free tier's 60 req/min limit can never be tripped, and the API key
 * only ever appears in this process.
 */
import { config } from '../config.js';
import { ThrottleQueue } from '../throttle.js';

const BASE = 'https://finnhub.io/api/v1';
const queue = new ThrottleQueue(config.finnhubMinIntervalMs);

/** Error carrying the upstream HTTP status so routes can react to 429s. */
export class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Perform one throttled, keyed GET against Finnhub.
 * @param {string} path e.g. 'quote'
 * @param {Record<string, string>} params query params (without the token)
 */
async function get(path, params) {
  if (!config.finnhubKey) {
    throw new UpstreamError(503, 'No FINNHUB_API_KEY configured in server/.env');
  }
  const qs = new URLSearchParams({ ...params, token: config.finnhubKey });
  return queue.run(async () => {
    const res = await fetch(`${BASE}/${path}?${qs}`);
    if (!res.ok) throw new UpstreamError(res.status, `Finnhub ${path} responded ${res.status}`);
    return res.json();
  });
}

/** Live quote: { c, d, dp, h, l, o, pc, t }. */
export function fetchQuote(symbol) {
  return get('quote', { symbol });
}

/** Company profile: name, exchange, finnhubIndustry, marketCapitalization ($M)… */
export function fetchProfile(symbol) {
  return get('stock/profile2', { symbol });
}

/** Full fundamentals blob: { metric: { peTTM, revenueGrowthTTMYoy, … } }. */
export function fetchMetrics(symbol) {
  return get('stock/metric', { symbol, metric: 'all' });
}

/** Analyst recommendations, newest first: [{ strongBuy, buy, hold, sell, strongSell, period }]. */
export function fetchRecommendations(symbol) {
  return get('stock/recommendation', { symbol });
}

/**
 * Confirmed earnings dates in a window.
 * @returns {{ earningsCalendar?: Array<{date: string, symbol: string}> }}
 */
export function fetchEarnings(symbol, fromIso, toIso) {
  return get('calendar/earnings', { symbol, from: fromIso, to: toIso });
}

/**
 * All US earnings in a window (no symbol filter) — fetched once and
 * cached, then filtered per-watchlist by the route. One upstream call
 * covers the whole earnings-calendar card.
 */
export function fetchEarningsWindow(fromIso, toIso) {
  return get('calendar/earnings', { from: fromIso, to: toIso });
}
