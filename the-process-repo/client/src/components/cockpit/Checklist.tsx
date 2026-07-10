/**
 * Pre-Trade Checklist (spec §6.2.2) — seven rules ticked before every
 * individual trade. Never blocks a trade technically; below 7/7 the UI
 * makes waiting the obviously-correct move. Feeds the "matched my rules"
 * flag used when a trade is pushed to the Trade Log.
 */
import { createPortal } from 'react-dom';
import { CoolingOffTimer } from './CoolingOffTimer';

export const RULES = [
  { id: 'R-01', text: "Stop-loss price is set — I can say exactly where I'm wrong." },
  { id: 'R-02', text: 'Position size calculated from risk %, not from gut feel or buying power.' },
  { id: 'R-03', text: 'Setup matches my written entry criteria — no exceptions today.' },
  { id: 'R-04', text: 'Reward-to-risk ratio checked and worth taking.' },
  { id: 'R-05', text: 'Daily and weekly loss limit not yet hit.' },
  { id: 'R-06', text: 'Not entering within 30 minutes of my last loss.' },
  { id: 'R-07', text: 'IV rank / earnings date checked, if this is an options trade.' },
] as const;

export function Checklist({
  checks,
  onChange,
}: {
  checks: boolean[];
  onChange: (next: boolean[]) => void;
}) {
  const cleared = checks.filter(Boolean).length;
  const complete = cleared === 7;

  const toggle = (idx: number) => {
    const next = [...checks];
    next[idx] = !next[idx];
    onChange(next);
  };

  return (
    <section className="card checklist" aria-labelledby="checklist-title">
      <div className="checklist-head">
        <div>
          <h2 id="checklist-title">Pre-trade checklist</h2>
          <p className="card-sub">
            Ticked before every single trade — not once a day. If even one can't honestly be
            checked, the trade waits. That's the whole point.
          </p>
        </div>
        <div
          className={`checklist-counter num ${complete ? 'is-complete' : ''}`}
          role="status"
          aria-live="polite"
        >
          {cleared} / 7 cleared
        </div>
      </div>

      <div
        className="checklist-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={7}
        aria-valuenow={cleared}
        aria-label="Rules cleared"
      >
        <div
          className={`checklist-bar-fill ${complete ? 'is-complete' : ''}`}
          style={{ width: `${(cleared / 7) * 100}%` }}
        />
      </div>

      <ul className="checklist-rules">
        {RULES.map((rule, idx) => (
          <li key={rule.id}>
            <label className={`rule ${checks[idx] ? 'is-checked' : ''}`}>
              <input
                type="checkbox"
                checked={checks[idx]}
                onChange={() => toggle(idx)}
                aria-label={`${rule.id}: ${rule.text}`}
              />
              <span className="rule-id num">{rule.id}</span>
              <span className="rule-text">{rule.text}</span>
            </label>
            {rule.id === 'R-06' && <CoolingOffTimer />}
          </li>
        ))}
      </ul>

      <p className={`checklist-verdict ${complete ? 'is-complete' : ''}`} aria-live="polite">
        {complete
          ? 'All seven cleared. If the setup is still there, you may look for the trade.'
          : `${7 - cleared} rule${7 - cleared === 1 ? '' : 's'} unchecked — the correct move right now is to wait, not to trade.`}
      </p>

      <div className="checklist-actions">
        <button className="btn" onClick={() => onChange(RULES.map(() => false))}>
          Reset for next trade
        </button>
        <button className="btn" onClick={() => window.print()}>
          Print blank checklist
        </button>
      </div>

      <PrintSheet />
    </section>
  );
}

/**
 * The clean black-on-white sheet produced by "Print blank checklist".
 * Rendered into <body> via a portal so print CSS can hide the app and
 * show only this.
 */
function PrintSheet() {
  return createPortal(
    <div className="print-sheet" aria-hidden="true">
      <h1>Pre-trade checklist — The Process</h1>
      <p className="print-date">Date: ______________ &nbsp;&nbsp; Symbol: ______________</p>
      <ol>
        {RULES.map((rule) => (
          <li key={rule.id}>
            <span className="print-box" /> <strong>{rule.id}</strong> — {rule.text}
          </li>
        ))}
      </ol>
      <p className="print-foot">
        All seven, honestly, before entry — or the trade waits.
      </p>
    </div>,
    document.body,
  );
}
