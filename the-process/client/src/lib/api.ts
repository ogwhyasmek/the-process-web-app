/**
 * Client ↔ proxy API layer.
 *
 * Every proxy response carries a source tag so the UI can always tell the
 * user what they're looking at (spec §6.1):
 *   'live'        — fetched just now
 *   'cache'       — unexpired proxy cache
 *   'last-known'  — upstream unreachable, stale copy served
 *   'demo'        — fixture data (no API key, or the proxy itself is down)
 *   'unavailable' — nothing to show for this symbol
 */

import { API_BASE_URL } from './apiBase';

export type DataSource = 'live' | 'cache' | 'last-known' | 'demo' | 'unavailable';

export interface Envelope<T> {
  source: DataSource;
  fetchedAt: number;
  data: T;
}

export interface TickerQuote {
  source: DataSource;
  fetchedAt: number;
  price: number | null;
  changePct: number | null;
}

/** GET a proxy endpoint; throws on network failure or error status. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Plain-English reason live market data isn't coming through, for the
 * research pages' empty states. Asks the proxy's /health endpoint so the
 * message can tell "no API key" apart from "proxy not running".
 */
export async function explainDataOutage(): Promise<string> {
  try {
    const health = await apiGet<{ keyConfigured?: boolean }>('/health');
    if (health.keyConfigured === false) {
      return 'No market-data API key is set up yet, so research has nothing to read. Add a Finnhub key (see the README) and it will fill in.';
    }
    return "The market-data source isn't responding right now. Try again in a minute — everything else in the app works normally.";
  } catch {
    return "The data proxy can't be reached — research needs it running (./run.sh starts it). Everything else in the app works offline.";
  }
}

/** Batch quotes for the ticker. */
export async function fetchTickerQuotes(
  symbols: string[],
): Promise<Record<string, TickerQuote>> {
  const { quotes } = await apiGet<{ quotes: Record<string, TickerQuote> }>(
    `/quotes?symbols=${symbols.join(',')}`,
  );
  return quotes;
}

/**
 * Client-side demo quotes — the fallback of last resort, used only when the
 * proxy itself can't be reached (fully offline). Always labeled "demo".
 */
export const OFFLINE_DEMO_QUOTES: Record<string, TickerQuote> = Object.fromEntries(
  (
    [
      ['AAPL', 310.66, -0.64],
      ['MSFT', 402.5, 0.42],
      ['NVDA', 188.32, 1.31],
      ['AMZN', 244.1, 0.18],
      ['GOOGL', 201.77, -0.22],
      ['META', 742.05, 0.95],
      ['TSLA', 289.4, -1.84],
      ['JPM', 305.12, 0.37],
      ['V', 352.6, 0.11],
      ['UNH', 318.9, -0.53],
      ['XOM', 122.48, 0.66],
      ['WMT', 108.23, 0.29],
      ['PG', 161.75, -0.08],
      ['JNJ', 172.4, 0.21],
      ['HD', 398.55, -0.44],
      ['MA', 588.7, 0.5],
      ['COST', 942.1, 0.73],
      ['NFLX', 1287.35, 1.12],
      ['AMD', 164.22, -0.91],
      ['DIS', 118.64, 0.14],
    ] as const
  ).map(([sym, price, changePct]) => [
    sym,
    { source: 'demo' as const, fetchedAt: 0, price, changePct },
  ]),
);
