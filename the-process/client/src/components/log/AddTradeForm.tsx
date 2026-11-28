/**
 * Manual trade entry (§6.4 — "entered directly on this page, for trades
 * placed outside those flows"). Freezes the current account settings on
 * the row; options types get the ×100 multiplier automatically.
 */
import { useState } from 'react';
import { addTrade } from '../../lib/trades';
import { todayIso } from '../../lib/format';
import { ruleBreaksForNewTrade } from '../../lib/guardrail';
import { useGuardrail } from '../../lib/useGuardrail';
import type { AccountSettings, YesNo } from '../../lib/db';

const BLANK = {
  date: todayIso(),
  symbol: '',
  tradeType: 'Stock',
  direction: '' as 'Up' | 'Down' | '',
  setupTag: '',
  buyPrice: '',
  stopPrice: '',
  targetPrice: '',
  soldAt: '',
  matchedRules: '' as YesNo,
  followedPlan: '' as YesNo,
  feeling: '',
  notes: '',
};

export function AddTradeForm({
  settings,
  onDone,
}: {
  settings: AccountSettings;
  onDone: () => void;
}) {
  const [f, setF] = useState(BLANK);
  // Recording a real trade is always allowed (the log must stay honest),
  // but one dated today on a stood-down day is flagged as a rule break.
  const guard = useGuardrail();
  const breaks = guard.status ? ruleBreaksForNewTrade(f.date, guard.today, guard.status) : [];
  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  const n = (v: string) => (v.trim() === '' ? null : Number(v));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const buy = n(f.buyPrice);
    const target = n(f.targetPrice);
    // Direction auto-derives from target vs entry when both exist and the
    // user hasn't chosen one (§6.4).
    const direction =
      f.direction || (buy != null && target != null ? (target >= buy ? 'Up' : 'Down') : '');
    await addTrade({
      date: f.date,
      symbol: f.symbol.trim().toUpperCase(),
      direction,
      matchedRules: f.matchedRules,
      tradeType: f.tradeType,
      setupTag: f.setupTag.trim(),
      buyPrice: buy,
      stopPrice: n(f.stopPrice),
      targetPrice: target,
      soldAt: n(f.soldAt),
      multiplier: f.tradeType === 'Stock' ? 1 : 100,
      accountSizeAtLog: settings.accountSize,
      riskPctAtLog: settings.riskPct,
      rDirect: null,
      followedPlan: f.followedPlan,
      feeling: f.feeling,
      notes: f.notes,
      source: 'manual',
      ...(breaks.length ? { ruleBreaks: breaks } : {}),
    });
    setF(BLANK);
    onDone();
  }

  return (
    <form className="card add-form" onSubmit={submit} aria-label="Add a trade manually">
      <h2>Add a trade</h2>
      <p className="card-sub">
        For trades placed outside the sizing tools. Uses your current account settings (
        {`$${settings.accountSize.toLocaleString()} at ${settings.riskPct}%`}) for the risk math.
      </p>
      <div className="tool-grid">
        <div className="field">
          <label htmlFor="ad-date">Date</label>
          <input id="ad-date" type="date" className="num" required value={f.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor="ad-sym">Symbol</label>
          <input id="ad-sym" value={f.symbol} onChange={set('symbol')} maxLength={10}
            placeholder="AAPL" style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="field">
          <label htmlFor="ad-type">Trade type</label>
          <select id="ad-type" value={f.tradeType} onChange={set('tradeType')}>
            <option>Stock</option>
            <option>Call</option>
            <option>Put</option>
            <option>Spread</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ad-tag">Setup tag</label>
          <input id="ad-tag" value={f.setupTag} onChange={set('setupTag')} placeholder="breakout" />
        </div>
        <div className="field">
          <label htmlFor="ad-buy">Buy price ($)</label>
          <input id="ad-buy" className="num" type="number" step="any" inputMode="decimal"
            value={f.buyPrice} onChange={set('buyPrice')} />
        </div>
        <div className="field">
          <label htmlFor="ad-stop">Stop price ($)</label>
          <input id="ad-stop" className="num" type="number" step="any" inputMode="decimal"
            value={f.stopPrice} onChange={set('stopPrice')} />
        </div>
        <div className="field">
          <label htmlFor="ad-target">Target price ($)</label>
          <input id="ad-target" className="num" type="number" step="any" inputMode="decimal"
            value={f.targetPrice} onChange={set('targetPrice')} />
        </div>
        <div className="field">
          <label htmlFor="ad-sold">Sold at ($, if closed)</label>
          <input id="ad-sold" className="num" type="number" step="any" inputMode="decimal"
            value={f.soldAt} onChange={set('soldAt')} />
        </div>
        <div className="field">
          <label htmlFor="ad-rules">Matched my rules?</label>
          <select id="ad-rules" value={f.matchedRules} onChange={set('matchedRules')}>
            <option value="">—</option>
            <option>Y</option>
            <option>N</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ad-plan">Followed my plan?</label>
          <select id="ad-plan" value={f.followedPlan} onChange={set('followedPlan')}>
            <option value="">—</option>
            <option>Y</option>
            <option>N</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ad-feel">How I was feeling</label>
          <input id="ad-feel" value={f.feeling} onChange={set('feeling')} placeholder="calm, rushed…" />
        </div>
        <div className="field">
          <label htmlFor="ad-notes">Notes</label>
          <input id="ad-notes" value={f.notes} onChange={set('notes')} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {breaks.length > 0 && (
          <p className="field-hint log-rulebreak-note" role="status">
            You're stood down today. This trade will still be recorded — honestly — and flagged
            as a rule break.
          </p>
        )}
        <button type="submit" className="btn btn-primary">Add to log</button>
        <button type="button" className="btn" onClick={onDone}>Close</button>
      </div>
    </form>
  );
}
