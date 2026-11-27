/**
 * Screener report card (spec §6.6): the five category grades, ~30
 * underlying metrics with rule-of-thumb color cues, the 52-week range,
 * performance vs the S&P 500, and a short written verdict.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { gradeStock, letterGrade, isUnprofitable, type Fundamentals } from '../../lib/grading';
import type { ScanEntry } from '../../lib/screenerData';
import { fmtCap, fmtNum, fmtPct } from '../../lib/format';

type Cue = 'good' | 'warn' | 'bad' | '';

interface MetricRow {
  label: string;
  value: string;
  cue: Cue;
}

function metricRows(f: Fundamentals): { group: string; rows: MetricRow[] }[] {
  const cueLow = (v: number | null, good: number, bad: number): Cue =>
    v == null ? '' : v <= good ? 'good' : v >= bad ? 'bad' : 'warn';
  const cueHigh = (v: number | null, good: number, bad: number): Cue =>
    v == null ? '' : v >= good ? 'good' : v <= bad ? 'bad' : 'warn';

  return [
    {
      group: 'Valuation',
      rows: [
        { label: 'P/E (trailing)', value: fmtNum(f.pe, 1), cue: cueLow(f.pe, 18, 35) },
        { label: 'P/E (forward)', value: fmtNum(f.forwardPe, 1), cue: cueLow(f.forwardPe, 18, 35) },
        { label: 'PEG', value: fmtNum(f.peg), cue: cueLow(f.peg, 1.5, 3) },
        { label: 'Price / sales', value: fmtNum(f.ps, 1), cue: cueLow(f.ps, 2, 10) },
        { label: 'EV / EBITDA', value: fmtNum(f.evEbitda, 1), cue: cueLow(f.evEbitda, 10, 25) },
        { label: 'Price / free cash flow', value: fmtNum(f.pfcf, 1), cue: cueLow(f.pfcf, 15, 40) },
      ],
    },
    {
      group: 'Growth',
      rows: [
        { label: 'Revenue growth (YoY)', value: fmtPct(f.revGrowthYoy), cue: cueHigh(f.revGrowthYoy, 8, 0) },
        { label: 'EPS growth (YoY)', value: fmtPct(f.epsGrowthYoy), cue: cueHigh(f.epsGrowthYoy, 8, 0) },
        { label: 'Revenue growth (5y)', value: fmtPct(f.revGrowth5y), cue: cueHigh(f.revGrowth5y, 7, 0) },
        { label: 'EPS growth (5y)', value: fmtPct(f.epsGrowth5y), cue: cueHigh(f.epsGrowth5y, 7, 0) },
      ],
    },
    {
      group: 'Profitability',
      rows: [
        { label: 'Gross margin', value: fmtPct(f.grossMargin), cue: cueHigh(f.grossMargin, 40, 20) },
        { label: 'Operating margin', value: fmtPct(f.operatingMargin), cue: cueHigh(f.operatingMargin, 15, 0) },
        { label: 'Net margin', value: fmtPct(f.netMargin), cue: cueHigh(f.netMargin, 15, 0) },
        { label: 'Net margin (5y avg)', value: fmtPct(f.netMargin5y), cue: cueHigh(f.netMargin5y, 15, 0) },
        { label: 'Return on equity', value: fmtPct(f.roe), cue: cueHigh(f.roe, 18, 5) },
        { label: 'Return on assets', value: fmtPct(f.roa), cue: cueHigh(f.roa, 8, 0) },
        { label: 'Return on investment', value: fmtPct(f.roi), cue: cueHigh(f.roi, 10, 0) },
        { label: 'EPS (trailing)', value: fmtNum(f.eps), cue: f.eps == null ? '' : f.eps > 0 ? 'good' : 'bad' },
      ],
    },
    {
      group: 'Financial health',
      rows: [
        { label: 'Current ratio', value: fmtNum(f.currentRatio), cue: cueHigh(f.currentRatio, 1.5, 0.8) },
        { label: 'Quick ratio', value: fmtNum(f.quickRatio), cue: cueHigh(f.quickRatio, 1, 0.5) },
        { label: 'Debt / equity', value: fmtNum(f.debtToEquity), cue: cueLow(f.debtToEquity, 0.8, 2.5) },
        { label: 'Interest coverage', value: fmtNum(f.interestCoverage, 1), cue: cueHigh(f.interestCoverage, 8, 1) },
      ],
    },
    {
      group: 'Dividend',
      rows: [
        { label: 'Dividend yield', value: fmtPct(f.dividendYield), cue: '' },
        { label: 'Payout ratio', value: fmtPct(f.payoutRatio), cue: cueLow(f.payoutRatio, 60, 90) },
        { label: 'Dividend growth (5y)', value: fmtPct(f.dividendGrowth5y), cue: cueHigh(f.dividendGrowth5y, 4, 0) },
      ],
    },
    {
      group: 'Market',
      rows: [
        { label: 'Market cap', value: fmtCap(f.marketCap), cue: '' },
        { label: 'Beta', value: fmtNum(f.beta), cue: cueLow(f.beta, 1.2, 1.8) },
        { label: '3-month volatility', value: fmtPct(f.vol3m, 0), cue: cueLow(f.vol3m, 30, 45) },
        { label: '5-day return', value: fmtPct(f.ret5d, 1, true), cue: '' },
        { label: '3-month return', value: fmtPct(f.ret13w, 1, true), cue: cueHigh(f.ret13w, 0, -15) },
        { label: '1-year return', value: fmtPct(f.ret52w, 1, true), cue: cueHigh(f.ret52w, 0, -20) },
      ],
    },
  ];
}

/** Short written verdict from the category grades (§6.6). */
function writtenVerdict(symbol: string, f: Fundamentals): string {
  const g = gradeStock(f);
  if (g.composite == null) {
    return `${symbol} doesn't grade — it looks like a fund or ETF, with no company-level fundamentals. The Stock Analyzer's technical read still applies.`;
  }
  const comp = letterGrade(g.composite);
  const parts: string[] = [];
  if (g.valuation != null) parts.push(`${g.valuation >= 70 ? 'attractively priced' : g.valuation >= 55 ? 'fairly priced' : 'expensive'}`);
  if (g.growth != null) parts.push(`${g.growth >= 70 ? 'growing well' : g.growth >= 55 ? 'growing modestly' : 'barely growing'}`);
  if (g.profitability != null) parts.push(`${g.profitability >= 70 ? 'very profitable' : g.profitability >= 55 ? 'adequately profitable' : isUnprofitable(f) ? 'not profitable' : 'thin on profit'}`);
  if (g.health != null) parts.push(`${g.health >= 70 ? 'financially sturdy' : g.health >= 55 ? 'financially okay' : 'carrying balance-sheet risk'}`);
  const summary = parts.join(', ');
  const tail =
    comp === 'A' ? 'a high-quality business by these numbers — which says nothing about whether today is a good day to buy it.'
    : comp === 'B' ? 'a solid business with a wart or two — read the category grades to see which.'
    : comp === 'C' ? 'a mixed picture; the grades disagree with each other. Know which category matters for your thesis.'
    : 'weak by these numbers. If you trade it anyway, you are trading the chart, not the business.';
  return `${symbol} grades ${comp}: ${summary}. Overall, ${tail}`;
}

