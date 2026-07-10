/**
 * Non-chart §6.5 panels: plan adherence, per-symbol / per-setup
 * performance tables, the auto-written insights, and the exports card.
 */
import { useRef, useState } from 'react';
import type { PlanAdherence, GroupRow, Insight } from '../../lib/analytics';
import {
  buildBackup,
  isValidBackup,
  restoreBackup,
  snapshotToDisk,
  markBackupDone,
} from '../../lib/backup';
import { downloadFile } from '../../lib/csv';
import { fmtR, fmtPct, todayIso } from '../../lib/format';

export function PlanAdherencePanel({ plan }: { plan: PlanAdherence }) {
  return (
    <section className="card" aria-labelledby="plan-title">
      <h2 id="plan-title">Plan adherence</h2>
      <p className="card-sub">
        The measured value of following your own rules — from the "followed my plan?" tag.
      </p>
      {!plan.meaningful ? (
        <p className="chart-empty">
          Needs a handful of honestly-tagged trades on both sides first (at least 3 followed, 3
          broken, 5 tagged overall). Tagged so far: {plan.tagged}.
        </p>
      ) : (
        <div className="plan-grid num">
          <div className="out">
            <dt>Adherence</dt>
            <dd className={plan.adherencePct! >= 75 ? 'gain' : 'loss'}>
              {fmtPct(plan.adherencePct, 0)}
            </dd>
          </div>
          <div className="out">
            <dt>Avg R · followed ({plan.followed})</dt>
            <dd className={plan.avgRFollowed! >= 0 ? 'gain' : 'loss'}>{fmtR(plan.avgRFollowed)}</dd>
          </div>
          <div className="out">
            <dt>Avg R · broke plan ({plan.broke})</dt>
            <dd className={plan.avgRBroke! >= 0 ? 'gain' : 'loss'}>{fmtR(plan.avgRBroke)}</dd>
          </div>
        </div>
      )}
    </section>
  );
}

export function GroupTable({
  title,
  sub,
  rows,
  keyHeader,
}: {
  title: string;
  sub: string;
  rows: GroupRow[];
  keyHeader: string;
}) {
  return (
    <section className="card" aria-label={title}>
      <h2>{title}</h2>
      <p className="card-sub">{sub}</p>
      {rows.length === 0 ? (
        <p className="chart-empty">Nothing tagged yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="ref-table group-table">
            <thead>
              <tr>
                <th scope="col">{keyHeader}</th>
                <th scope="col" className="num">Trades</th>
                <th scope="col" className="num">Win rate</th>
                <th scope="col" className="num">Net R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.key}</th>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.winRate == null ? '—' : fmtPct(r.winRate, 0)}</td>
                  <td className={`num ${r.netR > 0 ? 'gain' : r.netR < 0 ? 'loss' : ''}`}>
                    {fmtR(r.netR, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <section className="card" aria-labelledby="insights-title">
      <h2 id="insights-title">What the numbers are saying</h2>
      <p className="card-sub">
        Auto-written from your log. Each line only appears once there's enough data behind it to
        mean something.
      </p>
      {insights.length === 0 ? (
        <p className="chart-empty">Log a few trades and the observations start here.</p>
      ) : (
        <ul className="insights">
          {insights.map((ins, i) => (
            <li key={i} className={`insight is-${ins.tone}`}>
              {ins.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ExportsCard({
  onExportCsv,
  tradeCount,
}: {
  onExportCsv: () => void;
  tradeCount: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function say(msg: string) {
    setError(null);
    setNote(msg);
    setTimeout(() => setNote(null), 6000);
  }
  function fail(msg: string) {
    setNote(null);
    setError(msg);
  }

  async function downloadBackup() {
    const backup = await buildBackup();
    downloadFile(
      `the-process-backup-${todayIso()}.json`,
      JSON.stringify(backup, null, 1),
      'application/json',
    );
    await markBackupDone();
    say('Backup downloaded — keep it somewhere safe.');
  }

  async function snapshot() {
    try {
      const file = await snapshotToDisk();
      await markBackupDone();
      say(`Snapshot written to backups/${file} in the project folder.`);
    } catch (e) {
      fail(`Could not write the snapshot: ${(e as Error).message}`);
    }
  }

  async function onRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!isValidBackup(json)) {
        fail("That file doesn't look like a Process backup.");
        return;
      }
      const trades = json.data.trades.length;
      if (
        !window.confirm(
          `Replace everything currently in the app with this backup (${trades} trades, exported ${json.exportedAt.slice(0, 10)})? This cannot be undone.`,
        )
      )
        return;
      await restoreBackup(json);
      say('Backup restored.');
    } catch {
      fail("Couldn't read that file as JSON.");
    }
  }

  return (
    <section className="card" aria-labelledby="exports-title">
      <h2 id="exports-title">Exports & backup</h2>
      <p className="card-sub">
        Your data lives only in this browser — these are the escape hatches. Back up regularly.
      </p>
      <div className="exports-actions">
        <button className="btn" onClick={onExportCsv} disabled={tradeCount === 0}>
          Export CSV (trade log)
        </button>
        <button className="btn" onClick={downloadBackup}>
          Download full backup (JSON)
        </button>
        <button className="btn" onClick={snapshot}>
          Snapshot to disk
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a backup file to restore"
          onChange={onRestoreFile}
        />
      </div>
      {note && <p className="save-note" role="status">{note}</p>}
      {error && <p className="tool-warning" role="alert">{error}</p>}
    </section>
  );
}
