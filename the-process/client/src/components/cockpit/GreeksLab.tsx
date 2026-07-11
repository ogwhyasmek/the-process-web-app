/**
 * Greeks Lab (spec §6.2.5) — live Black-Scholes pricing with the four
 * Greeks and the payoff-at-expiration diagram. Inputs are controlled by
 * the Cockpit page so the Volatility Read can reuse spot and days-to-expiry.
 */
import { blackScholes, type OptionType } from '../../lib/calc';
import { PayoffDiagram } from './PayoffDiagram';
import { fmtMoney } from '../../lib/format';

export interface GreeksInputs {
  type: OptionType;
  spot: string;
  strike: string;
  dte: string;
  iv: string;
  rate: string;
}

export const DEFAULT_GREEKS: GreeksInputs = {
  type: 'call',
  spot: '100',
  strike: '100',
  dte: '30',
  iv: '30',
  rate: '4.5',
};

export function GreeksLab({
  value,
  onChange,
}: {
  value: GreeksInputs;
  onChange: (next: GreeksInputs) => void;
}) {
  const result = blackScholes({
    type: value.type,
    spot: Number(value.spot),
    strike: Number(value.strike),
    daysToExpiry: Number(value.dte),
    ivPct: Number(value.iv),
    ratePct: Number(value.rate),
  });
  const out = 'warning' in result ? null : result;

  const set = (patch: Partial<GreeksInputs>) => onChange({ ...value, ...patch });

  return (
    <section className="card tool" aria-labelledby="greeks-title">
      <h2 id="greeks-title">Greeks Lab</h2>
      <p className="card-sub">
        What the option should cost, and how it moves — before you pay the ask.
      </p>

      <div className="seg" role="radiogroup" aria-label="Option type">
        {(['call', 'put'] as const).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={value.type === t}
            className={`seg-btn ${value.type === t ? 'is-active' : ''}`}
            onClick={() => set({ type: t })}
          >
            {t === 'call' ? 'Call' : 'Put'}
          </button>
        ))}
      </div>

      <div className="tool-grid">
        <div className="field">
          <label htmlFor="gr-spot">Stock price now ($)</label>
          <input id="gr-spot" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={value.spot} onChange={(e) => set({ spot: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="gr-strike">Strike price ($)</label>
          <input id="gr-strike" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={value.strike} onChange={(e) => set({ strike: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="gr-dte">Days to expiry</label>
          <input id="gr-dte" className="num" type="number" min="1" step="1" inputMode="numeric"
            value={value.dte} onChange={(e) => set({ dte: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="gr-iv">Implied volatility (%)</label>
          <input id="gr-iv" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={value.iv} onChange={(e) => set({ iv: e.target.value })} />
          <span className="field-hint">From your broker's option chain — typed here, kept private.</span>
        </div>
        <div className="field">
          <label htmlFor="gr-rate">Risk-free rate (%)</label>
          <input id="gr-rate" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={value.rate} onChange={(e) => set({ rate: e.target.value })} />
        </div>
      </div>

      {!out ? (
        <p className="tool-warning" role="status">
          {'warning' in result ? result.warning : ''}
        </p>
      ) : (
        <>
          <dl className="tool-outputs num" aria-live="polite">
            <div className="out">
              <dt>Theoretical premium</dt>
              <dd className="out-big">{fmtMoney(out.premium)}</dd>
            </div>
            <div className="out">
              <dt>Breakeven at expiry</dt>
              <dd>{fmtMoney(out.breakeven)}</dd>
            </div>
            <div className="out">
              <dt>Moneyness</dt>
              <dd className="out-text">{out.moneyness}</dd>
            </div>
            <div className="out">
              <dt>Delta</dt>
              <dd>{out.delta.toFixed(3)}</dd>
            </div>
            <div className="out">
              <dt>Gamma</dt>
              <dd>{out.gamma.toFixed(4)}</dd>
            </div>
            <div className="out">
              <dt>Theta / day</dt>
              <dd>{out.theta.toFixed(3)}</dd>
            </div>
            <div className="out">
              <dt>Vega / 1pt IV</dt>
              <dd>{out.vega.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="field-hint">
            Quoted per share — multiply by 100 for per-contract dollars. Theta is what one calendar
            day costs you; Vega is what a one-point IV change does.
          </p>
          <PayoffDiagram
            type={value.type}
            spot={Number(value.spot)}
            strike={Number(value.strike)}
            premium={out.premium}
            breakeven={out.breakeven}
          />
        </>
      )}
    </section>
  );
}
