/**
 * Pure trading math — every formula from spec §6.2, implemented exactly
 * as written. No UI, no I/O: everything here is a pure function so the
 * numbers can be reasoned about (and tested) in isolation.
 */

// ---------------------------------------------------------------------------
// §6.2.3 Position Sizer (shares/futures)
// ---------------------------------------------------------------------------

export interface SizerInputs {
  accountSize: number;
  riskPct: number;
  entry: number;
  stop: number;
  target: number;
}

export interface SizerOutputs {
  stopDistance: number;
  dollarRisk: number;
  positionSize: number;
  rewardDistance: number;
  rewardToRisk: number;
  /** 'Up' if target ≥ entry, else 'Down' (spec §6.2.3 push-to-log). */
  direction: 'Up' | 'Down';
}

/**
 * Returns outputs, or a plain-English warning when the spec says to blank
 * them (any field non-numeric, risk % ≤ 0, or stop distance 0).
 */
export function computeSizer(i: SizerInputs): SizerOutputs | { warning: string } {
  const values = [i.accountSize, i.riskPct, i.entry, i.stop, i.target];
  if (values.some((v) => !isFinite(v))) {
    return { warning: 'Fill in every field to see the numbers.' };
  }
  if (i.riskPct <= 0) {
    return { warning: 'Risk % must be above zero.' };
  }
  const stopDistance = Math.abs(i.entry - i.stop);
  if (stopDistance === 0) {
    return { warning: 'Entry and stop are the same price — there is no risk to size from.' };
  }
  const dollarRisk = i.accountSize * (i.riskPct / 100);
  const rewardDistance = Math.abs(i.target - i.entry);
  return {
    stopDistance,
    dollarRisk,
    positionSize: Math.floor(dollarRisk / stopDistance),
    rewardDistance,
    rewardToRisk: rewardDistance / stopDistance,
    direction: i.target >= i.entry ? 'Up' : 'Down',
  };
}

// ---------------------------------------------------------------------------
// §6.2.4 Options Contract Ticket (premium-based sizing)
// ---------------------------------------------------------------------------

export interface TicketInputs {
  accountSize: number;
  riskPct: number;
  entryPremium: number;
  stopPremium: number;
  targetPremium: number;
  multiplier: number;
}

export interface TicketOutputs {
  dollarRisk: number;
  riskPerContract: number;
  contracts: number;
  rewardToRisk: number;
  capitalDeployed: number;
  pctOfAccount: number;
  /** contracts === 0 — one contract alone exceeds the risk budget (§6.2.4). */
  zeroContracts: boolean;
  /** pctOfAccount > 25 — overleverage warning (§6.2.4). */
  overleveraged: boolean;
}

export function computeTicket(i: TicketInputs): TicketOutputs | { warning: string } {
  const values = [i.accountSize, i.riskPct, i.entryPremium, i.stopPremium, i.targetPremium, i.multiplier];
  if (values.some((v) => !isFinite(v))) {
    return { warning: 'Fill in every field to see the numbers.' };
  }
  if (i.riskPct <= 0) return { warning: 'Risk % must be above zero.' };
  if (i.multiplier <= 0) return { warning: 'The contract multiplier must be above zero (100 for standard options).' };
  if (i.entryPremium <= i.stopPremium) {
    return { warning: "The stop premium must sit below the entry premium — a long option's stop is a lower price, not a higher one." };
  }
  const dollarRisk = i.accountSize * (i.riskPct / 100);
  const riskPerContract = (i.entryPremium - i.stopPremium) * i.multiplier;
  const contracts = Math.floor(dollarRisk / riskPerContract);
  const capitalDeployed = contracts * i.entryPremium * i.multiplier;
  return {
    dollarRisk,
    riskPerContract,
    contracts,
    rewardToRisk: (i.targetPremium - i.entryPremium) / (i.entryPremium - i.stopPremium),
    capitalDeployed,
    pctOfAccount: (capitalDeployed / i.accountSize) * 100,
    zeroContracts: contracts === 0,
    overleveraged: (capitalDeployed / i.accountSize) * 100 > 25,
  };
}

// ---------------------------------------------------------------------------
// §6.2.5 Greeks Lab — standard Black-Scholes
// ---------------------------------------------------------------------------

