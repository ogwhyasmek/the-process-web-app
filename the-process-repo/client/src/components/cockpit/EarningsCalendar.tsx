/**
 * Earnings calendar (approved §7 enhancement, backing checklist rule R-07):
 * confirmed earnings dates in the next 3 weeks for watchlist symbols.
 * One proxy request covers the whole list.
 */
import { useEffect, useState } from 'react';
import { ensureWatchlist } from '../../lib/db';
import { apiGet } from '../../lib/api';

interface EarningsEvent {
  symbol: string;
  date: string;
  hour: string;
}

const HOUR_LABEL: Record<string, string> = {
  bmo: 'before open',
  amc: 'after close',
  dmh: 'during market',
};

export function EarningsCalendar() {
  const [events, setEvents] = useState<EarningsEvent[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const symbols = await ensureWatchlist();
        const res = await apiGet<{ data: { events: EarningsEvent[] } }>(
          `/earnings-calendar?symbols=${symbols.join(',')}`,
        );
        if (cancelled) return;
        setEvents(res.data.events);
        setState('ready');
      } catch {
        if (!cancelled) setState('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="card" aria-labelledby="earnings-title">
      <h2 id="earnings-title">Earnings ahead — watchlist</h2>
      <p className="card-sub">
        Confirmed report dates in the next 3 weeks. Rule R-07: know these before an options trade.
      </p>

      {state === 'loading' && <p className="field-hint">Checking the calendar…</p>}
      {state === 'offline' && (
        <p className="field-hint">
          Earnings dates unavailable right now (offline or no API key) — the rest of the page works
          normally.
        </p>
      )}
      {state === 'ready' && events && events.length === 0 && (
        <p className="field-hint">No confirmed earnings for watchlist names in the next 3 weeks.</p>
      )}
      {state === 'ready' && events && events.length > 0 && (
        <ul className="earnings-list">
          {events.map((e) => (
            <li key={`${e.symbol}-${e.date}`} className="earnings-item">
              <span className="earnings-sym">{e.symbol}</span>
              <span className="num">{e.date}</span>
              {e.hour && <span className="earnings-hour">{HOUR_LABEL[e.hour] ?? e.hour}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
