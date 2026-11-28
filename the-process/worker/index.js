/**
 * The Process — Cloudflare Worker.
 *
 * The hosted counterpart of server/ (the local Express proxy). Same job:
 *   1. no API key ever ships to the browser — FINNHUB_API_KEY lives in a
 *      Worker secret (`npx wrangler secret put FINNHUB_API_KEY`),
 *   2. caching and throttling live here, not in browser JS,
 *   3. responses use the same envelope: { source, fetchedAt, data }.
 *
 * Pure modules (cache, throttle, Yahoo bars, demo fixtures) are imported
 * straight from server/src so there is one source of truth. Only the
 * Express-specific plumbing (routing, config/dotenv) is re-implemented.
 *
 * Differences from the local server:
 * - Cache is per-isolate memory. Cloudflare may spin up multiple isolates
 *   or recycle them, so cache hits and "last-known" fallback are best-effort
 *   rather than guaranteed. Fine for a single-user app.
 * - Disk snapshots don't exist (Workers have no filesystem). The backup
 *   routes return 501 with a message pointing at the download-file backup.
 */
import { TtlCache } from '../server/src/cache.js';
import { ThrottleQueue } from '../server/src/throttle.js';
import { fetchDailyBars } from '../server/src/providers/yahooBars.js';
import { DEMO_QUOTES } from '../server/src/fixtures/demoQuotes.js';

// Mirrors server/src/config.js `ttl` (milliseconds).
const TTL = {
  quote: 25 * 1000,
  fundamentals: 24 * 60 * 60 * 1000,
  bars: 12 * 60 * 60 * 1000,
  earnings: 6 * 60 * 60 * 1000,
  recommendations: 24 * 60 * 60 * 1000,
  profile: 7 * 24 * 60 * 60 * 1000,
};

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/; // spec §6.6 ticker validation

// Module-level singletons persist across requests within one isolate.
const cache = new TtlCache();
const queue = new ThrottleQueue(1050); // Finnhub free tier: stay under 60/min

// ---------------------------------------------------------------------------
// Finnhub adapter (worker flavor of server/src/providers/finnhub.js —
// re-implemented because the server version reads its key from .env)
// ---------------------------------------------------------------------------

const FINNHUB = 'https://finnhub.io/api/v1';

class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function finnhub(env, path, params, options) {
  if (!env.FINNHUB_API_KEY) {
    throw new UpstreamError(503, 'FINNHUB_API_KEY secret is not set on this Worker');
  }
  const qs = new URLSearchParams({ ...params, token: env.FINNHUB_API_KEY });
  return queue.run(async () => {
    const res = await fetch(`${FINNHUB}/${path}?${qs}`);
    if (!res.ok) throw new UpstreamError(res.status, `Finnhub ${path} responded ${res.status}`);
    return res.json();
  }, options);
}

const fetchQuote = (env, s, options) => finnhub(env, 'quote', { symbol: s }, options);
const fetchProfile = (env, s) => finnhub(env, 'stock/profile2', { symbol: s });
const fetchMetrics = (env, s) => finnhub(env, 'stock/metric', { symbol: s, metric: 'all' });
const fetchRecommendations = (env, s) => finnhub(env, 'stock/recommendation', { symbol: s });
const fetchEarnings = (env, s, from, to) =>
  finnhub(env, 'calendar/earnings', { symbol: s, from, to });
const fetchEarningsWindow = (env, from, to) => finnhub(env, 'calendar/earnings', { from, to });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Serve-through-cache flow — same semantics as the Express serveCached. */
async function serveCached(key, ttl, fetcher, force = false) {
  if (!force) {
    const fresh = cache.getFresh(key);
    if (fresh !== undefined) {
      const { ageMs } = cache.getAny(key);
      return json({ source: 'cache', fetchedAt: Date.now() - ageMs, data: fresh });
    }
  }
  try {
    const data = await fetcher();
    cache.set(key, data, ttl);
    return json({ source: 'live', fetchedAt: Date.now(), data });
  } catch (err) {
    const stale = cache.getAny(key);
    if (stale) {
      return json({ source: 'last-known', fetchedAt: Date.now() - stale.ageMs, data: stale.value });
    }
    return json({ error: err.message || 'upstream failure' }, err.status === 429 ? 429 : 502);
  }
}

