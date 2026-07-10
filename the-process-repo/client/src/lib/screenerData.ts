/**
 * Screener scan orchestration (spec §6.6): one fundamentals request per
 * symbol, cached ~24h on this device (the proxy caches server-side too),
 * throttled upstream by the proxy, with progress + graceful 429 handling.
 */
import { kvGet, kvSet } from './kv';
import { apiGet, type Envelope } from './api';
import { extractFundamentals, type Fundamentals } from './grading';

const CACHE_TTL = 24 * 60 * 60 * 1000;
const cacheKey = (symbol: string) => `screener.cache.${symbol}`;

export interface ScanEntry {
  symbol: string;
  fetchedAt: number;
  fundamentals: Fundamentals;
}

interface CachedShape {
  fetchedAt: number;
  fundamentals: Fundamentals;
}

export async function getCached(symbol: string): Promise<ScanEntry | null> {
  const hit = await kvGet<CachedShape>(cacheKey(symbol));
  if (!hit) return null;
  return { symbol, ...hit };
}

export interface ScanProgress {
  done: number;
  total: number;
  current: string;
  /** Set while waiting out a rate-limit pause. */
  pausedUntil: number | null;
}

/**
 * Scan a list of symbols. Serves 24h-fresh cache hits instantly; fetches
 * the rest one by one (the proxy enforces ~1/sec upstream). On a 429,
 * pauses ~30s and retries rather than failing the scan (§6.6).
 */
export async function scanSymbols(
  symbols: string[],
  onProgress: (p: ScanProgress, partial: ScanEntry[]) => void,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ScanEntry[]> {
  const results: ScanEntry[] = [];
  const toFetch: string[] = [];

  for (const symbol of symbols) {
    const cached = options.force ? null : await getCached(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) results.push(cached);
    else toFetch.push(symbol);
  }

  const total = symbols.length;
  onProgress({ done: results.length, total, current: '', pausedUntil: null }, results);

  for (const symbol of toFetch) {
    if (options.signal?.aborted) break;
    let attempts = 0;
    for (;;) {
      try {
        const path = options.force ? `/fundamentals/${symbol}?force=1` : `/fundamentals/${symbol}`;
        const res = await apiGet<Envelope<{ metric?: Record<string, unknown> }>>(path);
        const entry: ScanEntry = {
          symbol,
          fetchedAt: Date.now(),
          fundamentals: extractFundamentals(res.data.metric ?? {}),
        };
        await kvSet(cacheKey(symbol), {
          fetchedAt: entry.fetchedAt,
          fundamentals: entry.fundamentals,
        });
        results.push(entry);
        break;
      } catch (err) {
        const msg = (err as Error).message || '';
        attempts += 1;
        if (/429/.test(msg) && attempts <= 3) {
          // Rate limited: pause ~30s and retry this symbol (§6.6).
          const until = Date.now() + 30_000;
          onProgress({ done: results.length, total, current: symbol, pausedUntil: until }, results);
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
        // Anything else (offline, bad symbol): fall back to stale cache if
        // present, otherwise skip the symbol; the scan must not die (§6.6).
        const stale = await getCached(symbol);
        if (stale) results.push(stale);
        break;
      }
    }
    onProgress({ done: results.length, total, current: symbol, pausedUntil: null }, results);
  }

  return results;
}
