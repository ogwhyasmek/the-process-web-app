/**
 * Reference (spec §6.8): the sixteen-term dictionary and the
 * risk-of-ruin Monte Carlo simulator with its risk ladder.
 */
import { useMemo, useState } from 'react';
import { Page } from '../components/Page';
import {
  ruinExpectancy,
  ruinLadder,
  ruinBand,
  simulateRuin,
  CAREERS,
  TRADES_PER_CAREER,
  type RuinInputs,
} from '../lib/ruin';
import { fmtPct } from '../lib/format';
import '../components/reference/reference.css';

/** §6.8.1 — sixteen terms, defined without further jargon. */
const TERMS: Array<[string, string]> = [
  ['Stop-loss', "A price you choose before buying, where you'll sell and accept a small loss if the trade goes against you. Decided while calm, never moved while scared."],
  ['Position size', 'How many shares or contracts you buy, calculated from what you can afford to lose, never from confidence.'],
  ['Risk % / the 1% rule', 'The slice of your account one trade is allowed to lose. At 1%, a $10,000 account risks $100 per trade.'],
  ['R (R-multiple)', 'Your unit of risk. 1R = the dollars you risked on a trade. Making double what you risked is +2R; losing it all is −1R.'],
  ['Reward-to-risk ratio', 'Potential profit divided by potential loss.'],
  ['Win rate', 'The percentage of trades that make money. Meaningless on its own — needs average win/loss alongside it.'],
  ['Expectancy', 'Average profit per trade, counting both wins and losses.'],
  ['Drawdown', 'How far an account has fallen from its highest point.'],
  ['Leverage', 'Trading with borrowed money or instruments that multiply exposure; makes wins and losses both bigger.'],
  ['Overtrading', 'Taking trades from boredom, excitement, or trying to win back a loss, instead of because the checklist says so.'],
  ['Option (call/put)', 'A contract covering 100 shares; a call profits if the stock rises enough, a put if it falls enough, both with a deadline.'],
  ['Premium', 'The price of an option, quoted per share; a $2.50 premium costs $250 per contract (×100).'],
  ['Implied volatility (IV)', "The market's guess at how wildly a stock will move, priced into the option."],
  ['IV crush', 'The sudden collapse in option prices right after big news (like earnings), which can cause a loss even with the right directional call.'],
  ['Bracket order', 'An order that attaches the stop-loss and profit target at entry, so both exits are automatic.'],
  ['Paper trading', 'Practicing with fake money on a real platform before risking real capital.'],
];

