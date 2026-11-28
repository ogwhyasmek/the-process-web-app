/**
 * Account Settings (spec §6.1) — the single persistent record the
 * Position Sizer, Contract Ticket, and Daily Guardrail all prefill from.
 * Tools may override per-calculation without changing these defaults.
 */
import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { getSettings, saveSettings, type AccountSettings } from '../lib/db';
import { fmtMoneyWhole, todayIso } from '../lib/format';
import { applyLimitEdit, effectiveLimits } from '../lib/guardrail';

interface FormState {
  accountSize: string;
  riskPct: string;
  maxTradesPerDay: string;
  dailyLossLimitR: string;
}

export function Settings() {
  const [form, setForm] = useState<FormState | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [stored, setStored] = useState<AccountSettings | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setStored(s);
      // Show the daily limits actually in force today.
      const limits = effectiveLimits(s, todayIso());
      setForm({
        accountSize: String(s.accountSize),
        riskPct: String(s.riskPct),
        maxTradesPerDay: String(limits.maxTradesPerDay),
        dailyLossLimitR: String(limits.dailyLossLimitR),
      });
    });
  }, []);

  if (!form) return null;

  const accountSize = Number(form.accountSize);
  const riskPct = Number(form.riskPct);
  const dollarRisk =
    isFinite(accountSize) && isFinite(riskPct) && accountSize > 0 && riskPct > 0
      ? accountSize * (riskPct / 100)
      : null;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    setSavedAt(null);
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const current = await getSettings();
    // Account size and risk % apply at once. The daily limits follow the
    // Guardrail rule: stricter now, looser from tomorrow.
    const withAccount = {
      ...current,
      accountSize: Math.max(0, Number(form!.accountSize) || 0),
      riskPct: Math.max(0, Number(form!.riskPct) || 0),
    };
    const next = applyLimitEdit(
      withAccount,
      {
        maxTradesPerDay: Math.max(0, Math.floor(Number(form!.maxTradesPerDay) || 0)),
        dailyLossLimitR: Math.max(0, Number(form!.dailyLossLimitR) || 0),
      },
      todayIso(),
    );
    const { id: _id, ...rest } = next;
    await saveSettings(rest);
    setStored(next);
    setSavedAt(Date.now());
  }
  const pending = stored ? effectiveLimits(stored, todayIso()).pending : null;

  return (
    <Page
      title="Account Settings"
      lede="Your standing rules. Every sizing tool prefills from these values; a one-off override on a tool never changes what's saved here."
    >
      <form className="card" style={{ maxWidth: 440 }} onSubmit={onSave}>
        <h2>Account & risk defaults</h2>
        <p className="card-sub">Saved on this device only — nothing leaves your computer.</p>

        <div className="field">
          <label htmlFor="set-account">How much money is in the account?</label>
          <input
            id="set-account"
            className="num"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={form.accountSize}
            onChange={set('accountSize')}
          />
        </div>

        <div className="field">
          <label htmlFor="set-risk">Risk per trade (%)</label>
          <input
            id="set-risk"
            className="num"
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={form.riskPct}
            onChange={set('riskPct')}
          />
          <span className="field-hint">
            {dollarRisk != null
              ? `One losing trade costs at most ${fmtMoneyWhole(dollarRisk)} (1R).`
              : 'The slice of the account one trade is allowed to lose. 1–2% is the usual rule.'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="set-maxtrades">Max trades per day</label>
          <input
            id="set-maxtrades"
            className="num"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={form.maxTradesPerDay}
            onChange={set('maxTradesPerDay')}
          />
          <span className="field-hint">The Daily Guardrail stands you down past this count.</span>
        </div>

        <div className="field">
          <label htmlFor="set-losslimit">Daily loss limit (R)</label>
          <input
            id="set-losslimit"
            className="num"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={form.dailyLossLimitR}
            onChange={set('dailyLossLimitR')}
          />
          <span className="field-hint">
            Down this many R in one day means the day is over. 2R is a common choice.
          </span>
        </div>

        <p className="field-hint">
          Daily limits: stricter values apply now; looser ones from tomorrow, so a limit can't be
          raised to get out of a stand-down. 0 means no limit.
        </p>
        {pending && (
          <p className="field-hint" style={{ color: 'var(--amber)' }} role="status">
            From tomorrow:{' '}
            {[
              pending.maxTradesPerDay !== undefined && `trade cap ${pending.maxTradesPerDay || 'none'}`,
              pending.dailyLossLimitR !== undefined &&
                `loss limit ${pending.dailyLossLimitR ? `${pending.dailyLossLimitR}R` : 'none'}`,
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
          {savedAt && (
            <span className="save-note" role="status">
              Saved.
            </span>
          )}
        </div>
      </form>
    </Page>
  );
}
