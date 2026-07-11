/**
 * Live price ticker (spec §6.1), present on every page via the shell.
 *
 * A rotating set of ~10 symbols with live price and % change, refreshed
 * about every 30 seconds. The state pill always tells the user what
 * they're looking at:
 *   live        — quotes fetched within this refresh cycle
 *   last known  — the source is unreachable; showing the most recent data
 *   demo        — fixture prices (no API key, or fully offline)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTickerQuotes,
  OFFLINE_DEMO_QUOTES,
  type TickerQuote,
} from '../lib/api';

/** Pool of large, liquid US names the strip rotates through. */
const POOL = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'V', 'UNH',
  'XOM', 'WMT', 'PG', 'JNJ', 'HD', 'MA', 'COST', 'NFLX', 'AMD', 'DIS',
];
const SHOWN = 10;
const REFRESH_MS = 30_000;

/** Pick this session's 10 symbols — a different slice of the pool each visit. */
function pickSymbols(): string[] {
  const shuffled = [...POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, SHOWN).sort();
}

type StripState = 'live' | 'last-known' | 'demo' | 'loading';

const STATE_LABEL: Record<StripState, string> = {
  live: 'live',
  'last-known': 'last known',
  demo: 'demo',
  loading: '…',
};

const STATE_TITLE: Record<StripState, string> = {
  live: 'Live market prices.',
  'last-known':
    'The data source is unreachable — showing the most recent prices received.',
  demo: 'Demo prices, not live. Add your API key in server/.env for live data.',
  loading: 'Fetching prices…',
};

export function Ticker() {
  const symbols = useMemo(pickSymbols, []);
  const [quotes, setQuotes] = useState<Record<string, TickerQuote> | null>(null);
  const [stripState, setStripState] = useState<StripState>('loading');
  const lastGood = useRef<Record<string, TickerQuote> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const result = await fetchTickerQuotes(symbols);
        if (cancelled) return;
        const values = Object.values(result);
        const usable = values.filter((q) => q.price != null);
        if (usable.length === 0) throw new Error('no quotes returned');

        lastGood.current = result;
        setQuotes(result);
        if (usable.some((q) => q.source === 'demo')) setStripState('demo');
        else if (usable.some((q) => q.source === 'last-known')) setStripState('last-known');
        else setStripState('live');
      } catch {
        if (cancelled) return;
        if (lastGood.current) {
          // Keep showing what we had, honestly labeled.
          setQuotes(lastGood.current);
          setStripState('last-known');
        } else {
          setQuotes(OFFLINE_DEMO_QUOTES);
          setStripState('demo');
        }
      }
    }

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbols]);

  const shown = symbols
    .map((sym) => ({ sym, q: quotes?.[sym] }))
    .filter((x): x is { sym: string; q: TickerQuote } => x.q?.price != null);

  return (
    <div className="ticker" role="status" aria-label="Market ticker">
      <span
        className="ticker-state"
        data-state={stripState}
        title={STATE_TITLE[stripState]}
      >
        {STATE_LABEL[stripState]}
      </span>
      {shown.length === 0 ? (
        <span className="ticker-note">fetching prices…</span>
      ) : (
        shown.map(({ sym, q }) => {
          const up = (q.changePct ?? 0) >= 0;
          return (
            <span className="ticker-item" key={sym}>
              <span className="ticker-sym">{sym}</span>
              <span className="ticker-price">
                {q.price!.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {q.changePct != null && (
                <span className={up ? 'gain' : 'loss'}>
                  {up ? '+' : ''}
                  {q.changePct.toFixed(2)}%
                </span>
              )}
            </span>
          );
        })
      )}
    </div>
  );
}
