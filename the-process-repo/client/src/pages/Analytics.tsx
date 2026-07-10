/**
 * Analytics Dashboard (spec §6.5) — reads every Trade Log row
 * automatically; nothing is typed on this page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../components/Page';
import {
  EquityChart,
  RHistogram,
  RollingWinRateChart,
  NetRBars,
} from '../components/analytics/Charts';
import {
  PlanAdherencePanel,
  GroupTable,
  InsightsPanel,
  ExportsCard,
} from '../components/analytics/Panels';
import { db, getSettings, type AccountSettings } from '../lib/db';
import {
  resultPoints,
  rHistogram,
  rollingWinRate,
  netRByWeekday,
  netRByMonth,
  planAdherence,
  groupPerformance,
  generateInsights,
} from '../lib/analytics';
import { coreStats, equityCurve, streaks } from '../lib/stats';
import { buildCsv, downloadFile } from '../lib/csv';
import { fmtR, fmtPct, todayIso } from '../lib/format';
import '../components/analytics/analytics.css';

export function Analytics() {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const trades = useLiveQuery(() => db.trades.toArray(), []);

  const model = useMemo(() => {
    if (!trades || !settings) return null;
    const points = resultPoints(trades);
    const rs = points.map((p) => p.r);
    const stats = coreStats(rs);
    return {
      points,
      rs,
      stats,
      streaks: streaks(rs),
      equity: equityCurve(rs),
      histogram: rHistogram(rs),
      rolling: rollingWinRate(rs),
      weekday: netRByWeekday(points),
      month: netRByMonth(points),
      plan: planAdherence(points),
      bySymbol: groupPerformance(points, 'symbol'),
      byTag: groupPerformance(points, 'setupTag'),
      insights: generateInsights({
        points,
        stats,
        maxTradesPerDay: settings.maxTradesPerDay,
        riskPct: settings.riskPct,
      }),
    };
  }, [trades, settings]);

  if (!model) return null;
  const { stats } = model;

  function exportCsv() {
    const rows = model!.points.map((p) => [
      p.date,
      p.symbol,
      Math.round(p.r * 100) / 100,
      p.followedPlan,
      p.setupTag,
    ]);
    downloadFile(
      `the-process-results-${todayIso()}.csv`,
      buildCsv(['Date', 'Symbol', 'R', 'Followed plan', 'Setup tag'], rows),
    );
  }

  if (stats.total === 0) {
    return (
      <Page
        title="Analytics"
        lede="The honest mirror. Nothing is typed here — every chart and every insight is computed from the Trade Log."
      >
        <div className="coming-soon">
          <p>
            No results yet. Once trades with outcomes land in the Trade Log — from the Guardrail,
            the sizing tools, or manual entry — this page writes itself.
          </p>
        </div>
        <ExportsCard onExportCsv={exportCsv} tradeCount={0} />
      </Page>
    );
  }

  const headline = [
    { label: 'Trades', value: String(stats.total), cls: '' },
    {
      label: 'Net R',
      value: fmtR(stats.netR, 1),
      cls: stats.netR > 0 ? 'gain' : stats.netR < 0 ? 'loss' : '',
    },
    {
      label: 'Win rate',
      value: stats.winRate === undefined ? '—' : fmtPct(stats.winRate * 100, 0),
      cls: '',
    },
    {
      label: 'Expectancy',
      value: stats.expectancy === undefined ? '—' : `${fmtR(stats.expectancy)}/trade`,
      cls: (stats.expectancy ?? 0) >= 0 ? 'gain' : 'loss',
    },
    {
      label: 'Profit factor',
      value:
        stats.profitFactor === undefined
          ? '—'
          : isFinite(stats.profitFactor)
            ? stats.profitFactor.toFixed(2)
            : '∞',
      cls: '',
    },
    {
      label: 'Max drawdown',
      value: `−${model.equity.maxDrawdown.toFixed(1)}R`,
      cls: 'loss',
    },
    {
      label: 'Longest streaks',
      value: `${model.streaks.longestWin}W · ${model.streaks.longestLoss}L`,
      cls: '',
    },
  ];

  return (
    <Page
      title="Analytics"
      lede="The honest mirror. Nothing is typed here — every chart and every insight is computed from the Trade Log."
    >
      <section className="card summary-strip an-headline" aria-label="Headline stats">
        {headline.map((h) => (
          <div className="sum-cell" key={h.label}>
            <span className="sum-label">{h.label}</span>
            <span className={`sum-value num ${h.cls}`}>{h.value}</span>
          </div>
        ))}
      </section>

      <InsightsPanel insights={model.insights} />

      <div className="an-grid">
        <EquityChart points={model.equity.points} maxDrawdown={model.equity.maxDrawdown} />
        <RHistogram data={model.histogram} />
        <RollingWinRateChart points={model.rolling} total={stats.total} />
        <NetRBars
          title="Net R by weekday"
          sub="Where the week actually pays you — and where it doesn't."
          data={model.weekday}
          labelKey="day"
        />
        <NetRBars
          title="Net R by month"
          sub="The last six calendar months."
          data={model.month}
          labelKey="month"
        />
        <PlanAdherencePanel plan={model.plan} />
      </div>

      <div className="an-grid">
        <GroupTable
          title="Per-symbol performance"
          sub="Grouped from the log, sorted by net R."
          rows={model.bySymbol}
          keyHeader="Symbol"
        />
        <GroupTable
          title="Per-setup performance"
          sub="Which setups actually make money — from the setup tags."
          rows={model.byTag}
          keyHeader="Setup"
        />
      </div>

      <ExportsCard onExportCsv={exportCsv} tradeCount={stats.total} />
    </Page>
  );
}
