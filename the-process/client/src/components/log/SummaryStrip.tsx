/**
 * Trade Log summary strip (§6.4): all-time record, win rate, net R,
 * average win/loss, current streak, and the expectancy verdict once
 * ≥30 trades are logged.
 */
import { coreStats, streaks } from '../../lib/stats';
import { fmtR, fmtPct } from '../../lib/format';

export function SummaryStrip({ rs }: { rs: number[] }) {
  const s = coreStats(rs);
  const st = streaks(rs);

  const streakLabel =
    st.current === 0 ? '—' : st.current > 0 ? `${st.current}W` : `${-st.current}L`;

  return (
    <section className="card summary-strip" aria-label="All-time record">
      <div className="sum-cell">
        <span className="sum-label">Record</span>
        <span className="sum-value num">
          {s.wins}–{s.losses}
          {s.breakeven > 0 && <span className="sum-minor"> ({s.breakeven} even)</span>}
        </span>
      </div>
      <div className="sum-cell">
        <span className="sum-label">Win rate</span>
        <span className="sum-value num">
          {s.winRate === undefined ? '—' : fmtPct(s.winRate * 100, 0)}
        </span>
      </div>
      <div className="sum-cell">
        <span className="sum-label">Net R</span>
        <span className={`sum-value num ${s.netR > 0 ? 'gain' : s.netR < 0 ? 'loss' : ''}`}>
          {fmtR(s.netR, 1)}
        </span>
      </div>
      <div className="sum-cell">
        <span className="sum-label">Avg win</span>
        <span className="sum-value num gain">
          {s.avgWin === undefined ? '—' : fmtR(s.avgWin)}
        </span>
      </div>
      <div className="sum-cell">
        <span className="sum-label">Avg loss</span>
        <span className="sum-value num loss">
          {s.avgLoss === undefined ? '—' : fmtR(-s.avgLoss)}
        </span>
      </div>
      <div className="sum-cell">
        <span className="sum-label">Streak</span>
        <span
          className={`sum-value num ${st.current > 0 ? 'gain' : st.current < 0 ? 'loss' : ''}`}
        >
          {streakLabel}
        </span>
      </div>
      <div className="sum-cell sum-verdict">
        <span className="sum-label">Expectancy</span>
        {s.total >= 30 && s.expectancy !== undefined ? (
          <span className={`sum-value num ${s.expectancy >= 0 ? 'gain' : 'loss'}`}>
            {fmtR(s.expectancy)}/trade
            <span className="sum-minor">
              {' '}
              — {s.expectancy >= 0 ? 'the method makes money on average' : 'negative: trade smaller while you find the leak'}
            </span>
          </span>
        ) : (
          <span className="sum-value sum-minor">
            {s.total === 0
              ? 'no trades yet'
              : `${30 - s.total} more trade${30 - s.total === 1 ? '' : 's'} before a verdict means anything`}
          </span>
        )}
      </div>
    </section>
  );
}