function parseSymbols(url) {
  return String(url.searchParams.get('symbols') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s));
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** Batch quotes for the ticker strip. Mirrors GET /api/quotes. */
async function handleQuotes(url, env) {
  const symbols = parseSymbols(url).slice(0, 15);
  if (symbols.length === 0) return json({ error: 'symbols query param is required' }, 400);

  const quotes = {};
  // All symbols are queued at once so the ticker's quotes run back to back
  // (~1/sec), instead of each waiting for the previous one and
  // interleaving with research requests (~2s per quote when busy).
  await Promise.all(
    symbols.map(async (symbol) => {
      if (!env.FINNHUB_API_KEY) {
        const demo = DEMO_QUOTES[symbol];
        quotes[symbol] = {
          source: 'demo',
          fetchedAt: Date.now(),
          price: demo?.price ?? null,
          changePct: demo?.changePct ?? null,
        };
        return;
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
        return;
      }

      try {
        // Refreshing a price we can already show yields to research requests;
        // a first load (nothing cached yet) isn't deprioritized.
        const priority = cache.getAny(key) ? 'low' : 'normal';
        const data = await fetchQuote(env, symbol, { priority });
        cache.set(key, data, TTL.quote);
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
      }),
  );

  return json({ quotes });
}

/** Earnings calendar for a watchlist. Mirrors GET /api/earnings-calendar. */
async function handleEarningsCalendar(url, env) {
  const wanted = new Set(parseSymbols(url));
  if (wanted.size === 0) return json({ error: 'symbols query param is required' }, 400);

  const from = isoDay(new Date());
  const to = isoDay(new Date(Date.now() + 21 * 86400e3));
  const key = `earnings-window:${from}`;

  let entry = cache.getAny(key);
  let source = entry && !entry.stale ? 'cache' : null;
  if (!source) {
    try {
      const data = await fetchEarningsWindow(env, from, to);
      cache.set(key, data, TTL.earnings);
      entry = cache.getAny(key);
      source = 'live';
    } catch (err) {
      if (!entry) return json({ error: err.message }, err.status === 429 ? 429 : 502);
      source = 'last-known';
    }
  }

  const all = entry.value?.earningsCalendar || [];
  const events = all
    .filter((e) => wanted.has(e.symbol))
    .map((e) => ({ symbol: e.symbol, date: e.date, hour: e.hour || '' }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return json({ source, fetchedAt: Date.now() - entry.ageMs, data: { events } });
}

/** Per-symbol routes: /api/<route>/<symbol>. */
function handleSymbolRoute(route, symbol, url, env) {
  switch (route) {
    case 'quote':
      return serveCached(`quote:${symbol}`, TTL.quote, () => fetchQuote(env, symbol));
    case 'profile':
      return serveCached(`profile:${symbol}`, TTL.profile, () => fetchProfile(env, symbol));
    case 'fundamentals':
      return serveCached(
        `fundamentals:${symbol}`,
        TTL.fundamentals,
        () => fetchMetrics(env, symbol),
        url.searchParams.get('force') === '1',
      );
    case 'recommendations':
      return serveCached(`recs:${symbol}`, TTL.recommendations, () =>
        fetchRecommendations(env, symbol),
      );
    case 'earnings': {
      const from = isoDay(new Date());
      const to = isoDay(new Date(Date.now() + 45 * 86400e3));
      return serveCached(`earnings:${symbol}`, TTL.earnings, () =>
        fetchEarnings(env, symbol, from, to),
      );
    }
    case 'bars':
      return serveCached(`bars:${symbol}`, TTL.bars, () => fetchDailyBars(symbol));
    default:
      return json({ error: 'no such endpoint' }, 404);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Everything that isn't /api is a static asset (or the SPA fallback).
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, keyConfigured: Boolean(env.FINNHUB_API_KEY), now: Date.now() });
      }

      if (url.pathname === '/api/quotes') return await handleQuotes(url, env);
      if (url.pathname === '/api/earnings-calendar') {
        return await handleEarningsCalendar(url, env);
      }

      // Disk snapshots need a filesystem; Workers don't have one. The app's
      // primary backup (download the JSON file from Settings) still works.
      if (url.pathname.startsWith('/api/backup/')) {
        return json(
          {
            error:
              'Disk snapshots are only available when running locally — ' +
              'use "Download backup file" instead.',
          },
          501,
        );
      }

      const m = url.pathname.match(/^\/api\/([a-z-]+)\/([^/]+)$/);
      if (m) {
        const symbol = decodeURIComponent(m[2]).trim().toUpperCase();
        if (!SYMBOL_RE.test(symbol)) {
          return json({ error: `"${m[2]}" is not a valid US ticker symbol` }, 400);
        }
        return await handleSymbolRoute(m[1], symbol, url, env);
      }

      return json({ error: 'no such endpoint' }, 404);
    } catch (err) {
      return json({ error: err.message || 'internal error' }, 500);
    }
  },
};