export function ReportCard({ entry, onClose }: { entry: ScanEntry; onClose: () => void }) {
  const navigate = useNavigate();
  const f = entry.fundamentals;
  const g = gradeStock(f);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cats: Array<[string, number | null]> = [
    ['Valuation', g.valuation],
    ['Growth', g.growth],
    ['Profitability', g.profitability],
    ['Financial health', g.health],
    ['Dividend', g.dividend],
  ];

  return (
    <div className="rc-backdrop" onClick={onClose}>
      <div
        className="rc-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.symbol} report card`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rc-head">
          <div>
            <h2 className="rc-title">
              {entry.symbol}
              <span className={`grade grade-${letterGrade(g.composite)} rc-grade`}>
                {letterGrade(g.composite)}
              </span>
            </h2>
            <p className="card-sub">
              Graded {new Date(entry.fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} ·
              a screening grade, not advice
            </p>
          </div>
          <button ref={closeRef} className="menu-button" onClick={onClose}>
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Close report card</span>
          </button>
        </div>

        <div className="rc-cats">
          {cats.map(([label, score]) => (
            <div className="rc-cat" key={label}>
              <span className={`grade grade-${letterGrade(score)}`}>{letterGrade(score)}</span>
              <span className="rc-cat-label">{label}</span>
              <span className="rc-cat-score num">{score == null ? '—' : Math.round(score)}</span>
            </div>
          ))}
        </div>

        <p className="rc-verdict">{writtenVerdict(entry.symbol, f)}</p>

        {f.week52High != null && f.week52Low != null && (
          <div className="rc-range">
            <span className="num">{fmtNum(f.week52Low)}</span>
            <div className="rc-range-track" aria-hidden="true" />
            <span className="num">{fmtNum(f.week52High)}</span>
            <span className="rc-range-label">52-week range</span>
          </div>
        )}

        {(f.relSp13w != null || f.relSp52w != null) && (
          <p className="rc-relsp">
            Versus the S&P 500:{' '}
            {f.relSp13w != null && (
              <span className={`num ${f.relSp13w >= 0 ? 'gain' : 'loss'}`}>
                {fmtPct(f.relSp13w, 1, true)} over 3 months
              </span>
            )}
            {f.relSp13w != null && f.relSp52w != null && ' · '}
            {f.relSp52w != null && (
              <span className={`num ${f.relSp52w >= 0 ? 'gain' : 'loss'}`}>
                {fmtPct(f.relSp52w, 1, true)} over a year
              </span>
            )}
          </p>
        )}

        {metricRows(f).map(({ group, rows }) => (
          <section key={group} className="rc-group">
            <h3>{group}</h3>
            <dl className="rc-metrics">
              {rows.map((r) => (
                <div className={`rc-metric cue-${r.cue}`} key={r.label}>
                  <dt>{r.label}</dt>
                  <dd className="num">{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <div className="rc-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/analyzer?symbol=${entry.symbol}`)}
          >
            Open in the Stock Analyzer →
          </button>
        </div>
      </div>
    </div>
  );
}
