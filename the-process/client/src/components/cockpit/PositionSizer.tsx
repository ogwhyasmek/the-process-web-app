/**
 * Position Sizer for shares/futures (spec §6.2.3).
 *
 * Account size and risk % prefill from Account Settings; editing them here
 * is a one-off override that never changes the standing defaults (§6.1).
 * "Log this setup" pushes a row straight into the Trade Log with the
 * checklist's matched-rules flag and the values in effect on this tool.
 */
import { useState } from 'react';
import { computeSizer } from '../../lib/calc';
import { addTrade } from '../../lib/trades';
import { fmtMoney, fmtNum, todayIso } from '../../lib/format';
import type { AccountSettings } from '../../lib/db';

/** Handoff payload from the Stock Analyzer (§6.7). */
export interface SizerPrefill {
  symbol: string;
  entry: number;
  stop: number;
  target: number;
}

export function PositionSizer({
  settings,
  allRulesChecked,
  prefill = null,
}: {
  settings: AccountSettings;
  allRulesChecked: boolean;
  prefill?: SizerPrefill | null;
}) {
  const [account, setAccount] = useState(String(settings.accountSize));
  const [risk, setRisk] = useState(String(settings.riskPct));
  const [entry, setEntry] = useState(prefill ? String(prefill.entry) : '');
  const [stop, setStop] = useState(prefill ? String(prefill.stop) : '');
  const [target, setTarget] = useState(prefill ? String(prefill.target) : '');
  const [symbol, setSymbol] = useState(prefill?.symbol ?? '');
  const [setupTag, setSetupTag] = useState('');
  const [date, setDate] = useState(todayIso());
  const [logged, setLogged] = useState<string | null>(null);

  const result = computeSizer({
    accountSize: Number(account),
    riskPct: Number(risk),
    entry: Number(entry),
    stop: Number(stop),
    target: Number(target),
  });
  const out = 'warning' in result ? null : result;

  async function logSetup() {
    if (!out) return;
    await addTrade({
      date,
      symbol: symbol.trim().toUpperCase(),
      direction: out.direction,
      matchedRules: allRulesChecked ? 'Y' : 'N',
      tradeType: 'Stock',
      setupTag: setupTag.trim(),
      buyPrice: Number(entry),
      stopPrice: Number(stop),
      targetPrice: Number(target),
      soldAt: null,
      multiplier: 1,
      accountSizeAtLog: Number(account),
      riskPctAtLog: Number(risk),
      rDirect: null,
      followedPlan: '',
      feeling: '',
      notes: '',
      source: 'sizer',
    });
    setLogged(`${symbol.trim().toUpperCase() || 'Trade'} logged — it's in the Trade Log.`);
    setTimeout(() => setLogged(null), 4000);
  }

  return (
    <section className="card tool" aria-labelledby="sizer-title">
      <h2 id="sizer-title">Position Sizer</h2>
      <p className="card-sub">Shares & futures — how many to buy, from risk, never from gut feel.</p>

      <div className="tool-grid">
        <div className="field">
          <label htmlFor="sz-account">Account size ($)</label>
          <input id="sz-account" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={account} onChange={(e) => setAccount(e.target.value)} />
          <span className="field-hint">Prefilled from settings — edits here are one-offs.</span>
        </div>
        <div className="field">
          <label htmlFor="sz-risk">Risk per trade (%)</label>
          <input id="sz-risk" className="num" type="number" min="0" step="0.1" inputMode="decimal"
            value={risk} onChange={(e) => setRisk(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sz-entry">Entry price ($)</label>
          <input id="sz-entry" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="sz-stop">Stop price ($)</label>
          <input id="sz-stop" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={stop} onChange={(e) => setStop(e.target.value)} placeholder="0.00" />
          <span className="field-hint">Where you're wrong — decided now, while calm.</span>
        </div>
        <div className="field">
          <label htmlFor="sz-target">Target price ($)</label>
          <input id="sz-target" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" />
        </div>
      </div>

      {!out ? (
        <p className="tool-warning" role="status">
          {'warning' in result ? result.warning : ''}
        </p>
      ) : (
        <dl className="tool-outputs num" aria-live="polite">
          <div className="out">
            <dt>Position size</dt>
            <dd className="out-big">{out.positionSize.toLocaleString()}</dd>
          </div>
          <div className="out">
            <dt>Dollar risk (1R)</dt>
            <dd>{fmtMoney(out.dollarRisk)}</dd>
          </div>
          <div className="out">
            <dt>Stop distance</dt>
            <dd>{fmtMoney(out.stopDistance)}</dd>
          </div>
          <div className="out">
            <dt>Reward : risk</dt>
            <dd>{fmtNum(out.rewardToRisk)} : 1</dd>
          </div>
        </dl>
      )}

      <div className="tool-log">
        <div className="field">
          <label htmlFor="sz-symbol">Symbol</label>
          <input id="sz-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}
            placeholder="AAPL" maxLength={10} style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="field">
          <label htmlFor="sz-tag">Setup tag</label>
          <input id="sz-tag" value={setupTag} onChange={(e) => setSetupTag(e.target.value)}
            placeholder="breakout" maxLength={24} />
        </div>
        <div className="field">
          <label htmlFor="sz-date">Date</label>
          <input id="sz-date" type="date" className="num" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={logSetup} disabled={!out}>
          Log this setup → Trade Log
        </button>
      </div>
      <p className="field-hint">
        Logs with "matched my rules: {allRulesChecked ? 'Y' : 'N'}" from the checklist above.
      </p>
      {logged && <p className="save-note" role="status">{logged}</p>}
    </section>
  );
}
