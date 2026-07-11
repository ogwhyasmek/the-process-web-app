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
import { AccountKillers } from '../components/cockpit/AccountKillers';
import { OptionsFuturesTable } from '../components/cockpit/OptionsFuturesTable';
import { EarningsCalendar } from '../components/cockpit/EarningsCalendar';
import { useKvState, kvGet, kvSet } from '../lib/kv';
import { getSettings, type AccountSettings } from '../lib/db';
import type { SizerPrefill } from '../components/cockpit/PositionSizer';
import '../components/cockpit/cockpit.css';

export function Cockpit() {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [prefill, setPrefill] = useState<SizerPrefill | null | 'pending'>('pending');
  const [checks, setChecks, checksLoaded] = useKvState<boolean[]>(
    'cockpit.checklist',
    Array(7).fill(false),
  );
  const [greeks, setGreeks, greeksLoaded] = useKvState<GreeksInputs>(
    'cockpit.greeks',
    DEFAULT_GREEKS,
  );

  useEffect(() => {
    getSettings().then(setSettings);
    // One-shot prefill from the Stock Analyzer's handoff (§6.7).
    kvGet<SizerPrefill>('cockpit.sizerPrefill').then((p) => {
      setPrefill(p ?? null);
      if (p) kvSet('cockpit.sizerPrefill', null);
    });
  }, []);

  if (!settings || !checksLoaded || !greeksLoaded || prefill === 'pending') return null;

  const allRulesChecked = checks.every(Boolean);

  return (
    <Page
      title="Trade Cockpit"
      lede="Everything that happens before an entry. Nothing here is advice — it's the process that keeps one trade from becoming a bad day."
    >
      <Checklist checks={checks} onChange={setChecks} />

      <div className="cockpit-pair">
        <PositionSizer settings={settings} allRulesChecked={allRulesChecked} prefill={prefill} />
        <ContractTicket settings={settings} allRulesChecked={allRulesChecked} />
      </div>

      <h2 className="section-title">Options lab</h2>
      <div className="cockpit-pair">
        <GreeksLab value={greeks} onChange={setGreeks} />
        <div className="cockpit-stack">
          <VolatilityRead spot={Number(greeks.spot)} dte={Number(greeks.dte)} />
          <EarningsCalendar />
        </div>
      </div>

      <AccountKillers />
      <OptionsFuturesTable />
    </Page>
  );
}
