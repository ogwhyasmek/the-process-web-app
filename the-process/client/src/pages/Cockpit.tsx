/**
 * Trade Cockpit (spec §6.2) — everything that happens before an entry,
 * in the order it's actually used: checklist → sizing → options lab →
 * reference. Checklist state and Greeks inputs persist across refreshes.
 */
import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Checklist } from '../components/cockpit/Checklist';
import { PositionSizer } from '../components/cockpit/PositionSizer';
import { ContractTicket } from '../components/cockpit/ContractTicket';
import { GreeksLab, DEFAULT_GREEKS, type GreeksInputs } from '../components/cockpit/GreeksLab';
import { VolatilityRead } from '../components/cockpit/VolatilityRead';
import { Link } from 'react-router';
import { EarningsCalendar } from '../components/cockpit/EarningsCalendar';
import { useKvState, kvGet, kvSet } from '../lib/kv';
import { db, getSettings, type AccountSettings } from '../lib/db';
import { todayIso } from '../lib/format';
import { useGuardrail } from '../lib/useGuardrail';
import type { SizerPrefill } from '../components/cockpit/PositionSizer';
import '../components/cockpit/cockpit.css';

export function Cockpit() {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [prefill, setPrefill] = useState<SizerPrefill | null | 'pending'>('pending');
  // The checklist is ticked per trade (§6.2.2), so its state must never
  // carry over: it's stored under today's date (a new day starts blank)
  // and cleared after every trade is logged from this page. Otherwise
  // yesterday's 7/7 would stamp "matched my rules: Y" on today's trades.
  const [checklistKey] = useState(() => `cockpit.checklist.${todayIso()}`);
  const [checks, setChecks, checksLoaded] = useKvState<boolean[]>(
    checklistKey,
    Array(7).fill(false),
  );
  const [greeks, setGreeks, greeksLoaded] = useKvState<GreeksInputs>(
    'cockpit.greeks',
    DEFAULT_GREEKS,
  );

  // Daily Guardrail: while stood down, or cooling off after a loss (R-06),
  // the Cockpit can't log a new setup for today. Planning still works.
  const guard = useGuardrail();
  const blockToday: string | null = !guard.status
    ? null
    : guard.status.locked
      ? 'Stood down for today — the Daily Guardrail hit a limit. New setups can be logged again tomorrow.'
      : guard.coolingUntil
        ? `Cooling off after a loss (rule R-06) — new setups can be logged from ${new Date(
            guard.coolingUntil,
          ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
        : null;

  useEffect(() => {
    getSettings().then(setSettings);
    // Drop earlier days' checklist ticks (and the old undated key).
    db.kv
      .where('key')
      .startsWith('cockpit.checklist')
      .filter((e) => e.key !== checklistKey)
      .delete()
      .catch(() => undefined);
    // One-shot prefill from the Stock Analyzer's handoff (§6.7).
    kvGet<SizerPrefill>('cockpit.sizerPrefill').then((p) => {
      setPrefill(p ?? null);
      if (p) kvSet('cockpit.sizerPrefill', null);
    });
  }, []);

  if (!settings || !checksLoaded || !greeksLoaded || prefill === 'pending') return null;

  const allRulesChecked = checks.every(Boolean);
  // Called after a setup is logged: the next trade starts from 0/7.
  const resetChecklist = () => setChecks(Array(7).fill(false));

  return (
    <Page
      title="Trade Cockpit"
      lede="Everything that happens before an entry. Nothing here is advice — it's the process that keeps one trade from becoming a bad day."
    >
      {blockToday && (
        <p className={`cockpit-block ${guard.status?.locked ? 'is-locked' : ''}`} role="status">
          {blockToday}
        </p>
      )}

      <Checklist checks={checks} onChange={setChecks} />

      <div className="cockpit-pair">
        <PositionSizer
          settings={settings}
          allRulesChecked={allRulesChecked}
          prefill={prefill}
          onLogged={resetChecklist}
          blockToday={blockToday}
        />
        <ContractTicket
          settings={settings}
          allRulesChecked={allRulesChecked}
          onLogged={resetChecklist}
          blockToday={blockToday}
        />
      </div>

      <h2 className="section-title">Options lab</h2>
      <div className="cockpit-pair">
        <GreeksLab value={greeks} onChange={setGreeks} />
        <div className="cockpit-stack">
          <VolatilityRead spot={Number(greeks.spot)} dte={Number(greeks.dte)} />
          <EarningsCalendar />
        </div>
      </div>

      {/* The account-killer cards and options-vs-futures table live on
          Reference: read once, they made this page twice as long as the
          tools used before every trade. */}
      <p className="cockpit-more">
        Why every tool on this page exists:{' '}
        <Link to="/reference#account-killers">the four ways an account dies →</Link>
      </p>
    </Page>
  );
}
