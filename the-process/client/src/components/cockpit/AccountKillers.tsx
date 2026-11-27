/**
 * Four Account Killers (spec §6.2.1) — expandable reference cards, each
 * naming a failure mode and its mechanical fix. Keyboard-operable.
 */
import { useState } from 'react';

const KILLERS = [
  {
    name: 'Overleveraging',
    line: 'Positions sized from what the broker allows, not from what the account survives.',
    fixes: [
      'Cap total exposure across all open positions — never more than 20–30% of the account deployed at once.',
      'Size every position from stop distance × risk %, never from available buying power.',
      "Use less leverage than the broker's max, always.",
    ],
  },
  {
    name: 'Poor risk management',
    line: 'No stop, a moved stop, or a different risk on every trade.',
    fixes: [
      'A real stop-loss order at entry, every time — not a mental one.',
      'The same fixed risk % on every trade regardless of conviction.',
      'Never widen a stop after entry to avoid taking a loss.',
    ],
  },
  {
    name: 'Overtrading',
    line: 'Trading from boredom or revenge until commissions and slippage bleed the account.',
    fixes: [
      'A hard cap on trades per day and per week.',
      'A written checklist that must be fully met before entry — no match, no trade.',
      'Commissions and slippage tracked monthly so the cost is visible, not invisible.',
    ],
  },
  {
    name: 'Emotional decisions',
    line: 'Deciding mid-trade, scared or euphoric, instead of before it while calm.',
    fixes: [
      'The full plan — entry, stop, target, size — written before entering, while calm.',
      'Bracket orders so exits are automatic.',
      'A mandatory cooling-off period after any loss before the next trade.',
    ],
  },
];

export function AccountKillers() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="account-killers" aria-labelledby="killers-title">
      <h2 id="killers-title" className="section-title">Four ways an account dies</h2>
      <p className="section-sub">
        Every tool on this page exists because of one of these. Open each for its mechanical fix.
      </p>
      <div className="killers">
        {KILLERS.map((k, i) => {
          const isOpen = open === i;
          return (
            <div key={k.name} className={`card killer ${isOpen ? 'is-open' : ''}`}>
              <button
                className="killer-toggle"
                aria-expanded={isOpen}
                aria-controls={`killer-body-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="killer-name">{k.name}</span>
                <span className="killer-line">{k.line}</span>
                <span className="killer-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <ul id={`killer-body-${i}`} className="killer-fixes">
                  {k.fixes.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
