/**
 * Options Contract Ticket (spec §6.2.4) — premium-based sizing.
 * Same account/risk prefill-and-override behavior as the Position Sizer;
 * logs options rows with their contract multiplier so the Trade Log's
 * P&L math (confirmed formula) applies the ×100 correctly.
 */
import { useState } from 'react';
import { computeTicket } from '../../lib/calc';
import { addTrade } from '../../lib/trades';
import { fmtMoney, fmtNum, fmtPct, todayIso } from '../../lib/format';
import type { AccountSettings } from '../../lib/db';

export function ContractTicket({
  settings,
  allRulesChecked,
  onLogged,
}: {
  settings: AccountSettings;
  allRulesChecked: boolean;
  /** Fired after the row is saved — the Cockpit clears the checklist. */
  onLogged?: () => void;
}) {
  const [account, setAccount] = useState(String(settings.accountSize));
  const [risk, setRisk] = useState(String(settings.riskPct));
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [mult, setMult] = useState('100');
  const [symbol, setSymbol] = useState('');
  const [setupTag, setSetupTag] = useState('');
  const [tradeType, setTradeType] = useState<'Call' | 'Put' | 'Spread'>('Call');
  const [date, setDate] = useState(todayIso());
  const [logged, setLogged] = useState<string | null>(null);

  const result = computeTicket({
    accountSize: Number(account),
    riskPct: Number(risk),
    entryPremium: Number(entry),
    stopPremium: Number(stop),
    targetPremium: Number(target),
    multiplier: Number(mult),
  });
  const out = 'warning' in result ? null : result;
  // Guide while the form is still being filled in; red only for real mistakes.
  const incomplete = [account, risk, entry, stop, target, mult].some((v) => v.trim() === '');
  const canLog = !incomplete && !!out && !out.zeroContracts;

  async function logSetup() {
    if (!canLog) return;
    await addTrade({
      date,
      symbol: symbol.trim().toUpperCase(),
      direction: Number(target) >= Number(entry) ? 'Up' : 'Down',
      matchedRules: allRulesChecked ? 'Y' : 'N',
      tradeType,
      setupTag: setupTag.trim(),
      buyPrice: Number(entry),
      stopPrice: Number(stop),
      targetPrice: Number(target),
      soldAt: null,
      multiplier: Number(mult),
      accountSizeAtLog: Number(account),
      riskPctAtLog: Number(risk),
      rDirect: null,
      followedPlan: '',
      feeling: '',
      notes: '',
      source: 'ticket',
    });
    onLogged?.();
    setLogged(
      `${symbol.trim().toUpperCase() || 'Trade'} (${tradeType}) logged — it's in the Trade Log. Checklist cleared for the next trade.`,
    );
    setTimeout(() => setLogged(null), 4000);
  }

  return (
    <section className="card tool" aria-labelledby="ticket-title">
      <h2 id="ticket-title">Options Contract Ticket</h2>
      <p className="card-sub">
        Sizing by premium — how many contracts your risk budget actually affords.
      </p>

      <div className="tool-grid">
        <div className="field">
          <label htmlFor="tk-account">Account size ($)</label>
          <input id="tk-account" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tk-risk">Risk per trade (%)</label>
          <input id="tk-risk" className="num" type="number" min="0" step="0.1" inputMode="decimal"
            value={risk} onChange={(e) => setRisk(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tk-entry">Entry premium ($/share)</label>
          <input id="tk-entry" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="e.g. 2.50" />
        </div>
        <div className="field">
          <label htmlFor="tk-stop">Stop premium ($/share)</label>
          <input id="tk-stop" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={stop} onChange={(e) => setStop(e.target.value)} placeholder="e.g. 1.50" />
          <span className="field-hint">Below entry — where you sell and accept the small loss.</span>
        </div>
        <div className="field">
          <label htmlFor="tk-target">Target premium ($/share)</label>
          <input id="tk-target" className="num" type="number" min="0" step="any" inputMode="decimal"
            value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 4.50" />
        </div>
        <div className="field">
          <label htmlFor="tk-mult">Contract multiplier</label>
          <input id="tk-mult" className="num" type="number" min="1" step="1" inputMode="numeric"
            value={mult} onChange={(e) => setMult(e.target.value)} />
          <span className="field-hint">100 for standard US equity options.</span>
        </div>
      </div>

      {incomplete ? (
        <p className="tool-hint" role="status">
          Enter the entry, stop and target premiums to see how many contracts fit your risk.
        </p>
      ) : !out ? (
        <p className="tool-warning" role="status">
          {'warning' in result ? result.warning : ''}
        </p>
      ) : (
        <>
          <dl className="tool-outputs num" aria-live="polite">
            <div className="out">
              <dt>Contracts</dt>
              <dd className="out-big">{out.contracts}</dd>
            </div>
            <div className="out">
              <dt>Dollar risk (1R)</dt>
              <dd>{fmtMoney(out.dollarRisk)}</dd>
            </div>
            <div className="out">
              <dt>Risk per contract</dt>
              <dd>{fmtMoney(out.riskPerContract)}</dd>
            </div>
            <div className="out">
              <dt>Reward : risk</dt>
              <dd>{fmtNum(out.rewardToRisk)} : 1</dd>
            </div>
            <div className="out">
              <dt>Premium outlay</dt>
              <dd>{fmtMoney(out.capitalDeployed)}</dd>
            </div>
            <div className="out">
              <dt>% of account</dt>
              <dd>{fmtPct(out.pctOfAccount)}</dd>
            </div>
          </dl>
          {out.zeroContracts && (
            <p className="tool-warning" role="alert">
              Zero contracts: one contract alone would risk {fmtMoney(out.riskPerContract)} — more
              than your {fmtMoney(out.dollarRisk)} budget. Widen the stop, raise risk %, or skip
              the trade.
            </p>
          )}
          {!out.zeroContracts && out.overleveraged && (
            <p className="tool-warning" role="alert">
              Overleverage warning: this outlay is {fmtPct(out.pctOfAccount)} of the account —
              beyond the 25% line. A single bad fill shouldn't be able to dent the whole account.
            </p>
          )}
        </>
      )}

      <div className="tool-log">
        <div className="field">
          <label htmlFor="tk-symbol">Symbol</label>
          <input id="tk-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}
            placeholder="AAPL" maxLength={10} style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="field">
          <label htmlFor="tk-type">Type</label>
          <select id="tk-type" value={tradeType}
            onChange={(e) => setTradeType(e.target.value as typeof tradeType)}>
            <option>Call</option>
            <option>Put</option>
            <option>Spread</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tk-tag">Setup tag</label>
          <input id="tk-tag" value={setupTag} onChange={(e) => setSetupTag(e.target.value)}
            placeholder="earnings play" maxLength={24} />
        </div>
        <div className="field">
          <label htmlFor="tk-date">Date</label>
          <input id="tk-date" type="date" className="num" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={logSetup} disabled={!canLog}>
          Log this setup → Trade Log
        </button>
      </div>
      {logged && <p className="save-note" role="status">{logged}</p>}
    </section>
  );
}
