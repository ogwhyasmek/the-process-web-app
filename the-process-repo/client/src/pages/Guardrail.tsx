/**
 * Daily Guardrail (spec §6.3) — the same-day circuit breaker.
 *
 * Today's view is a lens over the shared trades table (source =
 * 'guardrail', date = today) — every result logged here is already a
 * permanent Trade Log row, and "undo last" removes it from both because
 * they are the same row. Auto-resets at local midnight because the view
 * filters by today's date.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../components/Page';
import { db, getSettings, saveSettings, type AccountSettings } from '../lib/db';
import { addTrade } from '../lib/trades';
import { fmtR, todayIso } from '../lib/format';
import '../components/guardrail/guardrail.css';

type YesNoChoice = 'Y' | 'N' | '';

export function Guardrail() {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [today, setToday] = useState(todayIso());

  // Form state
  const [rInput, setRInput] = useState('');
  const [symbol, setSymbol] = useState('');
  const [plan, setPlan] = useState<YesNoChoice>('');

  useEffect(() => {
    getSettings().then(setSettings);
    // Track the date so the page rolls over at local midnight while open.
    const t = setInterval(() => setToday(todayIso()), 30_000);
    return () => clearInterval(t);
  }, []);

  const todays = useLiveQuery(
    () =>
      db.trades
        .where('date')
        .equals(today)
        .filter((t) => t.source === 'guardrail')
        .sortBy('createdAt'),
    [today],
  );

  if (!settings || !todays) return null;

  const results = todays.map((t) => t.rDirect ?? 0);

  // §6.3 formulas, verbatim.
  const maxTrades = settings.maxTradesPerDay;
  const lossLimit = settings.dailyLossLimitR;
  const tradesUsed = results.length;
  const netR = results.reduce((a, b) => a + b, 0);
  const lossR = Math.max(0, -netR);
  const roomLeftR = Math.max(0, lossLimit - lossR);
  const tradesLeft = Math.max(0, maxTrades - tradesUsed);
  const lockedByTrades = maxTrades > 0 && tradesUsed >= maxTrades;
  const lockedByLoss = lossLimit > 0 && lossR >= lossLimit;
  const locked = lockedByTrades || lockedByLoss;
  const caution = !locked && (tradesLeft <= 1 || (lossLimit > 0 && roomLeftR <= 1));

  const status: 'clear' | 'caution' | 'locked' = locked ? 'locked' : caution ? 'caution' : 'clear';

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
      accountSizeAtLog: settings!.accountSize,
      riskPctAtLog: settings!.riskPct,
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
    const last = todays![todays!.length - 1];
    if (last?.id != null) await db.trades.delete(last.id);
  }

  async function resetDay() {
    if (!window.confirm("Clear all of today's guardrail entries? This also removes them from the Trade Log.")) return;
    await db.trades.bulkDelete(todays!.map((t) => t.id!).filter((id) => id != null));
  }

  async function updateSetting(key: 'maxTradesPerDay' | 'dailyLossLimitR', raw: string) {
    const value = Math.max(0, Number(raw) || 0);
    const next = { ...settings!, [key]: key === 'maxTradesPerDay' ? Math.floor(value) : value };
    setSettings(next);
    await saveSettings(next);
  }

  return (
    <Page
      title="Daily Guardrail"
      lede="Today's circuit breaker. Log each result as it happens; when the day's trade cap or loss limit is hit, this page stands you down until tomorrow."
    >
      <section
        className={`card gr-status gr-${status}`}
        role="status"
        aria-live="polite"
        aria-label="Guardrail status"
      >
        {status === 'clear' && (
          <>
            <h2 className="gr-state">Clear to trade</h2>
            <p className="gr-detail num-inline">
              <strong className="num">{tradesLeft}</strong> of{' '}
              <span className="num">{maxTrades}</span> trades left
              {lossLimit > 0 && (
                <>
                  {' '}
                  · <strong className="num">{roomLeftR.toFixed(1)}R</strong> of room before the
                  loss limit
                </>
              )}
              .
            </p>
          </>
        )}
        {status === 'caution' && (
          <>
            <h2 className="gr-state">Caution — tighten up</h2>
            <p className="gr-detail num-inline">
              {tradesLeft <= 1 ? (
                <>
                  Only <strong className="num">{tradesLeft}</strong> trade left today.
                </>
              ) : (
                <>
                  Within <strong className="num">{roomLeftR.toFixed(1)}R</strong> of the daily loss
                  limit.
                </>
              )}{' '}
              Make the next one count — or make it zero.
            </p>
          </>
        )}
        {status === 'locked' && (
          <>
            <h2 className="gr-state">Stand down</h2>
            <p className="gr-detail">
              {lockedByLoss
                ? `Daily loss limit hit (−${lossR.toFixed(1)}R of −${lossLimit}R).`
                : `Trade cap hit (${tradesUsed} of ${maxTrades}).`}{' '}
              The day is over — logging is disabled until tomorrow, and that is the system working.
            </p>
          </>
        )}

        <div className="gr-meters">
          <div className="gr-meter">
            <span className="gr-meter-label">
              Trades used <span className="num">{tradesUsed}/{maxTrades || '∞'}</span>
            </span>
            <div className="gr-meter-track">
              <div
                className="gr-meter-fill"
                style={{ width: maxTrades > 0 ? `${Math.min(100, (tradesUsed / maxTrades) * 100)}%` : '0%' }}
              />
            </div>
          </div>
          <div className="gr-meter">
            <span className="gr-meter-label">
              Loss used <span className="num">{lossR.toFixed(1)}R / {lossLimit || '∞'}R</span>
            </span>
            <div className="gr-meter-track">
              <div
                className="gr-meter-fill is-loss"
                style={{ width: lossLimit > 0 ? `${Math.min(100, (lossR / lossLimit) * 100)}%` : '0%' }}
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
                placeholder="-1 or 2.5"
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
              <button
                type="button"
                className="btn"
                onClick={() => logResult(-1)}
                disabled={locked}
              >
                + Stop hit (−1R)
              </button>
            </div>
          </form>
        </section>

        <section className="card" aria-labelledby="gr-today-title">
          <div className="gr-today-head">
            <h2 id="gr-today-title">Today so far</h2>
            <span className={`num gr-net ${netR > 0 ? 'gain' : netR < 0 ? 'loss' : ''}`}>
              {fmtR(netR, 1)} net
            </span>
          </div>
          {todays.length === 0 ? (
            <p className="field-hint">Nothing logged yet — the best days sometimes stay that way.</p>
          ) : (
            <ul className="gr-chips" aria-label="Today's results">
              {todays.map((t) => (
                <li
                  key={t.id}
                  className={`gr-chip num ${(t.rDirect ?? 0) > 0 ? 'is-gain' : (t.rDirect ?? 0) < 0 ? 'is-loss' : ''}`}
                  title={[t.symbol, t.followedPlan === 'Y' ? 'followed plan' : t.followedPlan === 'N' ? 'broke plan' : '']
                    .filter(Boolean)
                    .join(' · ') || undefined}
                >
                  {fmtR(t.rDirect, 1)}
                  {t.symbol && <span className="gr-chip-sym">{t.symbol}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="gr-today-actions">
            <button className="btn" onClick={undoLast} disabled={todays.length === 0}>
              Undo last
            </button>
            <button className="btn" onClick={resetDay} disabled={todays.length === 0}>
              Reset day
            </button>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="gr-settings-title">
        <h2 id="gr-settings-title">Guardrail settings</h2>
        <p className="card-sub">
          Your standing daily limits — shared with Account Settings, saved as you type.
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
              value={settings.maxTradesPerDay}
              onChange={(e) => updateSetting('maxTradesPerDay', e.target.value)}
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
              value={settings.dailyLossLimitR}
              onChange={(e) => updateSetting('dailyLossLimitR', e.target.value)}
            />
          </div>
        </div>
      </section>
    </Page>
  );
}
