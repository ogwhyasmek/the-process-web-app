/**
 * The Trade Log table (§6.4): every column from the spec, computed cells
 * visually distinct from typed cells, inline edit and delete per row.
 * While editing, computed cells recalculate live from the draft values.
 */
import { useState } from 'react';
import { db, type Trade, type YesNo } from '../../lib/db';
import {
  maxDollarRisk,
  moneyResult,
  positionSize,
  rewardToRisk,
  stopDistance,
  tradeR,
} from '../../lib/trades';
import { fmtMoney, fmtNum, fmtR } from '../../lib/format';

/** Editable (typed) fields of a row, kept as strings while editing. */
interface Draft {
  date: string;
  symbol: string;
  direction: string;
  matchedRules: string;
  tradeType: string;
  setupTag: string;
  buyPrice: string;
  stopPrice: string;
  targetPrice: string;
  soldAt: string;
  rDirect: string;
  followedPlan: string;
  feeling: string;
  notes: string;
}

function toDraft(t: Trade): Draft {
  const s = (v: number | null) => (v == null ? '' : String(v));
  return {
    date: t.date,
    symbol: t.symbol,
    direction: t.direction,
    matchedRules: t.matchedRules,
    tradeType: t.tradeType,
    setupTag: t.setupTag,
    buyPrice: s(t.buyPrice),
    stopPrice: s(t.stopPrice),
    targetPrice: s(t.targetPrice),
    soldAt: s(t.soldAt),
    rDirect: s(t.rDirect),
    followedPlan: t.followedPlan,
    feeling: t.feeling,
    notes: t.notes,
  };
}

/** Apply a draft back onto the stored row shape. */
function fromDraft(t: Trade, d: Draft): Trade {
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    ...t,
    date: d.date,
    symbol: d.symbol.trim().toUpperCase(),
    direction: (d.direction as Trade['direction']) || '',
    matchedRules: (d.matchedRules as YesNo) || '',
    tradeType: d.tradeType,
    setupTag: d.setupTag.trim(),
    buyPrice: n(d.buyPrice),
    stopPrice: n(d.stopPrice),
    targetPrice: n(d.targetPrice),
    soldAt: n(d.soldAt),
    rDirect: n(d.rDirect),
    followedPlan: (d.followedPlan as YesNo) || '',
    feeling: d.feeling,
    notes: d.notes,
  };
}

