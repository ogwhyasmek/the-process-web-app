/** CSV export (§6.4 spreadsheet, §6.5 analytics CSV). */
import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

describe('buildCsv', () => {
  it('joins rows with CRLF and renders missing values as empty cells', () => {
    expect(buildCsv(['a', 'b'], [[1, null], [undefined, 'x']])).toBe('a,b\r\n1,\r\n,x');
  });

  it('quotes cells containing commas, quotes or newlines (RFC 4180)', () => {
    expect(buildCsv(['note'], [['chased, then panicked'], ['said "never again"'], ['line1\nline2']])).toBe(
      'note\r\n"chased, then panicked"\r\n"said ""never again"""\r\n"line1\nline2"',
    );
  });

  it('keeps negative numbers as plain numbers', () => {
    expect(buildCsv(['r'], [[-1.5]])).toBe('r\r\n-1.5');
  });
});
