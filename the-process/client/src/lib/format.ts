/**
 * Shared formatting helpers (spec §6.1: currency as currency,
 * percentages to 1 decimal unless noted otherwise).
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** $1,234.56 */
export function fmtMoney(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '—' : usd.format(v);
}

/** $1,235 — for large figures where cents are noise. */
export function fmtMoneyWhole(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '—' : usdWhole.format(v);
}

/** 12.3% (1 decimal by default per spec §6.1), signed on request. */
export function fmtPct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

/** +1.50R / −0.75R */
export function fmtR(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}R`;
}

/** Plain number with fixed decimals, em-dash when absent. */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v == null || !isFinite(v) ? '—' : v.toFixed(digits);
}

/** Market cap from a dollar figure: $4.61T / $28.5B / $450M. */
export function fmtCap(dollars: number | null | undefined): string {
  if (dollars == null || !isFinite(dollars) || dollars <= 0) return '—';
  if (dollars >= 1e12) return `$${(dollars / 1e12).toFixed(2)}T`;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  return `$${(dollars / 1e6).toFixed(0)}M`;
}

/** Today's date as a local YYYY-MM-DD string. */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
