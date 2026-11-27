/**
 * Stock Analyzer (spec §6.7) — one symbol, one deep read: fundamentals,
 * a charted technical read with auto-detected setups, analyst consensus,
 * a risk grade, bull vs bear case, and one verdict on a gauge.
 * A screening aid — never a recommendation.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page } from '../components/Page';
import { VerdictGauge } from '../components/analyzer/VerdictGauge';
import { TechnicalChart } from '../components/analyzer/TechnicalChart';
import { apiGet, explainDataOutage, type Envelope, type DataSource } from '../lib/api';
import { extractFundamentals, type Fundamentals } from '../lib/grading';
import {
  applyFundamentalSignals,
  applyAnalystSignal,
  applyMomentumSignals,
  applyRangeSignals,
  applyEarningsNote,
  applyTechnicalBias,
  detectSetups,
  technicalBias,
  riskGrade,
  verdictFor,
  type Bar,
  type DetectedSetup,
  type Recommendation,
  type ScoreState,
} from '../lib/signals';
import { kvSet } from '../lib/kv';
import { fmtCap, fmtMoney, fmtNum, fmtPct } from '../lib/format';
import { TICKER_RE } from '../lib/grading';
import '../components/analyzer/analyzer.css';

interface Analysis {
  symbol: string;
  name: string;
  meta: string;
  price: number;
  dayChangePct: number | null;
  fundamentals: Fundamentals;
  isFund: boolean;
  state: ScoreState;
  verdict: ReturnType<typeof verdictFor>;
  risk: ReturnType<typeof riskGrade>;
  rec: Recommendation | null;
  recTotal: number;
  earningsDate: string | null;
  earningsSoon: boolean;
  bars: Bar[] | null;
  setups: DetectedSetup[];
  bias: 'bullish' | 'bearish' | 'neutral';
  ret1m: number | null;
  source: DataSource;
}

export function Analyzer() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(params.get('symbol') ?? '');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  /** Expected 'no data available' state — shown calmly, not as an error. */
  const [notice, setNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [sent, setSent] = useState(false);

  const analyze = useCallback(async (raw: string) => {
    const symbol = raw.trim().toUpperCase();
    if (!TICKER_RE.test(symbol)) {
      setWarning('Type a stock symbol first — Apple is AAPL, Tesla is TSLA, Amazon is AMZN.');
      return;
    }
    setWarning(null);
    setNotice(null);
    setBusy(true);
    setSent(false);
    try {
      const [quote, profile, metrics, recs, earnings, barsRes] = await Promise.all([
        apiGet<Envelope<{ c: number; dp: number | null }>>(`/quote/${symbol}`),
        apiGet<Envelope<Record<string, unknown>>>(`/profile/${symbol}`).catch(() => null),
        apiGet<Envelope<{ metric?: Record<string, unknown> }>>(`/fundamentals/${symbol}`).catch(() => null),
        apiGet<Envelope<Recommendation[]>>(`/recommendations/${symbol}`).catch(() => null),
        apiGet<Envelope<{ earningsCalendar?: Array<{ date: string }> }>>(`/earnings/${symbol}`).catch(() => null),
        apiGet<Envelope<{ bars: Bar[] }>>(`/bars/${symbol}`).catch(() => null),
      ]);

      const price = quote.data.c;
      if (!price || price <= 0) {
        setWarning(`"${symbol}" returned nothing — it doesn't look like a real US symbol. Check the spelling (Apple = AAPL, Google = GOOGL).`);
        setBusy(false);
        return;
      }

      const f = extractFundamentals(metrics?.data.metric ?? {});
      const p = (profile?.data ?? {}) as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name : '';
      // ETF/fund detection (§6.7): no company-level fundamentals.
      const isFund = !name && f.pe == null && f.eps == null;

      const state: ScoreState = { score: 0, bull: [], bear: [] };
      if (!isFund) applyFundamentalSignals(state, f);

      const rec = recs?.data?.[0] ?? null;
      const recTotal = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
      applyAnalystSignal(state, rec);
      applyMomentumSignals(state, f);
      applyRangeSignals(state, price, f);

      const earningsDate = earnings?.data.earningsCalendar?.[0]?.date ?? null;
      const earningsSoon = applyEarningsNote(state, earningsDate);

      const bars = barsRes?.data.bars ?? null;
      const setups = bars ? detectSetups(bars) : [];
      applyTechnicalBias(state, setups);

      let ret1m: number | null = null;
      if (bars && bars.length > 22) {
        const a = bars[bars.length - 22].c;
        ret1m = ((bars[bars.length - 1].c - a) / a) * 100;
      }

      state.bull.sort((a, b) => b.pts - a.pts);
      state.bear.sort((a, b) => b.pts - a.pts);

      setAnalysis({
        symbol,
        name: name || symbol,
        meta: [
          isFund ? 'ETF / fund' : (p.finnhubIndustry as string) || null,
          f.marketCap ? `${fmtCap(f.marketCap)} market value` : null,
          typeof p.exchange === 'string' ? p.exchange.split(' ')[0] : null,
        ]
          .filter(Boolean)
          .join(' · '),
        price,
        dayChangePct: quote.data.dp,
        fundamentals: f,
        isFund,
        state,
        verdict: verdictFor(state.score),
        risk: riskGrade(f, price, earningsSoon),
        rec,
        recTotal,
        earningsDate,
        earningsSoon,
        bars,
        setups,
        bias: technicalBias(setups),
        ret1m,
        source: quote.source,
      });
      setParams({ symbol }, { replace: true });
    } catch {
      setAnalysis(null);
      setNotice(await explainDataOutage());
    } finally {
      setBusy(false);
    }
  }, [setParams]);

  // Auto-analyze when arriving with ?symbol= (e.g. from a report card).
  useEffect(() => {
    const sym = params.get('symbol');
    if (sym && !analysis) analyze(sym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendToSizer() {
    if (!analysis) return;
    const entry = analysis.price;
    await kvSet('cockpit.sizerPrefill', {
      symbol: analysis.symbol,
      entry: round2(entry),
      stop: round2(entry * 0.95), // stop ~5% away (§6.7)
      target: round2(entry * 1.1), // 2:1 reward:risk on that stop
    });
    setSent(true);
    setTimeout(() => navigate('/cockpit'), 600);
  }

  const a = analysis;

  return (
    <Page
      title="Stock Analyzer"
      lede="One symbol, one deep read. It screens — it never recommends: a 'leans long' verdict still requires the full checklist and standard risk sizing."
    >
      <form
        className="an-search"
        onSubmit={(e) => {
          e.preventDefault();
          analyze(input);
        }}
      >
        <label className="sr-only" htmlFor="an-input">Stock symbol</label>
        <input
          id="an-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="AAPL"
          maxLength={10}
          style={{ textTransform: 'uppercase' }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Reading…' : 'Analyze'}
        </button>
        {(['AAPL', 'NVDA', 'TSLA', 'SPY'] as const).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => { setInput(s); analyze(s); }}>
            {s}
          </button>
        ))}
      </form>
      {warning && <p className="tool-warning" role="alert">{warning}</p>}
      {notice && (
        <p className="tool-hint" role="status">
          Can't read {input.trim().toUpperCase() || 'that symbol'} right now. {notice}
        </p>
      )}

      {a && (
        <>
          <section className="card an-header">
            <div>
              <h2 className="an-name">{a.name}</h2>
              <p className="card-sub">{a.meta}</p>
              {a.source !== 'live' && a.source !== 'cache' && (
                <p className="an-stale">showing last-known data — source unreachable</p>
              )}
            </div>
            <div className="an-price num">
              {fmtMoney(a.price)}
              {a.dayChangePct != null && (
                <span className={a.dayChangePct >= 0 ? 'gain' : 'loss'}>
                  {' '}{fmtPct(a.dayChangePct, 2, true)} today
                </span>
              )}
            </div>
            <VerdictGauge gauge={a.verdict.gauge} label={a.verdict.label} />
          </section>

          {a.earningsSoon && (
            <p className="an-earnings" role="alert">
              Earnings {a.earningsDate} — inside 3 weeks. Checklist rule R-07 applies: know this
              date before any options trade; IV crush is real.
            </p>
          )}

          <p className="an-verdict-detail">{a.verdict.detail}</p>

          <div className="an-grid2">
            <section className="card" aria-labelledby="bull-title">
              <h2 id="bull-title" className="an-case-title gain">Bull case</h2>
              {a.state.bull.length === 0 ? (
                <p className="chart-empty">Not much — the data gives this stock very few green flags right now.</p>
              ) : (
                <ul className="an-case">
                  {a.state.bull.map((s, i) => (
                    <li key={i}><span className="an-pts num">+{s.pts}</span>{s.text}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="bear-title">
              <h2 id="bear-title" className="an-case-title loss">Bear case</h2>
              {a.state.bear.length === 0 ? (
                <p className="chart-empty">Surprisingly little — no major red flags in the data. Stay humble anyway.</p>
              ) : (
                <ul className="an-case">
                  {a.state.bear.map((s, i) => (
                    <li key={i}><span className="an-pts num">−{s.pts || '·'}</span>{s.text}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="an-grid2">
            <section className="card" aria-labelledby="risk-title">
              <h2 id="risk-title">
                Risk grade: <span className={`an-risk an-risk-${a.risk.label.replace(' ', '-')}`}>{a.risk.label}</span>
              </h2>
              <p className="card-sub">How volatile or fragile the position is — independent of direction.</p>
              {a.risk.reasons.length === 0 ? (
                <p className="chart-empty">No specific risk flags — an unusually quiet profile.</p>
              ) : (
                <ul className="an-reasons">
                  {a.risk.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="cons-title">
              <h2 id="cons-title">Analyst consensus</h2>
              {a.rec && a.recTotal >= 5 ? (
                <>
                  <p className="card-sub">{a.recTotal} analysts covering it.</p>
                  <ConsensusBar rec={a.rec} total={a.recTotal} />
                </>
              ) : (
                <p className="chart-empty">
                  Fewer than 5 analysts cover this — not enough opinions to lean on.
                </p>
              )}
            </section>
          </div>

          <section className="card" aria-labelledby="fund-title">
            <h2 id="fund-title">Fundamental read</h2>
            {a.isFund ? (
              <p className="chart-empty">
                Company fundamentals don't apply to a fund/ETF — it's a basket, not a business.
                The technical read below still works normally.
              </p>
            ) : (
              <FundamentalTable f={a.fundamentals} />
            )}
          </section>

          <section className="card" aria-labelledby="tech-title">
            <div className="an-tech-head">
              <h2 id="tech-title">Technical read</h2>
              <span className={`an-bias an-bias-${a.bias}`}>bias: {a.bias}</span>
            </div>
            <MomentumChips f={a.fundamentals} ret1m={a.ret1m} />
            <RangeIndicator f={a.fundamentals} price={a.price} />
            {a.bars ? (
              <TechnicalChart bars={a.bars} setups={a.setups} />
            ) : (
              <p className="chart-empty">
                Price history unavailable right now — the chart needs a connection to the daily-bars source.
              </p>
            )}
          </section>

          <section className="card an-handoff">
            <div>
              <h2>Take it to the Position Sizer</h2>
              <p className="card-sub">
                Prefills entry at {fmtMoney(a.price)}, a stop ~5% below, and a 2:1 target — adjust
                to your own plan. The checklist still applies in full.
              </p>
            </div>
            <button className="btn btn-primary" onClick={sendToSizer}>
              {sent ? 'Sent — opening the Cockpit…' : 'Send to Position Sizer →'}
            </button>
          </section>
        </>
      )}
    </Page>
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function ConsensusBar({ rec, total }: { rec: Recommendation; total: number }) {
  const parts: Array<[string, number, string]> = [
    ['strong buy', rec.strongBuy, 'var(--gain)'],
    ['buy', rec.buy, 'rgba(76,195,138,0.55)'],
    ['hold', rec.hold, 'var(--caution)'],
    ['sell', rec.sell, 'rgba(229,83,75,0.55)'],
    ['strong sell', rec.strongSell, 'var(--loss)'],
  ];
  return (
    <div>
      <div className="cons-bar" role="img" aria-label={parts.map(([l, n]) => `${n} ${l}`).join(', ')}>
        {parts.map(([label, n, color]) =>
          n > 0 ? (
            <div key={label} className="cons-seg" style={{ width: `${(n / total) * 100}%`, background: color }} />
          ) : null,
        )}
      </div>
      <div className="cons-legend">
        {parts.map(([label, n]) => (
          <span key={label}>
            <strong className="num">{n}</strong> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FundamentalTable({ f }: { f: Fundamentals }) {
  const rows: Array<[string, string, 'good' | 'warn' | 'bad' | '']> = [
    ['P/E', fmtNum(f.pe, 1), f.pe == null ? '' : f.pe <= 18 && f.pe > 0 ? 'good' : f.pe > 35 || f.pe <= 0 ? 'bad' : 'warn'],
    ['EPS', fmtNum(f.eps), f.eps == null ? '' : f.eps > 0 ? 'good' : 'bad'],
    ['Revenue growth', fmtPct(f.revGrowthYoy), f.revGrowthYoy == null ? '' : f.revGrowthYoy > 15 ? 'good' : f.revGrowthYoy < 0 ? 'bad' : 'warn'],
    ['Gross margin', fmtPct(f.grossMargin), f.grossMargin == null ? '' : f.grossMargin > 40 ? 'good' : f.grossMargin < 20 ? 'bad' : 'warn'],
    ['Net margin', fmtPct(f.netMargin), f.netMargin == null ? '' : f.netMargin > 15 ? 'good' : f.netMargin < 0 ? 'bad' : 'warn'],
    ['Return on equity', fmtPct(f.roe), f.roe == null ? '' : f.roe > 15 ? 'good' : f.roe < 0 ? 'bad' : 'warn'],
    ['Debt / equity', fmtNum(f.debtToEquity), f.debtToEquity == null ? '' : f.debtToEquity < 0.5 ? 'good' : f.debtToEquity > 2 ? 'bad' : 'warn'],
    ['Dividend yield', fmtPct(f.dividendYield), f.dividendYield == null ? '' : f.dividendYield > 2 ? 'good' : ''],
    ['Price / sales', fmtNum(f.ps, 1), f.ps == null ? '' : f.ps <= 2 ? 'good' : f.ps > 10 ? 'bad' : 'warn'],
    ['Market value', fmtCap(f.marketCap), ''],
  ];
  return (
    <dl className="rc-metrics an-fund">
      {rows.map(([label, value, cue]) => (
        <div className={`rc-metric cue-${cue}`} key={label}>
          <dt>{label}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MomentumChips({ f, ret1m }: { f: Fundamentals; ret1m: number | null }) {
  const chips: Array<[string, number | null]> = [
    ['5 day', f.ret5d],
    ['1 month', ret1m],
    ['3 month', f.ret13w],
    ['6 month', f.ret26w],
    ['1 year', f.ret52w],
  ];
  return (
    <div className="mom-chips" aria-label="Momentum">
      {chips.map(([label, v]) => (
        <span key={label} className={`mom-chip num ${v == null ? '' : v >= 0 ? 'is-gain' : 'is-loss'}`}>
          <span className="mom-label">{label}</span>
          {v == null ? '—' : fmtPct(v, 1, true)}
        </span>
      ))}
    </div>
  );
}

function RangeIndicator({ f, price }: { f: Fundamentals; price: number }) {
  if (f.week52High == null || f.week52Low == null || f.week52High <= f.week52Low) return null;
  const pos = Math.min(1, Math.max(0, (price - f.week52Low) / (f.week52High - f.week52Low)));
  return (
    <div className="range52">
      <span className="num">{fmtNum(f.week52Low)}</span>
      <div
        className="range52-track"
        role="img"
        aria-label={`Current price sits ${Math.round(pos * 100)}% of the way up its 52-week range`}
      >
        <div className="range52-marker" style={{ left: `${pos * 100}%` }} />
      </div>
      <span className="num">{fmtNum(f.week52High)}</span>
      <span className="rc-range-label">52-week range · now at {Math.round(pos * 100)}%</span>
    </div>
  );
}
