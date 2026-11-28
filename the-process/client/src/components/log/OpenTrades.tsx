/**
 * Open trades, closable in one step — used on the Daily Guardrail (today's
 * open trades) and the Trade Log (all of them).
 *
 * Each row offers the likely exits as single buttons (stopped out / hit
 * target), an "exit at" price with a live R preview, and the "followed my
 * plan?" self-check right when the answer is freshest. Closing an existing
 * trade is never blocked — even while stood down — because recording what
 * happened is always the honest move.
 */
import { useState } from 'react';
import { db, type Trade, type YesNo } from '../../lib/db';
import { closeUpdate, previewR, quickExits } from '../../lib/closing';
import { fmtNum, fmtR } from '../../lib/format';
import './openTrades.css';

export function OpenTrades({
  trades,
  title,
  sub,
  today,
}: {
  trades: Trade[];
  title: string;
  sub?: string;
  /** Rows dated before this are labelled as left open from an earlier day. */
  today: string;
}) {
  if (trades.length === 0) return null;
  return (
    <section className="card open-trades" aria-labelledby="open-trades-title">
      <h2 id="open-trades-title">
        {title} <span className="open-count num">{trades.length}</span>
      </h2>
      {sub && <p className="card-sub">{sub}</p>}
      <ul className="open-list">
        {trades.map((t) => (
          <OpenTradeRow key={t.id} trade={t} stale={t.date < today} />
        ))}
      </ul>
    </section>
  );
}

function OpenTradeRow({ trade: t, stale }: { trade: Trade; stale: boolean }) {
  const [exit, setExit] = useState('');
  const [plan, setPlan] = useState<YesNo>(t.followedPlan);
  const [busy, setBusy] = useState(false);

  const typed = exit.trim() === '' ? null : Number(exit);
  const preview = typed == null ? null : previewR(t, typed);

  async function close(price: number) {
    if (t.id == null || busy) return;
    setBusy(true);
    await db.trades.update(t.id, closeUpdate(t, price, Date.now(), plan));
    // The row disappears from the list once closed (live query).
  }

  const label = `${t.symbol || 'Untitled'} ${t.tradeType}${t.multiplier > 1 ? ` ×${t.multiplier}` : ''}`;

  return (
    <li className="open-row">
      <div className="open-what">
        <strong className="open-sym">{t.symbol || '—'}</strong>
        <span className="open-meta num">
          {t.tradeType}
          {stale && <span className="open-stale"> · open since {t.date}</span>}
          {' · '}in {fmtNum(t.buyPrice)} · stop {fmtNum(t.stopPrice)}
          {t.targetPrice != null && ` · target ${fmtNum(t.targetPrice)}`}
        </span>
      </div>

      <div className="open-plan" role="group" aria-label={`Followed your plan on ${label}?`}>
        <span className="open-plan-label">Followed plan?</span>
        {(['Y', 'N'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`chip chip-sm ${plan === v ? 'is-active' : ''}`}
            aria-pressed={plan === v}
            onClick={() => setPlan(plan === v ? '' : v)}
          >
            {v === 'Y' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>

      <div className="open-actions">
        {quickExits(t).map((q) => {
          const r = previewR(t, q.exit);
          return (
            <button
              key={q.label}
              type="button"
              className={`btn btn-sm ${r != null && r < 0 ? 'is-loss' : 'is-gain'}`}
              onClick={() => close(q.exit)}
              disabled={busy}
              aria-label={`${q.label} at ${fmtNum(q.exit)} on ${label} (${fmtR(r)})`}
            >
              {q.label} <span className="num">{fmtR(r, 1)}</span>
            </button>
          );
        })}
        <form
          className="open-exit"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed != null && preview != null) close(typed);
          }}
        >
          <label className="sr-only" htmlFor={`exit-${t.id}`}>Exit price for {label}</label>
          <input
            id={`exit-${t.id}`}
            className="num"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            placeholder="Exit at…"
            value={exit}
            onChange={(e) => setExit(e.target.value)}
          />
          <button type="submit" className="btn btn-sm" disabled={busy || preview == null}>
            Close{preview != null && <span className="num"> {fmtR(preview, 2)}</span>}
          </button>
        </form>
      </div>
    </li>
  );
}
