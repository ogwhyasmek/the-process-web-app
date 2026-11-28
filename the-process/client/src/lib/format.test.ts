/** Month ticks for the Analyzer's price chart. */
import { describe, expect, it } from 'vitest';
import { fmtMonthTick, monthStartTicks } from './format';

describe('monthStartTicks', () => {
  it('ticks the first trading day of each new month, once', () => {
    const dates = ['2026-04-28', '2026-04-29', '2026-05-01', '2026-05-04', '2026-05-29', '2026-06-01', '2026-06-02'];
    expect(monthStartTicks(dates)).toEqual(['2026-05-01', '2026-06-01']);
  });

  it('skips a partial first month and handles a year change', () => {
    expect(monthStartTicks(['2025-12-30', '2025-12-31', '2026-01-02'])).toEqual(['2026-01-02']);
    expect(monthStartTicks([])).toEqual([]);
    expect(monthStartTicks(['2026-03-02'])).toEqual([]);
  });
});

describe('fmtMonthTick', () => {
  it('shows the month, with the year only at January', () => {
    expect(fmtMonthTick('2026-05-01')).toBe('May');
    expect(fmtMonthTick('2026-12-01')).toBe('Dec');
    expect(fmtMonthTick('2027-01-04')).toBe("Jan '27");
  });
});
