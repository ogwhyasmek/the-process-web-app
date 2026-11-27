/**
 * Spec §6.2 formulas. Black-Scholes reference values were computed
 * independently (exact erf, not this file's approximation); the first
 * case is the textbook S=K=100, T=1y, r=5%, σ=20% example.
 */
import { describe, expect, it } from 'vitest';
import {
  blackScholes,
  computeSizer,
  computeTicket,
  expectedMove,
  ivRank,
  ivRankVerdict,
  normCdf,
  normPdf,
  payoffAtExpiry,
  type BsOutputs,
  type SizerOutputs,
  type TicketOutputs,
} from './calc';

const sizerOk = (r: ReturnType<typeof computeSizer>) => {
  if ('warning' in r) throw new Error(`unexpected warning: ${r.warning}`);
  return r as SizerOutputs;
};
const ticketOk = (r: ReturnType<typeof computeTicket>) => {
  if ('warning' in r) throw new Error(`unexpected warning: ${r.warning}`);
  return r as TicketOutputs;
};
const bsOk = (r: ReturnType<typeof blackScholes>) => {
  if ('warning' in r) throw new Error(`unexpected warning: ${r.warning}`);
  return r as BsOutputs;
};
const warningOf = (r: object) => ('warning' in r ? (r as { warning: string }).warning : null);

describe('Position Sizer (§6.2.3)', () => {
  const base = { accountSize: 10000, riskPct: 1, entry: 100, stop: 98, target: 104 };

  it('computes the spec formulas for a long', () => {
    const out = sizerOk(computeSizer(base));
    expect(out.stopDistance).toBe(2);
    expect(out.dollarRisk).toBe(100);
    expect(out.positionSize).toBe(50); // floor(100 / 2)
    expect(out.rewardDistance).toBe(4);
    expect(out.rewardToRisk).toBe(2);
    expect(out.direction).toBe('Up');
  });

  it('floors the position size instead of rounding', () => {
    // 100 / 1.5 = 66.67 → 66 (rounding to 67 would risk more than 1%)
    expect(sizerOk(computeSizer({ ...base, stop: 98.5 })).positionSize).toBe(66);
  });

  it('handles a short (target below entry, stop above)', () => {
    const out = sizerOk(computeSizer({ ...base, stop: 102, target: 96 }));
    expect(out.direction).toBe('Down');
    expect(out.positionSize).toBe(50);
    expect(out.rewardToRisk).toBe(2);
  });

  it('treats target = entry as Up with zero reward (spec: Up if target ≥ entry)', () => {
    const out = sizerOk(computeSizer({ ...base, target: 100 }));
    expect(out.direction).toBe('Up');
    expect(out.rewardToRisk).toBe(0);
  });

  it.each([
    ['a non-numeric field', { entry: NaN }, /fill in every field/i],
    ['risk % of zero', { riskPct: 0 }, /risk %/i],
    ['negative risk %', { riskPct: -1 }, /risk %/i],
    ['entry equal to stop', { stop: 100 }, /same price/i],
    ['zero account size', { accountSize: 0 }, /account size/i],
    ['a long with its stop above entry', { stop: 105, target: 110 }, /stop must sit below entry/i],
    ['a short with its stop below entry', { stop: 95, target: 90 }, /stop must sit above entry/i],
  ])('warns instead of computing for %s', (_label, patch, message) => {
    expect(warningOf(computeSizer({ ...base, ...patch }))).toMatch(message);
  });
});

