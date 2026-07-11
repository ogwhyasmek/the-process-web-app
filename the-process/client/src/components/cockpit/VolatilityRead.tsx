/**
 * Volatility Read (spec §6.2.6) — IV rank, verdict, and the ±1σ expected
 * move. Spot and days-to-expiry come from the Greeks Lab. An optional
 * symbol checks the earnings calendar for an IV-crush setup within the
 * expiry window (+3 weeks).
 */
import { useEffect, useState } from 'react';
import { ivRank, ivRankVerdict, expectedMove } from '../../lib/calc';
import { apiGet, type Envelope } from '../../lib/api';
import { fmtMoney, fmtNum } from '../../lib/format';

interface EarningsPayload {
  earningsCalendar?: Array<{ date: string; symbol: string }>;
}

export function VolatilityRead({ spot, dte }: { spot: number; dte: number }) {
  const [ivNow, setIvNow] = useState('');
  const [ivLow, setIvLow] = useState('');
  const [ivHigh, setIvHigh] = useState('');
  const [symbol, setSymbol] = useState('');
  const [earningsDate, setEarningsDate] = useState<string | null>(null);

  const rank = ivRank(Number(ivNow), Number(ivLow), Number(ivHigh));
  const move = expectedMove(spot, Number(ivNow), dte);

  // Earnings/IV-crush check (§6.2.6): expiry window within 3 weeks of a
  // known earnings date for the symbol.
  useEffect(() => {
    setEarningsDate(null);
    const sym = symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await apiGet<Envelope<EarningsPayload>>(`/earnings/${sym}`);
        if (cancelled) return;
        const next = res.data.earningsCalendar?.[0]?.date ?? null;
        setEarningsDate(next);
      } catch {
        /* no earnings info — the read still works */
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [symbol]);

  const crushWarning = (() => {
    if (!earningsDate || !isFinite(dte) || dte <= 0) return null;
    const expiry = Date.now() + dte * 86400e3;
    const earnings = new Date(`${earningsDate}T12:00:00`).getTime();
    const threeWeeks = 21 * 86400e3;
    if (Math.abs(earnings - expiry) <= threeWeeks || (earnings > Date.now() && earnings < expiry)) {
      return earningsDate;
    }
    return null;
  })();

  return (
    <section className="card tool" aria-labelledby="vol-title">
      <h2 id="vol-title">Volatility Read</h2>
      <p className="card-sub">
        Is the option market pricing this stock's swings as cheap or expensive right now?
      </p>

      <div className="tool-grid">
        <div className="field">
          <label htmlFor="vr-now">Current IV (%)</label>
          <input id="vr-now" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={ivNow} onChange={(e) => setIvNow(e.target.value)} placeholder="42" />
        </div>
        <div className="field">
          <label htmlFor="vr-low">52-week IV low (%)</label>
          <input id="vr-low" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={ivLow} onChange={(e) => setIvLow(e.target.value)} placeholder="15" />
        </div>
        <div className="field">
          <label htmlFor="vr-high">52-week IV high (%)</label>
          <input id="vr-high" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={ivHigh} onChange={(e) => setIvHigh(e.target.value)} placeholder="60" />
        </div>
        <div className="field">
          <label htmlFor="vr-sym">Symbol (for the earnings check)</label>
          <input id="vr-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)}
            placeholder="optional" maxLength={10} style={{ textTransform: 'uppercase' }} />
        </div>
      </div>

      {rank == null ? (
        <p className="tool-warning" role="status">
          Enter current IV plus its 52-week low and high (low must sit below high).
        </p>
      ) : (
        <>
          <div className="ivrank" aria-live="polite">
            <div className="ivrank-scale" role="img" aria-label={`IV rank ${rank.toFixed(0)} out of 100`}>
              <div className="ivrank-fill" style={{ width: `${rank}%` }} />
              <div className="ivrank-marker" style={{ left: `${rank}%` }} />
            </div>
            <div className="ivrank-legend">
              <span>0 · cheap</span>
              <span className="num ivrank-value">IV rank {rank.toFixed(0)}</span>
              <span>100 · rich</span>
            </div>
          </div>
          <p className="tool-verdict">{ivRankVerdict(rank)}</p>
        </>
      )}

      {move != null && (
        <p className="tool-note num-inline" aria-live="polite">
          Expected move (±1σ) over the next {dte} days:{' '}
          <strong className="num">±{fmtMoney(move)}</strong> — about a{' '}
          <span className="num">
            {fmtMoney(spot - move)} – {fmtMoney(spot + move)}
          </span>{' '}
          range, where roughly 68% of outcomes land. Spot {fmtNum(spot)} and days from the Greeks
          Lab above.
        </p>
      )}

      {crushWarning && (
        <p className="tool-warning" role="alert">
          Earnings {crushWarning} lands near this expiry window. IV is usually pumped before the
          report and collapses right after (IV crush) — a correct directional call can still lose
          money. Rule R-07 exists for exactly this.
        </p>
      )}
    </section>
  );
}
