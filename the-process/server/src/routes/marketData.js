/**
 * Market-data routes.
 *
 * Every response is wrapped in a small envelope so the UI can always tell
 * the user what they're looking at (spec §6.1 — live vs. last-known/demo):
 *
 *   { source: 'live' | 'cache' | 'last-known', fetchedAt: <ms>, data: … }
 *
 * - 'live'       — fetched from the upstream source just now
 * - 'cache'      — served from an unexpired cache entry
 * - 'last-known' — upstream unreachable; serving the most recent stale copy
 *
 * If upstream fails and nothing is cached, routes return 502 and the
 * client falls back to its own labeled demo fixtures.
 */
import { Router } from 'express';
import { cache } from '../cache.js';
import { config } from '../config.js';
import {
  fetchQuote,
  fetchProfile,
  fetchMetrics,
  fetchRecommendations,
  fetchEarnings,
  fetchEarningsWindow,
} from '../providers/finnhub.js';
import { fetchDailyBars } from '../providers/yahooBars.js';
import { DEMO_QUOTES } from '../fixtures/demoQuotes.js';

export const marketData = Router();

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/; // spec §6.6 ticker validation

/**
 * Shared serve-through-cache flow.
 * @param {object} res express response
 * @param {string} key cache key
 * @param {number} ttl cache lifetime ms
 * @param {() => Promise<any>} fetcher upstream call
 * @param {boolean} [force] bypass fresh cache (used by "force re-scan")
 */
async function serveCached(res, key, ttl, fetcher, force = false) {
  if (!force) {
    const fresh = cache.getFresh(key);
    if (fresh !== undefined) {
      const { ageMs } = cache.getAny(key);
      return res.json({ source: 'cache', fetchedAt: Date.now() - ageMs, data: fresh });
    }
  }
  try {
    const data = await fetcher();
    cache.set(key, data, ttl);
    return res.json({ source: 'live', fetchedAt: Date.now(), data });
  } catch (err) {
    const stale = cache.getAny(key);
    if (stale) {
      return res.json({
        source: 'last-known',
        fetchedAt: Date.now() - stale.ageMs,
        data: stale.value,
      });
    }
    const status = err.status === 429 ? 429 : 502;
    return res.status(status).json({ error: err.message || 'upstream failure' });
  }
}

/** Validate and normalize the :symbol param on every route below. */
marketData.param('symbol', (req, res, next, raw) => {
  const symbol = String(raw).trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ error: `"${raw}" is not a valid US ticker symbol` });
  }
  req.symbol = symbol;
  next();
});

marketData.get('/quote/:symbol', (req, res) =>
  serveCached(res, `quote:${req.symbol}`, config.ttl.quote, () => fetchQuote(req.symbol)),
);

/**
 * Batch quotes for the ticker (§6.1): one browser request covers the whole
 * strip; upstream calls still go through the 1/sec throttle one by one.
 *
 * Response: { quotes: { SYM: { source, fetchedAt, price, changePct } } }
 * Per-symbol source: 'live' | 'cache' | 'last-known' | 'demo' | 'unavailable'.
 */
marketData.get('/quotes', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 15); // the ticker never needs more
  if (symbols.length === 0) {
    return res.status(400).json({ error: 'symbols query param is required' });
  }

  /** @type {Record<string, {source: string, fetchedAt: number, price: number|null, changePct: number|null}>} */
  const quotes = {};

  for (const symbol of symbols) {
    // No key configured → labeled demo data keeps the app navigable.
    if (!config.finnhubKey) {
      const demo = DEMO_QUOTES[symbol];
      quotes[symbol] = {
        source: 'demo',
        fetchedAt: Date.now(),
        price: demo?.price ?? null,
        changePct: demo?.changePct ?? null,
      };
      continue;
    }

    const key = `quote:${symbol}`;
    const fresh = cache.getFresh(key);
    if (fresh !== undefined) {
      const { ageMs } = cache.getAny(key);
      quotes[symbol] = {
        source: 'cache',
        fetchedAt: Date.now() - ageMs,
        price: fresh.c ?? null,
        changePct: fresh.dp ?? null,
      };
      continue;
    }

    try {
      // Background ticker refresh: yields to research requests (§6.6/§6.7)
      // the user is actually waiting on.
      const data = await fetchQuote(symbol, { priority: 'low' });
      cache.set(key, data, config.ttl.quote);
      quotes[symbol] = {
        source: 'live',
        fetchedAt: Date.now(),
        price: data.c ?? null,
        changePct: data.dp ?? null,
      };
    } catch {
      const stale = cache.getAny(key);
      quotes[symbol] = stale
        ? {
            source: 'last-known',
            fetchedAt: Date.now() - stale.ageMs,
            price: stale.value.c ?? null,
            changePct: stale.value.dp ?? null,
          }
        : { source: 'unavailable', fetchedAt: Date.now(), price: null, changePct: null };
    }
  }

  res.json({ quotes });
});

marketData.get('/profile/:symbol', (req, res) =>
  serveCached(res, `profile:${req.symbol}`, config.ttl.profile, () => fetchProfile(req.symbol)),
);

marketData.get('/fundamentals/:symbol', (req, res) =>
  serveCached(
    res,
    `fundamentals:${req.symbol}`,
    config.ttl.fundamentals,
    () => fetchMetrics(req.symbol),
    req.query.force === '1',
  ),
);

marketData.get('/recommendations/:symbol', (req, res) =>
  serveCached(res, `recs:${req.symbol}`, config.ttl.recommendations, () =>
    fetchRecommendations(req.symbol),
  ),
);

/** Confirmed earnings dates from today out ~45 days (covers the 21-day rule in §6.7). */
marketData.get('/earnings/:symbol', (req, res) => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + 45 * 86400e3));
  return serveCached(res, `earnings:${req.symbol}`, config.ttl.earnings, () =>
    fetchEarnings(req.symbol, from, to),
  );
});

/**
 * Earnings calendar for a set of symbols (Cockpit card, approved §7).
 * The full US window is fetched once and cached ~6h; filtering to the
 * requested symbols happens here, so 40 watchlist names cost 1 upstream
 * call instead of 40.
 */
marketData.get('/earnings-calendar', async (req, res) => {
  const wanted = new Set(
    String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => SYMBOL_RE.test(s)),
  );
  if (wanted.size === 0) {
    return res.status(400).json({ error: 'symbols query param is required' });
  }

  const iso = (d) => d.toISOString().slice(0, 10);
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + 21 * 86400e3));
  const key = `earnings-window:${from}`;

  let entry = cache.getAny(key);
  let source = entry && !entry.stale ? 'cache' : null;
  if (!source) {
    try {
      const data = await fetchEarningsWindow(from, to);
      cache.set(key, data, config.ttl.earnings);
      entry = cache.getAny(key);
      source = 'live';
    } catch (err) {
      if (!entry) {
        return res.status(err.status === 429 ? 429 : 502).json({ error: err.message });
      }
      source = 'last-known';
    }
  }

  const all = entry.value?.earningsCalendar || [];
  const events = all
    .filter((e) => wanted.has(e.symbol))
    .map((e) => ({ symbol: e.symbol, date: e.date, hour: e.hour || '' }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ source, fetchedAt: Date.now() - entry.ageMs, data: { events } });
});

/** ~15 months of daily OHLC bars for the Technical Read chart (§6.7). */
marketData.get('/bars/:symbol', (req, res) =>
  serveCached(res, `bars:${req.symbol}`, config.ttl.bars, () => fetchDailyBars(req.symbol)),
);