describe('Options Contract Ticket (§6.2.4)', () => {
  const base = {
    accountSize: 10000,
    riskPct: 1,
    entryPremium: 2.5,
    stopPremium: 1.5,
    targetPremium: 4.5,
    multiplier: 100,
  };

  it('computes the spec formulas', () => {
    const out = ticketOk(computeTicket(base));
    expect(out.dollarRisk).toBe(100);
    expect(out.riskPerContract).toBe(100); // (2.5 − 1.5) × 100
    expect(out.contracts).toBe(1);
    expect(out.rewardToRisk).toBe(2); // (4.5 − 2.5) / (2.5 − 1.5)
    expect(out.capitalDeployed).toBe(250);
    expect(out.pctOfAccount).toBeCloseTo(2.5);
    expect(out.zeroContracts).toBe(false);
    expect(out.overleveraged).toBe(false);
  });

  it('flags zero contracts when one contract exceeds the risk budget', () => {
    const out = ticketOk(computeTicket({ ...base, stopPremium: 0.5 })); // $200/contract > $100
    expect(out.contracts).toBe(0);
    expect(out.zeroContracts).toBe(true);
  });

  it('flags overleverage only above 25% of the account', () => {
    // 1% risk on $10k = $100; $0.10 risk per share → 10 contracts × $30 × 100 = $30,000
    const heavy = ticketOk(computeTicket({ ...base, entryPremium: 30, stopPremium: 29.9, targetPremium: 31 }));
    expect(heavy.pctOfAccount).toBeGreaterThan(25);
    expect(heavy.overleveraged).toBe(true);
  });

  it.each([
    ['a missing field', { targetPremium: NaN }, /fill in every field/i],
    ['zero risk %', { riskPct: 0 }, /risk %/i],
    ['zero multiplier', { multiplier: 0 }, /multiplier/i],
    ['stop premium above entry', { stopPremium: 3 }, /below the entry premium/i],
    ['stop premium equal to entry', { stopPremium: 2.5 }, /below the entry premium/i],
    ['zero account size', { accountSize: 0 }, /account size/i],
  ])('warns for %s', (_label, patch, message) => {
    expect(warningOf(computeTicket({ ...base, ...patch }))).toMatch(message);
  });
});

describe('normal distribution helpers', () => {
  it('N(x) matches reference values to display precision', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normCdf(-1)).toBeCloseTo(0.1586553, 6);
  });

  it('N(x) is symmetric: N(−x) = 1 − N(x)', () => {
    for (const x of [0.1, 0.5, 1.3, 2.7]) {
      expect(normCdf(-x)).toBeCloseTo(1 - normCdf(x), 7);
    }
  });

  it('φ(0) = 1/√(2π)', () => {
    expect(normPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 10);
  });
});

