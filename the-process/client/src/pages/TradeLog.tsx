/**
 * Trade Log (spec §6.4) — the permanent record. Everything the Analytics
 * Dashboard and exports read comes from this one table.
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../components/Page';
import { SummaryStrip } from '../components/log/SummaryStrip';
import { TradeTable } from '../components/log/TradeTable';
import { AddTradeForm } from '../components/log/AddTradeForm';
import { db, getSettings, type AccountSettings, type Trade } from '../lib/db';
import {
  maxDollarRisk,
  moneyResult,
  positionSize,
  rewardToRisk,
  stopDistance,
  tradeR,
} from '../lib/trades';
import { buildCsv, downloadFile } from '../lib/csv';
import { todayIso } from '../lib/format';
import { useEffect } from 'react';
import '../components/log/log.css';

type SortKey = 'date' | 'symbol' | 'r' | 'plan';
type SortDir = 'asc' | 'desc';

export function TradeLog() {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Filters (§6.4: by date, symbol, R, followed-plan).
  const [fSymbol, setFSymbol] = useState('');
  const [fPlan, setFPlan] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fR, setFR] = useState(''); // '', 'win', 'loss', 'open'

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const all = useLiveQuery(() => db.trades.toArray(), []);

  // Chronological order for streak/expectancy math (oldest → newest).
  const chronological = useMemo(() => {
    if (!all) return [];
    return [...all].sort(
      (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
    );
  }, [all]);

  const allRs = useMemo(
    () => chronological.map(tradeR).filter((r): r is number => r != null),
    [chronological],
  );

  const filtered = useMemo(() => {
    let rows = [...chronological];
    if (fSymbol.trim()) {
      const needle = fSymbol.trim().toUpperCase();
      rows = rows.filter((t) => t.symbol.includes(needle));
    }
    if (fPlan) rows = rows.filter((t) => t.followedPlan === fPlan);
    if (fFrom) rows = rows.filter((t) => t.date >= fFrom);
    if (fTo) rows = rows.filter((t) => t.date <= fTo);
    if (fR) {
      rows = rows.filter((t) => {
        const r = tradeR(t);
        if (fR === 'open') return r == null;
        if (r == null) return false;
        return fR === 'win' ? r > 0 : r < 0;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return (a.date.localeCompare(b.date) || a.createdAt - b.createdAt) * dir;
        case 'symbol':
          return a.symbol.localeCompare(b.symbol) * dir;
        case 'plan':
          return a.followedPlan.localeCompare(b.followedPlan) * dir;
        case 'r': {
          const ra = tradeR(a);
          const rb = tradeR(b);
          if (ra == null && rb == null) return 0;
          if (ra == null) return 1; // open trades sink to the bottom
          if (rb == null) return -1;
          return (ra - rb) * dir;
        }
      }
    });
    return rows;
  }, [chronological, fSymbol, fPlan, fFrom, fTo, fR, sortKey, sortDir]);

  function setSort(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  }

  function exportSpreadsheet() {
    const header = [
      'Date', 'Symbol', 'Up or down', 'Matched my rules', 'Trade type', 'Setup tag',
      'Buy price', 'Stop price', 'Target price', 'Stop distance', 'Reward vs risk',
      'Max dollar risk', 'Position size', 'Sold at', 'Money made or lost', 'Score (R)',
      'Followed my plan', 'How I was feeling', 'Notes', 'Rule breaks',
    ];
    const rows = filtered.map((t: Trade) => [
      t.date, t.symbol, t.direction, t.matchedRules, t.tradeType, t.setupTag,
      t.buyPrice, t.stopPrice, t.targetPrice,
      round(stopDistance(t)), round(rewardToRisk(t)), round(maxDollarRisk(t)),
      positionSize(t), t.soldAt, round(moneyResult(t)), round(tradeR(t)),
      t.followedPlan, t.feeling, t.notes, (t.ruleBreaks ?? []).join('; '),
    ]);
    downloadFile(`the-process-trade-log-${todayIso()}.csv`, buildCsv(header, rows));
  }

  if (!settings || !all) return null;

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <Page
      title="Trade Log"
      lede="The permanent record — every trade ever logged, in one place. Typed cells are yours; tinted cells are computed and always current."
    >
      <SummaryStrip rs={allRs} />

      <div className="log-toolbar">
        <div className="log-filters">
          <label className="sr-only" htmlFor="lf-sym">Filter by symbol</label>
          <input id="lf-sym" placeholder="Symbol…" value={fSymbol}
            onChange={(e) => setFSymbol(e.target.value)} style={{ textTransform: 'uppercase', width: '7em' }} />
          <label className="sr-only" htmlFor="lf-plan">Filter by followed plan</label>
          <select id="lf-plan" value={fPlan} onChange={(e) => setFPlan(e.target.value)}>
            <option value="">Plan: all</option>
            <option value="Y">Plan: followed</option>
            <option value="N">Plan: broken</option>
          </select>
          <label className="sr-only" htmlFor="lf-r">Filter by result</label>
          <select id="lf-r" value={fR} onChange={(e) => setFR(e.target.value)}>
            <option value="">Result: all</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="open">Still open</option>
          </select>
          <label className="sr-only" htmlFor="lf-from">From date</label>
          <input id="lf-from" type="date" className="num" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          <label className="sr-only" htmlFor="lf-to">To date</label>
          <input id="lf-to" type="date" className="num" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        </div>
        <div className="log-sorts" role="group" aria-label="Sort">
          <span className="log-sort-label">Sort:</span>
          <button className="row-btn" onClick={() => setSort('date')}>date{arrow('date')}</button>
          <button className="row-btn" onClick={() => setSort('symbol')}>symbol{arrow('symbol')}</button>
          <button className="row-btn" onClick={() => setSort('r')}>R{arrow('r')}</button>
          <button className="row-btn" onClick={() => setSort('plan')}>plan{arrow('plan')}</button>
        </div>
        <div className="log-actions">
          <button className="btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Hide form' : 'Add trade'}
          </button>
          <button className="btn" onClick={exportSpreadsheet} disabled={filtered.length === 0}>
            Export spreadsheet
          </button>
        </div>
      </div>

      {showAdd && <AddTradeForm settings={settings} onDone={() => setShowAdd(false)} />}

      <TradeTable trades={filtered} />

      <p className="field-hint">
        {filtered.length} of {all.length} trade{all.length === 1 ? '' : 's'} shown. Export includes
        exactly what's shown, computed columns included.
      </p>
    </Page>
  );
}

function round(v: number | null): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}
