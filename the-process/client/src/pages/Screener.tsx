/**
 * Screener (spec §6.6) — the editable watchlist graded on live
 * fundamentals: five category scores, weighted composite, letter grades,
 * preset filters, and a full report card per stock.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '../components/Page';
import { ReportCard } from '../components/screener/ReportCard';
import { db, ensureWatchlist, DEFAULT_WATCHLIST } from '../lib/db';
import { gradeStock, letterGrade, PRESETS, TICKER_RE, type PresetName } from '../lib/grading';
import { scanSymbols, type ScanEntry, type ScanProgress } from '../lib/screenerData';
import { fmtCap, fmtNum, fmtPct } from '../lib/format';
import { explainDataOutage } from '../lib/api';
import '../components/screener/screener.css';

type SortCol =
  | 'symbol' | 'composite' | 'pe' | 'forwardPe' | 'revGrowthYoy' | 'epsGrowthYoy'
  | 'netMargin' | 'roe' | 'debtToEquity' | 'dividendYield' | 'marketCap';

export function Screener() {
  const [symbols, setSymbols] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [preset, setPreset] = useState<PresetName | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('composite');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [addInput, setAddInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScanEntry | null>(null);
  /** Why nothing loaded, when a scan comes back empty for a non-empty list. */
  const [outage, setOutage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    ensureWatchlist().then((syms) => {
      setSymbols(syms.sort());
    });
    return () => abortRef.current?.abort();
  }, []);

  // Kick off a scan whenever the symbol list exists (cache makes reruns cheap).
  useEffect(() => {
    if (!symbols) return;
    runScan(symbols, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);

  async function runScan(syms: string[], force: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setOutage(null);
    const results = await scanSymbols(
      syms,
      (p, partial) => {
        setProgress(p);
        setEntries([...partial]);
      },
      { force, signal: controller.signal },
    );
    if (controller.signal.aborted) return;
    if (syms.length > 0 && results.length === 0) setOutage(await explainDataOutage());
    setScanning(false);
    setProgress(null);
  }

  const graded = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        grades: gradeStock(e.fundamentals),
      })),
    [entries],
  );

  const shown = useMemo(() => {
    let rows = preset ? graded.filter((r) => PRESETS[preset].test(r.fundamentals)) : [...graded];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortCol === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      const va = sortCol === 'composite' ? a.grades.composite : a.fundamentals[sortCol];
      const vb = sortCol === 'composite' ? b.grades.composite : b.fundamentals[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
    return rows;
  }, [graded, preset, sortCol, sortDir]);

  function setSort(col: SortCol) {
    if (col === sortCol) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortCol(col);
      setSortDir(col === 'symbol' ? 'asc' : 'desc');
    }
  }

  async function addSymbol(e: React.FormEvent) {
    e.preventDefault();
    const sym = addInput.trim().toUpperCase();
    if (!TICKER_RE.test(sym)) {
      setAddError(`"${sym || ' '}" isn't a valid US ticker — a letter first, then letters/digits/periods/hyphens, 10 characters max.`);
      return;
    }
    if (symbols!.includes(sym)) {
      setAddError(`${sym} is already on the list.`);
      return;
    }
    setAddError(null);
    setAddInput('');
    await db.watchlist.add({ symbol: sym, addedAt: Date.now() });
    setSymbols([...symbols!, sym].sort());
  }

  async function removeSymbol(sym: string) {
    await db.watchlist.delete(sym);
    setSymbols(symbols!.filter((s) => s !== sym));
    setEntries((es) => es.filter((e) => e.symbol !== sym));
  }

  async function restoreDefaults() {
    if (!window.confirm('Reset the watchlist to the default 40 names?')) return;
    await db.watchlist.clear();
    await db.watchlist.bulkAdd(DEFAULT_WATCHLIST.map((symbol) => ({ symbol, addedAt: Date.now() })));
    setSymbols([...DEFAULT_WATCHLIST].sort());
  }

  if (!symbols) return null;

  const headers: Array<[SortCol, string]> = [
    ['symbol', 'Symbol'], ['composite', 'Grade'], ['pe', 'P/E'], ['forwardPe', 'Fwd P/E'],
    ['revGrowthYoy', 'Rev growth'], ['epsGrowthYoy', 'EPS growth'], ['netMargin', 'Net margin'],
    ['roe', 'ROE'], ['debtToEquity', 'D/E'], ['dividendYield', 'Div yield'], ['marketCap', 'Mkt cap'],
  ];
  const arrow = (col: SortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <Page
      title="Screener"
      lede="The watchlist, graded on live fundamentals. Grades screen businesses — they are not buy or sell advice, and say nothing about timing."
    >
      <div className="scr-toolbar">
        <div className="scr-presets" role="group" aria-label="Preset filters">
          <button className={`chip ${preset === null ? 'is-active' : ''}`} onClick={() => setPreset(null)}>
            All ({graded.length})
          </button>
          {(Object.keys(PRESETS) as PresetName[]).map((p) => (
            <button
              key={p}
              className={`chip ${preset === p ? 'is-active' : ''}`}
              onClick={() => setPreset(preset === p ? null : p)}
            >
              {PRESETS[p].label}
            </button>
          ))}
        </div>
        <form className="scr-add" onSubmit={addSymbol}>
          <label className="sr-only" htmlFor="scr-add-input">Add a symbol</label>
          <input
            id="scr-add-input"
            placeholder="Add symbol…"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            maxLength={10}
            style={{ textTransform: 'uppercase', width: '9em' }}
          />
          <button type="submit" className="btn">Add</button>
        </form>
        <div className="scr-actions">
          <button className="btn" onClick={() => runScan(symbols, true)} disabled={scanning}>
            Force re-scan all
          </button>
          <button className="btn" onClick={restoreDefaults}>Restore default list</button>
        </div>
      </div>
      {addError && <p className="tool-warning" role="alert">{addError}</p>}

      {progress && (
        <div className="scr-progress" role="status">
          <div className="scr-progress-track">
            <div
              className="scr-progress-fill"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <span className="num">
            {progress.pausedUntil
              ? `rate limit — pausing ~30s, then continuing with ${progress.current}`
              : `scanning ${progress.done}/${progress.total}${progress.current ? ` · ${progress.current}` : ''}`}
          </span>
        </div>
      )}

      <div className="table-scroll">
        <table className="scr-table">
          <thead>
            <tr>
              {headers.map(([col, label]) => (
                <th
                  key={col}
                  scope="col"
                  aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button className="th-sort" onClick={() => setSort(col)}>
                    {label}{arrow(col)}
                  </button>
                </th>
              ))}
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const f = row.fundamentals;
              const g = row.grades;
              return (
                <tr key={row.symbol} onClick={() => setDetail(row)} className="scr-row" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setDetail(row)}
                  aria-label={`Open report card for ${row.symbol}`}>
                  <td className="cell-sym">{row.symbol}</td>
                  <td>
                    <span className={`grade grade-${letterGrade(g.composite)}`}>
                      {letterGrade(g.composite)}
                    </span>
                  </td>
                  <td className="num">{fmtNum(f.pe, 1)}</td>
                  <td className="num">{fmtNum(f.forwardPe, 1)}</td>
                  <td className={`num ${cls(f.revGrowthYoy)}`}>{fmtPct(f.revGrowthYoy)}</td>
                  <td className={`num ${cls(f.epsGrowthYoy)}`}>{fmtPct(f.epsGrowthYoy)}</td>
                  <td className={`num ${cls(f.netMargin)}`}>{fmtPct(f.netMargin)}</td>
                  <td className="num">{fmtPct(f.roe)}</td>
                  <td className="num">{fmtNum(f.debtToEquity)}</td>
                  <td className="num">{fmtPct(f.dividendYield)}</td>
                  <td className="num">{fmtCap(f.marketCap)}</td>
                  <td>
                    <button
                      className="row-btn is-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSymbol(row.symbol);
                      }}
                      aria-label={`Remove ${row.symbol} from watchlist`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && !scanning && (
          symbols.length === 0 ? (
            <p className="log-empty">Watchlist is empty — add a symbol above.</p>
          ) : graded.length === 0 ? (
            <div className="log-empty">
              <p>Couldn't load fundamentals for any of the {symbols.length} symbols.</p>
              {outage && <p className="field-hint">{outage}</p>}
              <button className="btn" onClick={() => runScan(symbols, false)}>Try again</button>
            </div>
          ) : (
            <p className="log-empty">No watchlist stock passes this screen right now.</p>
          )
        )}
      </div>
      <p className="field-hint">
        Fundamentals cache for ~24 hours. Click any row for the full report card. {entries.length} of{' '}
        {symbols.length} graded
        {!scanning && entries.length > 0 && entries.length < symbols.length
          ? ` — ${symbols.length - entries.length} couldn't be loaded this time.`
          : '.'}
      </p>

      {detail && <ReportCard entry={detail} onClose={() => setDetail(null)} />}
    </Page>
  );
}

function cls(v: number | null): string {
  if (v == null) return '';
  return v > 0 ? 'gain' : v < 0 ? 'loss' : '';
}
