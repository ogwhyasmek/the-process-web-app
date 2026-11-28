/**
 * Daily Guardrail (spec §6.3) — the same-day circuit breaker.
 *
 * A lens over the shared trades table: EVERY trade dated today counts,
 * whichever page logged it (Sizer, Ticket, manual, or here). The rules
 * live in lib/guardrail.ts; this page shows them and logs results.
 *
 * Tightened (user decisions, 2026-11):
 * - Once stood down, the day stays stood down until midnight. Deleting
 *   trades can't lift it, and there is no "reset day".
 * - "Undo last" only fixes a typo: a Guardrail entry, within 2 minutes.
 * - Limits: tightening applies now; loosening from tomorrow.
 */
import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { db, getSettings, saveSettings } from '../lib/db';
import { addTrade, tradeR } from '../lib/trades';
import { fmtR } from '../lib/format';
import {
  applyLimitEdit,
  canUndo,
  STAND_DOWN_KEY,
  undoLiftsStandDown,
  UNDO_WINDOW_MS,
} from '../lib/guardrail';
import { useGuardrail } from '../lib/useGuardrail';
import '../components/guardrail/guardrail.css';

type YesNoChoice = 'Y' | 'N' | '';


export function Guardrail() {
  const g = useGuardrail();

  // Form state
  const [rInput, setRInput] = useState('');
  const [symbol, setSymbol] = useState('');
  const [plan, setPlan] = useState<YesNoChoice>('');

  // Seed the settings row on first run (the hook only reads).
  useEffect(() => {
    getSettings();
  }, []);

  // Undo's 2-minute window counts down by the second.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!g.loaded || !g.status || !g.limits) return null;
  const { status, limits, trades: todays, today } = g;
  const maxTrades = limits.maxTradesPerDay;
  const lossLimit = limits.dailyLossLimitR;
  const locked = status.locked;
  const pageState: 'clear' | 'caution' | 'locked' = locked ? 'locked' : status.caution ? 'caution' : 'clear';

  const lastGuardrailEntry = [...todays].reverse().find((t) => t.source === 'guardrail');
  const undoable = canUndo(lastGuardrailEntry, now);
  const undoLeft = lastGuardrailEntry ? UNDO_WINDOW_MS - (now - lastGuardrailEntry.createdAt) : 0;

  async function logResult(r: number) {
    if (locked || !isFinite(r)) return;
    await addTrade({
      date: today,
      symbol: symbol.trim().toUpperCase(),
      direction: '',
      matchedRules: '',
      tradeType: 'Stock',
      setupTag: '',
      buyPrice: null,
      stopPrice: null,
      targetPrice: null,
      soldAt: null,
      multiplier: 1,
      accountSizeAtLog: g.settings.accountSize,
      riskPctAtLog: g.settings.riskPct,
      rDirect: r,
      followedPlan: plan,
      feeling: '',
      notes: '',
      source: 'guardrail',
    });
    setRInput('');
    setSymbol('');
    setPlan('');
  }

  async function undoLast() {
    if (!undoable || lastGuardrailEntry?.id == null) return;
    const lifts = undoLiftsStandDown(g.latch, lastGuardrailEntry, today, Date.now());
    const id = lastGuardrailEntry.id;
    // One transaction: the entry and (if it caused it) the stand-down go together.
    await db.transaction('rw', db.trades, db.kv, async () => {
      await db.trades.delete(id);
      if (lifts) await db.kv.delete(STAND_DOWN_KEY);
    });
  }

  const standDownLine = () => {
    if (status.lockedByLoss) return `Daily loss limit hit (−${status.lossR.toFixed(1)}R of −${lossLimit}R).`;
    if (status.lockedByTrades) return `Trade cap hit (${status.tradesUsed} of ${maxTrades}).`;
    return 'You hit a limit earlier today. Removing trades since then doesn’t lift it.';
  };

  return (
    <Page
      title="Daily Guardrail"
      lede="Today's circuit breaker. Every trade you log today counts — from any page. When the trade cap or loss limit is hit, the day is over until midnight."
    >
      <section
        className={`card gr-status gr-${pageState}`}
        role="status"
        aria-live="polite"
        aria-label="Guardrail status"
      >
        {pageState === 'clear' && (
          <>
            <h2 className="gr-state">Clear to trade</h2>
            <p className="gr-detail num-inline">
              {maxTrades > 0 ? (
                <>
                  <strong className="num">{status.tradesLeft}</strong> of{' '}
                  <span className="num">{maxTrades}</span> trades left
                </>
              ) : (
                'No trade cap set'
              )}
              {lossLimit > 0 && (
                <>
                  {' '}
                  · <strong className="num">{status.roomLeftR.toFixed(1)}R</strong> of room before the
                  loss limit
                </>
              )}
              .
            </p>
          </>
        )}
        {pageState === 'caution' && (
          <>
            <h2 className="gr-state">Caution — tighten up</h2>
            <p className="gr-detail num-inline">
              {maxTrades > 0 && status.tradesLeft <= 1 ? (
                <>
                  Only <strong className="num">{status.tradesLeft}</strong> trade left today.
                </>
              ) : (
                <>
                  Within <strong className="num">{status.roomLeftR.toFixed(1)}R</strong> of the daily
                  loss limit.
                </>
              )}{' '}
              Make the next one count — or make it zero.
            </p>
          </>
        )}
        {pageState === 'locked' && (
          <>
            <h2 className="gr-state">Stand down</h2>
            <p className="gr-detail">
              {standDownLine()} The day is over until midnight — the Cockpit won't log new setups,
              and that is the system working.
            </p>
          </>
        )}

        <div className="gr-meters">
          <div className="gr-meter">
            <span className="gr-meter-label">
              Trades used{' '}
              <span className="num">
                {status.tradesUsed}/{maxTrades || '∞'}
                {status.openTrades > 0 && ` · ${status.openTrades} open`}
              </span>
            </span>
            <div className="gr-meter-track">
              <div
                className="gr-meter-fill"
                style={{ width: maxTrades > 0 ? `${Math.min(100, (status.tradesUsed / maxTrades) * 100)}%` : '0%' }}
              />
            </div>
          </div>
          <div className="gr-meter">
            <span className="gr-meter-label">
              Loss used <span className="num">{status.lossR.toFixed(1)}R / {lossLimit || '∞'}R</span>
            </span>
            <div className="gr-meter-track">
              <div
                className="gr-meter-fill is-loss"
                style={{ width: lossLimit > 0 ? `${Math.min(100, (status.lossR / lossLimit) * 100)}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="gr-pair">
        <section className="card" aria-labelledby="gr-log-title">
          <h2 id="gr-log-title">Log a result</h2>
          <p className="card-sub">
            In R: stopped out at plan is −1, double your risk is +2. Tag the symbol and whether you
            followed the plan — that honesty powers the analytics.
          </p>
          <form
            className="gr-form"
            onSubmit={(e) => {
              e.preventDefault();
              logResult(Number(rInput));
            }}
          >
            <div className="field">
              <label htmlFor="gr-r">Result (R)</label>
              <input
                id="gr-r"
                className="num"
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="e.g. -1 or 2.5"
                value={rInput}
                onChange={(e) => setRInput(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="field">
              <label htmlFor="gr-sym">Symbol (optional)</label>
              <input
                id="gr-sym"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AAPL"
                maxLength={10}
                style={{ textTransform: 'uppercase' }}
                disabled={locked}
              />
            </div>
            <div className="field">
              <label htmlFor="gr-plan">Followed plan?</label>
              <select
                id="gr-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as YesNoChoice)}
                disabled={locked}
              >
                <option value="">—</option>
                <option value="Y">Yes</option>
                <option value="N">No</option>
              </select>
            </div>
            <div className="gr-form-actions">
              <button type="submit" className="btn btn-primary" disabled={locked || rInput === ''}>
                Log result
              </button>
              <button type="button" className="btn" onClick={() => logResult(-1)} disabled={locked}>
                + Stop hit (−1R)
              </button>
            </div>
          </form>
        </section>

        <section className="card" aria-labelledby="gr-today-title">
          <div className="gr-today-head">
            <h2 id="gr-today-title">Today so far</h2>
            <span className={`num gr-net ${status.netR > 0 ? 'gain' : status.netR < 0 ? 'loss' : ''}`}>
              {fmtR(status.netR, 1)} net
            </span>
          </div>
          {todays.length === 0 ? (
            <p className="field-hint">Nothing logged yet — the best days sometimes stay that way.</p>
          ) : (
            <ul className="gr-chips" aria-label="Today's trades">
              {todays.map((t) => {
                const r = tradeR(t);
                const title = [
                  t.symbol,
                  t.source === 'guardrail' ? '' : `logged from ${t.source}`,
                  t.followedPlan === 'Y' ? 'followed plan' : t.followedPlan === 'N' ? 'broke plan' : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li
                    key={t.id}
                    className={`gr-chip num ${r == null ? 'is-open' : r > 0 ? 'is-gain' : r < 0 ? 'is-loss' : ''}`}
                    title={title || undefined}
                  >
                    {r == null ? 'open' : fmtR(r, 1)}
                    {t.symbol && <span className="gr-chip-sym">{t.symbol}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="gr-today-actions">
            <button className="btn" onClick={undoLast} disabled={!undoable}>
              {undoable
                ? `Undo last (${Math.floor(undoLeft / 60000)}:${String(Math.floor((undoLeft % 60000) / 1000)).padStart(2, '0')})`
                : 'Undo last'}
            </button>
            <span className="field-hint gr-undo-hint">
              Undo fixes a typo within 2 minutes — and if that typo caused a stand-down, undoing
              it lifts it. Anything else: edit it in the Trade Log; removing a trade never lifts a
              stand-down.
            </span>
          </div>
        </section>
      </div>

      <LimitsCard />
    </Page>
  );
}

/**
 * Daily limits, saved with a button (not per keystroke): a stricter value
 * applies at once, a looser one from tomorrow — so a limit can never be
 * raised mid-day to escape a stand-down.
 */
function LimitsCard() {
  const g = useGuardrail();
  const [form, setForm] = useState<{ maxTradesPerDay: string; dailyLossLimitR: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Start the form from the limits in force (once loaded).
  useEffect(() => {
    if (g.limits && !form) {
      setForm({
        maxTradesPerDay: String(g.limits.maxTradesPerDay),
        dailyLossLimitR: String(g.limits.dailyLossLimitR),
      });
    }
  }, [g.limits, form]);

  if (!g.limits || !form) return null;
  const pending = g.limits.pending;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      maxTradesPerDay: Math.max(0, Math.floor(Number(form!.maxTradesPerDay) || 0)),
      dailyLossLimitR: Math.max(0, Number(form!.dailyLossLimitR) || 0),
    };
    const current = await getSettings();
    const updated = applyLimitEdit(current, next, g.today);
    await saveSettings(updated);
    setNote(
      updated.pendingLimits
        ? 'Saved. Looser limits take effect tomorrow; anything stricter applies now.'
        : 'Saved — in effect now.',
    );
  }

  return (
    <form className="card" aria-labelledby="gr-settings-title" onSubmit={save}>
      <h2 id="gr-settings-title">Guardrail limits</h2>
      <p className="card-sub">
        Stricter limits apply immediately. Looser ones apply from tomorrow, so a limit can't be
        raised to get out of today. 0 means no limit.
      </p>
      <div className="gr-settings">
        <div className="field">
          <label htmlFor="gr-max">Max trades per day</label>
          <input
            id="gr-max"
            className="num"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={form.maxTradesPerDay}
            onChange={(e) => setForm({ ...form, maxTradesPerDay: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="gr-limit">Daily loss limit (R)</label>
          <input
            id="gr-limit"
            className="num"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={form.dailyLossLimitR}
            onChange={(e) => setForm({ ...form, dailyLossLimitR: e.target.value })}
          />
        </div>
        <button type="submit" className="btn">Save limits</button>
      </div>
      {pending && (
        <p className="field-hint gr-pending" role="status">
          From tomorrow:{' '}
          {[
            pending.maxTradesPerDay !== undefined && `trade cap ${pending.maxTradesPerDay || 'none'}`,
            pending.dailyLossLimitR !== undefined && `loss limit ${pending.dailyLossLimitR ? `${pending.dailyLossLimitR}R` : 'none'}`,
          ]
            .filter(Boolean)
            .join(', ')}
          . Today stays at {g.limits.maxTradesPerDay || 'no'} trades and{' '}
          {g.limits.dailyLossLimitR ? `${g.limits.dailyLossLimitR}R` : 'no loss limit'}.
        </p>
      )}
      {note && <p className="save-note" role="status">{note}</p>}
    </form>
  );
}