describe('Black-Scholes (§6.2.5)', () => {
  // [inputs, call, put, callDelta, gamma, callTheta/day, putTheta/day, vega/pt]
  const cases: Array<[string, { spot: number; strike: number; daysToExpiry: number; ivPct: number; ratePct: number }, number[]]> = [
    ['textbook ATM, 1 year', { spot: 100, strike: 100, daysToExpiry: 365, ivPct: 20, ratePct: 5 },
      [10.450584, 5.573526, 0.636831, 0.018762, -0.017573, -0.004542, 0.37524]],
    ['app default, 30 days', { spot: 100, strike: 100, daysToExpiry: 30, ivPct: 30, ratePct: 4.5 },
      [3.61156, 3.24238, 0.53427, 0.046213, -0.063117, -0.050834, 0.113951]],
    ['in the money call, 60 days', { spot: 110, strike: 100, daysToExpiry: 60, ivPct: 25, ratePct: 3 },
      [11.393462, 0.901525, 0.850747, 0.020842, -0.028347, -0.020168, 0.10364]],
  ];

  it.each(cases)('prices %s', (_label, i, [call, put, dCall, gamma, thCall, thPut, vega]) => {
    const c = bsOk(blackScholes({ ...i, type: 'call' }));
    const p = bsOk(blackScholes({ ...i, type: 'put' }));
    expect(c.premium).toBeCloseTo(call, 4);
    expect(p.premium).toBeCloseTo(put, 4);
    expect(c.delta).toBeCloseTo(dCall, 5);
    expect(p.delta).toBeCloseTo(dCall - 1, 5);
    expect(c.gamma).toBeCloseTo(gamma, 5);
    expect(p.gamma).toBeCloseTo(gamma, 5); // same for calls and puts
    expect(c.theta).toBeCloseTo(thCall, 5);
    expect(p.theta).toBeCloseTo(thPut, 5);
    expect(c.vega).toBeCloseTo(vega, 5);
  });

  it('satisfies put-call parity: C − P = S − K·e^(−rT)', () => {
    const i = { spot: 105, strike: 100, daysToExpiry: 90, ivPct: 35, ratePct: 4 };
    const c = bsOk(blackScholes({ ...i, type: 'call' }));
    const p = bsOk(blackScholes({ ...i, type: 'put' }));
    const T = 90 / 365;
    expect(c.premium - p.premium).toBeCloseTo(105 - 100 * Math.exp(-0.04 * T), 4);
  });

  it('computes breakeven: call strike + premium, put strike − premium', () => {
    const i = { spot: 100, strike: 100, daysToExpiry: 30, ivPct: 30, ratePct: 4.5 };
    const c = bsOk(blackScholes({ ...i, type: 'call' }));
    const p = bsOk(blackScholes({ ...i, type: 'put' }));
    expect(c.breakeven).toBeCloseTo(100 + c.premium, 10);
    expect(p.breakeven).toBeCloseTo(100 - p.premium, 10);
  });

  it('labels moneyness by side, with a ±0.5% at-the-money band', () => {
    const at = (type: 'call' | 'put', spot: number) =>
      bsOk(blackScholes({ type, spot, strike: 100, daysToExpiry: 30, ivPct: 30, ratePct: 4 })).moneyness;
    expect(at('call', 100.4)).toBe('at the money');
    expect(at('call', 110)).toBe('in the money');
    expect(at('call', 90)).toBe('out of the money');
    expect(at('put', 90)).toBe('in the money');
    expect(at('put', 110)).toBe('out of the money');
  });

  it.each([
    ['a missing field', { spot: NaN }],
    ['zero spot', { spot: 0 }],
    ['zero strike', { strike: 0 }],
    ['zero days to expiry', { daysToExpiry: 0 }],
    ['zero IV', { ivPct: 0 }],
  ])('warns for %s', (_label, patch) => {
    const r = blackScholes({ type: 'call', spot: 100, strike: 100, daysToExpiry: 30, ivPct: 30, ratePct: 4, ...patch });
    expect(warningOf(r)).not.toBeNull();
  });
});

describe('payoff at expiry (§6.2.5 diagram)', () => {
  it('caps a long call loss at the premium paid', () => {
    expect(payoffAtExpiry('call', 100, 3, 100, 50)).toBe(-300);
    expect(payoffAtExpiry('call', 100, 3, 100, 103)).toBe(0); // breakeven
    expect(payoffAtExpiry('call', 100, 3, 100, 110)).toBe(700);
  });

  it('mirrors for a long put', () => {
    expect(payoffAtExpiry('put', 100, 3, 100, 150)).toBe(-300);
    expect(payoffAtExpiry('put', 100, 3, 100, 97)).toBe(0);
    expect(payoffAtExpiry('put', 100, 3, 100, 90)).toBe(700);
  });
});

describe('Volatility Read (§6.2.6)', () => {
  it('computes IV rank and clamps it to 0–100', () => {
    expect(ivRank(42, 15, 60)).toBeCloseTo(60);
    expect(ivRank(10, 15, 60)).toBe(0);
    expect(ivRank(80, 15, 60)).toBe(100);
  });

  it('returns null when the range is invalid', () => {
    expect(ivRank(30, 60, 15)).toBeNull();
    expect(ivRank(30, 20, 20)).toBeNull();
    expect(ivRank(NaN, 15, 60)).toBeNull();
  });

  it('switches verdict at the 25 / 75 thresholds', () => {
    expect(ivRankVerdict(24.9)).toMatch(/cheap/);
    expect(ivRankVerdict(25)).toMatch(/mid-range/i);
    expect(ivRankVerdict(75)).toMatch(/mid-range/i);
    expect(ivRankVerdict(75.1)).toMatch(/rich/);
  });

  it('computes the ±1σ expected move', () => {
    // 100 × 0.40 × √(365/365) = 40
    expect(expectedMove(100, 40, 365)).toBeCloseTo(40);
    expect(expectedMove(100, 40, 0)).toBeNull();
    expect(expectedMove(0, 40, 30)).toBeNull();
  });
});