/** Standard normal probability density φ(x) = e^(−x²/2) / √(2π). */
export function normPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF N(x), via the Abramowitz & Stegun 7.1.26 polynomial
 * approximation of erf (max error ~1.5e-7 — far below display precision).
 */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const erf =
    1 -
    t *
      (0.254829592 +
        t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export type OptionType = 'call' | 'put';

export interface BsInputs {
  type: OptionType;
  spot: number;
  strike: number;
  daysToExpiry: number;
  ivPct: number;
  ratePct: number;
}

export interface BsOutputs {
  premium: number;
  delta: number;
  gamma: number;
  /** Per calendar day (the ÷365 in the spec). */
  theta: number;
  /** Per 1-percentage-point IV move (the ÷100 in the spec). */
  vega: number;
  breakeven: number;
  moneyness: 'in the money' | 'at the money' | 'out of the money';
}

export function blackScholes(i: BsInputs): BsOutputs | { warning: string } {
  const values = [i.spot, i.strike, i.daysToExpiry, i.ivPct, i.ratePct];
  if (values.some((v) => !isFinite(v))) return { warning: 'Fill in every field to price the option.' };
  if (i.spot <= 0 || i.strike <= 0) return { warning: 'Spot and strike prices must be above zero.' };
  if (i.daysToExpiry <= 0) return { warning: 'Days to expiry must be above zero.' };
  if (i.ivPct <= 0) return { warning: 'Implied volatility must be above zero.' };

  const T = i.daysToExpiry / 365;
  const sigma = i.ivPct / 100;
  const r = i.ratePct / 100;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(i.spot / i.strike) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discount = Math.exp(-r * T);

  const premium =
    i.type === 'call'
      ? i.spot * normCdf(d1) - i.strike * discount * normCdf(d2)
      : i.strike * discount * normCdf(-d2) - i.spot * normCdf(-d1);

  const delta = i.type === 'call' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = normPdf(d1) / (i.spot * sigma * sqrtT);
  const theta =
    i.type === 'call'
      ? (-(i.spot * normPdf(d1) * sigma) / (2 * sqrtT) - r * i.strike * discount * normCdf(d2)) / 365
      : (-(i.spot * normPdf(d1) * sigma) / (2 * sqrtT) + r * i.strike * discount * normCdf(-d2)) / 365;
  const vega = (i.spot * normPdf(d1) * sqrtT) / 100;

  const breakeven = i.type === 'call' ? i.strike + premium : i.strike - premium;

  // "At the money" within a ±0.5% band of the strike; otherwise in/out by side.
  const ratio = i.spot / i.strike;
  const moneyness =
    Math.abs(ratio - 1) <= 0.005
      ? 'at the money'
      : (i.type === 'call' ? ratio > 1 : ratio < 1)
        ? 'in the money'
        : 'out of the money';

  return { premium, delta, gamma, theta, vega, breakeven, moneyness };
}

/** Long-option profit/loss at expiration for one contract-set (§6.2.5 diagram). */
export function payoffAtExpiry(
  type: OptionType,
  strike: number,
  premium: number,
  multiplier: number,
  priceAtExpiry: number,
): number {
  const intrinsic =
    type === 'call' ? Math.max(0, priceAtExpiry - strike) : Math.max(0, strike - priceAtExpiry);
  return (intrinsic - premium) * multiplier;
}

// ---------------------------------------------------------------------------
// §6.2.6 Volatility Read — IV rank & expected move
// ---------------------------------------------------------------------------

export function ivRank(currentIv: number, ivLow: number, ivHigh: number): number | null {
  if (![currentIv, ivLow, ivHigh].every(isFinite)) return null;
  if (ivHigh <= ivLow) return null;
  const rank = ((currentIv - ivLow) / (ivHigh - ivLow)) * 100;
  return Math.min(100, Math.max(0, rank));
}

/** Verdict copy by rank (§6.2.6 thresholds). */
export function ivRankVerdict(rank: number): string {
  if (rank < 25) {
    return 'Volatility is cheap right now — this favors buying premium (long calls or puts).';
  }
  if (rank > 75) {
    return 'Volatility is rich right now — this favors selling premium with defined risk, not buying it.';
  }
  return 'Mid-range volatility — no strong edge from volatility either way.';
}

/** ±1 standard deviation expected move (§6.2.6). */
export function expectedMove(spot: number, currentIvPct: number, daysToExpiry: number): number | null {
  if (![spot, currentIvPct, daysToExpiry].every(isFinite)) return null;
  if (spot <= 0 || currentIvPct <= 0 || daysToExpiry <= 0) return null;
  return spot * (currentIvPct / 100) * Math.sqrt(daysToExpiry / 365);
}
