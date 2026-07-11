/**
 * CSV building + download. Used for the Trade Log's spreadsheet export
 * (§6.4 — reproduces the exact table) and the Analytics CSV (§6.5).
 */

/** RFC-4180-style escaping: quote when the value needs it. */
function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) =>
    row.map((cell) => escapeCell(cell == null ? '' : String(cell))).join(','),
  );
  return lines.join('\r\n');
}

/** Trigger a client-side download of a text file. */
export function downloadFile(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