export function TradeTable({ trades }: { trades: Trade[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function saveEdit(t: Trade) {
    if (!draft) return;
    const next = fromDraft(t, draft);
    // Exit recorded just now: stamp it, so the cooling-off timer (R-06)
    // runs from when the trade actually closed.
    if (t.soldAt == null && next.soldAt != null) next.closedAt = Date.now();
    await db.trades.put(next);
    setEditingId(null);
    setDraft(null);
  }

  async function remove(t: Trade) {
    if (!window.confirm(`Delete the ${t.symbol || 'untitled'} trade from ${t.date}? This can't be undone.`)) return;
    await db.trades.delete(t.id!);
  }

  if (trades.length === 0) {
    return (
      <p className="log-empty">
        No trades match. Rows arrive from the Position Sizer, the Contract Ticket, the Daily
        Guardrail — or the "Add trade" button above.
      </p>
    );
  }

  return (
    <div className="table-scroll">
      <table className="log-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Symbol</th>
            <th scope="col">Up/Down</th>
            <th scope="col" title="All 7 checklist rules checked when logged">Rules</th>
            <th scope="col">Type</th>
            <th scope="col">Setup tag</th>
            <th scope="col" className="num">Buy</th>
            <th scope="col" className="num">Stop</th>
            <th scope="col" className="num">Target</th>
            <th scope="col" className="num th-computed" title="Computed — |buy − stop|">Stop dist</th>
            <th scope="col" className="num th-computed" title="Computed — |target − buy| ÷ stop distance">R:R</th>
            <th scope="col" className="num th-computed" title="Computed — account size × risk % frozen at log time">Max $ risk</th>
            <th scope="col" className="num th-computed" title="Computed — floor(max risk ÷ (stop distance × multiplier))">Size</th>
            <th scope="col" className="num">Sold at</th>
            <th scope="col" className="num th-computed" title="Computed — confirmed P&L formula">$ made/lost</th>
            <th scope="col" className="num th-computed" title="Computed — money ÷ max $ risk (or R logged directly)">R</th>
            <th scope="col">Plan?</th>
            <th scope="col">Feeling</th>
            <th scope="col">Notes</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) =>
            editingId === t.id && draft ? (
              <EditRow
                key={t.id}
                trade={t}
                draft={draft}
                onDraft={setDraft}
                onSave={() => saveEdit(t)}
                onCancel={() => {
                  setEditingId(null);
                  setDraft(null);
                }}
              />
            ) : (
              <ViewRow
                key={t.id}
                trade={t}
                onEdit={() => {
                  setEditingId(t.id!);
                  setDraft(toDraft(t));
                }}
                onDelete={() => remove(t)}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function ViewRow({ trade: t, onEdit, onDelete }: { trade: Trade; onEdit: () => void; onDelete: () => void }) {
  const r = tradeR(t);
  const money = moneyResult(t);
  return (
    <tr>
      <td className="num">{t.date}</td>
      <td className="cell-sym">
        {t.symbol || '—'}
        {t.ruleBreaks?.length ? (
          <span className="rule-break" title={t.ruleBreaks.join('; ')} aria-label={`Rule break: ${t.ruleBreaks.join('; ')}`}>
            ⚑
          </span>
        ) : null}
      </td>
      <td>{t.direction || '—'}</td>
      <td className={t.matchedRules === 'Y' ? 'gain' : t.matchedRules === 'N' ? 'loss' : ''}>
        {t.matchedRules || '—'}
      </td>
      <td>
        {t.tradeType}
        {t.multiplier > 1 && <span className="cell-mult num"> ×{t.multiplier}</span>}
      </td>
      <td>{t.setupTag || '—'}</td>
      <td className="num">{t.buyPrice == null ? '—' : fmtNum(t.buyPrice)}</td>
      <td className="num">{t.stopPrice == null ? '—' : fmtNum(t.stopPrice)}</td>
      <td className="num">{t.targetPrice == null ? '—' : fmtNum(t.targetPrice)}</td>
      <td className="num cell-computed">{fmtNum(stopDistance(t))}</td>
      <td className="num cell-computed">{fmtNum(rewardToRisk(t))}</td>
      <td className="num cell-computed">{fmtMoney(maxDollarRisk(t))}</td>
      <td className="num cell-computed">{positionSize(t) ?? '—'}</td>
      <td className="num">{t.soldAt == null ? '—' : fmtNum(t.soldAt)}</td>
      <td className={`num cell-computed ${money != null ? (money > 0 ? 'gain' : money < 0 ? 'loss' : '') : ''}`}>
        {fmtMoney(money)}
      </td>
      <td className={`num cell-computed ${r != null ? (r > 0 ? 'gain' : r < 0 ? 'loss' : '') : ''}`}>
        {fmtR(r)}
      </td>
      <td className={t.followedPlan === 'Y' ? 'gain' : t.followedPlan === 'N' ? 'loss' : ''}>
        {t.followedPlan || '—'}
      </td>
      <td className="cell-clip" title={t.feeling || undefined}>{t.feeling || '—'}</td>
      <td className="cell-clip" title={t.notes || undefined}>{t.notes || '—'}</td>
      <td className="cell-actions">
        <button className="row-btn" onClick={onEdit} aria-label={`Edit ${t.symbol} ${t.date}`}>
          Edit
        </button>
        <button className="row-btn is-danger" onClick={onDelete} aria-label={`Delete ${t.symbol} ${t.date}`}>
          Del
        </button>
      </td>
    </tr>
  );
}

function EditRow({
  trade,
  draft,
  onDraft,
  onSave,
  onCancel,
}: {
  trade: Trade;
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Live-recompute the computed cells from the draft as the user types.
  const preview = fromDraft(trade, draft);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onDraft({ ...draft, [k]: e.target.value });
  const numInput = (k: keyof Draft, label: string) => (
    <input className="num" type="number" step="any" inputMode="decimal" value={draft[k]}
      onChange={set(k)} aria-label={label} />
  );

  return (
    <tr className="row-editing">
      <td><input type="date" className="num" value={draft.date} onChange={set('date')} aria-label="Date" /></td>
      <td><input value={draft.symbol} onChange={set('symbol')} maxLength={10} aria-label="Symbol"
        style={{ textTransform: 'uppercase', width: '5.5em' }} /></td>
      <td>
        <select value={draft.direction} onChange={set('direction')} aria-label="Direction">
          <option value="">—</option>
          <option>Up</option>
          <option>Down</option>
        </select>
      </td>
      <td>
        <select value={draft.matchedRules} onChange={set('matchedRules')} aria-label="Matched rules">
          <option value="">—</option>
          <option>Y</option>
          <option>N</option>
        </select>
      </td>
      <td>
        <select value={draft.tradeType} onChange={set('tradeType')} aria-label="Trade type">
          <option>Stock</option>
          <option>Call</option>
          <option>Put</option>
          <option>Spread</option>
        </select>
      </td>
      <td><input value={draft.setupTag} onChange={set('setupTag')} aria-label="Setup tag" style={{ width: '7em' }} /></td>
      <td>{numInput('buyPrice', 'Buy price')}</td>
      <td>{numInput('stopPrice', 'Stop price')}</td>
      <td>{numInput('targetPrice', 'Target price')}</td>
      <td className="num cell-computed">{fmtNum(stopDistance(preview))}</td>
      <td className="num cell-computed">{fmtNum(rewardToRisk(preview))}</td>
      <td className="num cell-computed">{fmtMoney(maxDollarRisk(preview))}</td>
      <td className="num cell-computed">{positionSize(preview) ?? '—'}</td>
      <td>{numInput('soldAt', 'Sold at')}</td>
      <td className="num cell-computed">{fmtMoney(moneyResult(preview))}</td>
      <td className="num cell-computed">
        {trade.source === 'guardrail' ? numInput('rDirect', 'R result') : fmtR(tradeR(preview))}
      </td>
      <td>
        <select value={draft.followedPlan} onChange={set('followedPlan')} aria-label="Followed plan">
          <option value="">—</option>
          <option>Y</option>
          <option>N</option>
        </select>
      </td>
      <td><input value={draft.feeling} onChange={set('feeling')} aria-label="Feeling" style={{ width: '8em' }} /></td>
      <td><input value={draft.notes} onChange={set('notes')} aria-label="Notes" style={{ width: '10em' }} /></td>
      <td className="cell-actions">
        <button className="row-btn is-primary" onClick={onSave}>Save</button>
        <button className="row-btn" onClick={onCancel}>Cancel</button>
      </td>
    </tr>
  );
}
