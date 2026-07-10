/**
 * Payoff-at-expiration diagram (spec §6.2.5): the long option's kinked
 * P/L line against underlying price at expiry — loss region shaded and
 * bounded at −premium × multiplier, gain region shaded distinctly,
 * breakeven marked, dashed vertical at current spot. Pure SVG.
 */
import { payoffAtExpiry, type OptionType } from '../../lib/calc';
import { fmtMoney } from '../../lib/format';

const W = 640;
const H = 250;
const PAD = { top: 18, right: 16, bottom: 30, left: 62 };

export function PayoffDiagram({
  type,
  spot,
  strike,
  premium,
  breakeven,
  multiplier = 100,
}: {
  type: OptionType;
  spot: number;
  strike: number;
  premium: number;
  breakeven: number;
  multiplier?: number;
}) {
  // Price domain: wide enough to show spot, strike, and breakeven with air.
  const anchors = [spot, strike, breakeven];
  const xMin = Math.max(0, Math.min(...anchors) * 0.82);
  const xMax = Math.max(...anchors) * 1.18;

  const maxLoss = -premium * multiplier;
  const pl = (price: number) => payoffAtExpiry(type, strike, premium, multiplier, price);
  const yMaxRaw = Math.max(pl(xMin), pl(xMax));
  // Keep the zero line visible and the shape readable even deep ITM/OTM.
  const yMax = Math.max(yMaxRaw, -maxLoss * 0.6);
  const yMin = maxLoss * 1.25;

  const x = (price: number) =>
    PAD.left + ((price - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + ((yMax - v) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  // The payoff line is piecewise linear with one kink at the strike.
  const linePts = [xMin, strike, xMax].map((p) => `${x(p)},${y(pl(p))}`).join(' ');

  // Shaded areas between the curve and the zero line, split at breakeven.
  const zeroY = y(0);
  const lossRegion =
    type === 'call'
      ? `${x(xMin)},${zeroY} ${x(xMin)},${y(pl(xMin))} ${x(Math.min(strike, breakeven))},${y(pl(strike))} ${x(breakeven)},${zeroY}`
      : `${x(breakeven)},${zeroY} ${x(Math.max(strike, breakeven))},${y(pl(strike))} ${x(xMax)},${y(pl(xMax))} ${x(xMax)},${zeroY}`;
  const gainRegion =
    type === 'call'
      ? `${x(breakeven)},${zeroY} ${x(xMax)},${y(pl(xMax))} ${x(xMax)},${zeroY}`
      : `${x(xMin)},${y(pl(xMin))} ${x(breakeven)},${zeroY} ${x(xMin)},${zeroY}`;

  const ticks = [xMin, strike, xMax].map((p) => ({ px: x(p), label: p.toFixed(0) }));

  return (
    <figure className="payoff">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Payoff at expiration for a long ${type}: maximum loss ${fmtMoney(maxLoss)}, breakeven at ${fmtMoney(breakeven)}.`}
      >
        {/* zero P/L axis */}
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} className="payoff-zero" />

        {/* shaded loss / gain regions */}
        <polygon points={lossRegion} className="payoff-loss" />
        <polygon points={gainRegion} className="payoff-gain" />

        {/* max-loss floor */}
        <line x1={PAD.left} y1={y(maxLoss)} x2={W - PAD.right} y2={y(maxLoss)} className="payoff-floor" />
        <text x={PAD.left + 4} y={y(maxLoss) - 5} className="payoff-label loss">
          max loss {fmtMoney(maxLoss)}
        </text>

        {/* the payoff line */}
        <polyline points={linePts} className="payoff-line" />

        {/* spot marker (dashed vertical) */}
        <line x1={x(spot)} y1={PAD.top} x2={x(spot)} y2={H - PAD.bottom} className="payoff-spot" />
        <text x={x(spot) + 4} y={PAD.top + 10} className="payoff-label dim">
          spot {spot.toFixed(2)}
        </text>

        {/* breakeven marker */}
        <circle cx={x(breakeven)} cy={zeroY} r={4} className="payoff-be" />
        <text x={x(breakeven) + 6} y={zeroY - 8} className="payoff-label amber">
          breakeven {breakeven.toFixed(2)}
        </text>

        {/* x-axis ticks */}
        {ticks.map((t) => (
          <text key={t.px} x={t.px} y={H - 8} textAnchor="middle" className="payoff-label dim">
            {t.label}
          </text>
        ))}

        {/* y-axis reference labels */}
        <text x={8} y={zeroY + 4} className="payoff-label dim">$0</text>
      </svg>
      <figcaption className="field-hint">
        Profit or loss at expiration for one long {type} position ({multiplier}× multiplier),
        against where the stock ends up.
      </figcaption>
    </figure>
  );
}