export function Reference() {
  return (
    <Page
      title="Reference"
      lede="The dictionary — sixteen terms in plain English — and the risk-of-ruin simulator that shows what position size alone does to survival odds."
    >
      <RuinSimulator />

      <section aria-labelledby="dict-title">
        <h2 id="dict-title" className="section-title">Dictionary</h2>
        <p className="section-sub">Sixteen terms, no jargon inside the definitions.</p>
        <dl className="dict">
          {TERMS.map(([term, def]) => (
            <div className="dict-entry" key={term}>
              <dt>{term}</dt>
              <dd>{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Page>
  );
}

function RuinSimulator() {
  const [winRate, setWinRate] = useState('45');
  const [avgWin, setAvgWin] = useState('2');
  const [avgLoss, setAvgLoss] = useState('1');
  const [risk, setRisk] = useState('1');
  const [ruinDd, setRuinDd] = useState('50');

  const inputs: RuinInputs | null = useMemo(() => {
    const i = {
      winRatePct: Number(winRate),
      avgWinR: Number(avgWin),
      avgLossR: Number(avgLoss),
      riskPct: Number(risk),
      ruinDrawdownPct: Number(ruinDd),
    };
    const ok =
      [i.winRatePct, i.avgWinR, i.avgLossR, i.riskPct, i.ruinDrawdownPct].every(isFinite) &&
      i.winRatePct >= 0 && i.winRatePct <= 100 &&
      i.avgWinR >= 0 && i.avgLossR > 0 && i.riskPct > 0 &&
      i.ruinDrawdownPct > 0 && i.ruinDrawdownPct < 100;
    return ok ? i : null;
  }, [winRate, avgWin, avgLoss, risk, ruinDd]);

  const model = useMemo(() => {
    if (!inputs) return null;
    return {
      expectancy: ruinExpectancy(inputs),
      atRisk: simulateRuin(inputs),
      ladder: ruinLadder(inputs),
    };
  }, [inputs]);

  return (
    <section className="card" aria-labelledby="ruin-title">
      <h2 id="ruin-title">Risk of Ruin</h2>
      <p className="card-sub">
        {CAREERS.toLocaleString()} simulated careers of {TRADES_PER_CAREER} trades each, betting a
        fixed fraction of the account every time. "Ruin" means hitting your drawdown line — the
        point where most people can't keep going.
      </p>

      <div className="tool-grid">
        <div className="field">
          <label htmlFor="rr-wr">Win rate (%)</label>
          <input id="rr-wr" className="num" type="number" min="0" max="100" step="1"
            inputMode="decimal" value={winRate} onChange={(e) => setWinRate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rr-aw">Average win (R)</label>
          <input id="rr-aw" className="num" type="number" min="0" step="0.1"
            inputMode="decimal" value={avgWin} onChange={(e) => setAvgWin(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rr-al">Average loss (R)</label>
          <input id="rr-al" className="num" type="number" min="0.1" step="0.1"
            inputMode="decimal" value={avgLoss} onChange={(e) => setAvgLoss(e.target.value)} />
          <span className="field-hint">1 = stops honored exactly.</span>
        </div>
        <div className="field">
          <label htmlFor="rr-risk">Your risk per trade (%)</label>
          <input id="rr-risk" className="num" type="number" min="0.1" step="0.1"
            inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rr-dd">"Ruin" drawdown (%)</label>
          <input id="rr-dd" className="num" type="number" min="10" max="95" step="5"
            inputMode="decimal" value={ruinDd} onChange={(e) => setRuinDd(e.target.value)} />
        </div>
      </div>

      {!model ? (
        <p className="tool-warning" role="status">
          Fill in every field (win rate 0–100, losses and risk above zero, ruin line under 100%).
        </p>
      ) : (
        <>
          <div className="ruin-headline num" aria-live="polite">
            <div className="out">
              <dt>Expectancy per trade</dt>
              <dd className={model.expectancy >= 0 ? 'gain' : 'loss'}>
                {model.expectancy >= 0 ? '+' : ''}{model.expectancy.toFixed(2)}R
              </dd>
            </div>
            <div className="out">
              <dt>Risk of ruin at {inputs!.riskPct}%</dt>
              <dd className={`ruin-${ruinBand(model.atRisk.ruinProbability)}`}>
                {fmtPct(model.atRisk.ruinProbability * 100)}
              </dd>
            </div>
            <div className="out">
              <dt>Median ending equity</dt>
              <dd>
                {model.atRisk.medianEndingMultiple === 0
                  ? 'wiped'
                  : `${model.atRisk.medianEndingMultiple.toFixed(2)}×`}
              </dd>
            </div>
          </div>

          {model.expectancy < 0 && (
            <p className="tool-warning" role="alert">
              Expectancy is negative — no position size saves a method that loses on average.
              Smaller risk only slows the ending. Fix the edge first.
            </p>
          )}

          <h3 className="ruin-ladder-title">The same edge, bigger bets</h3>
          <div className="table-scroll">
            <table className="ref-table ruin-table">
              <thead>
                <tr>
                  <th scope="col">Risk per trade</th>
                  <th scope="col" className="num">Risk of ruin</th>
                  <th scope="col" className="num">Median ending equity</th>
                  <th scope="col"><span className="sr-only">Band</span></th>
                </tr>
              </thead>
              <tbody>
                {model.ladder.map(({ riskPct, result }) => {
                  const band = ruinBand(result.ruinProbability);
                  const isYours = inputs!.riskPct === riskPct;
                  return (
                    <tr key={riskPct} className={isYours ? 'is-current' : ''}>
                      <th scope="row" className="num">
                        {riskPct}%{isYours && <span className="ruin-you"> ← yours</span>}
                      </th>
                      <td className={`num ruin-${band}`}>
                        {fmtPct(result.ruinProbability * 100)}
                      </td>
                      <td className="num">
                        {result.medianEndingMultiple === 0
                          ? 'wiped'
                          : `${result.medianEndingMultiple.toFixed(2)}×`}
                      </td>
                      <td>
                        <span className={`ruin-pill ruin-${band}`}>{band}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            Same win rate, same average win and loss — only the bet size changes. That climb is
            overleveraging, quantified.
          </p>
        </>
      )}
    </section>
  );
}
