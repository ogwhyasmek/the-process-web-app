/**
 * Chart color constants — Recharts needs concrete values, so these mirror
 * the CSS custom properties in styles/global.css. Change both together.
 */
export const CHART = {
  amber: '#e8a33d',
  gain: '#4cc38a',
  loss: '#e5534b',
  grid: '#262a30',
  text: '#9ba1ab',
  faint: '#6b7280',
  surface: '#191c20',
} as const;

/** Shared axis/tooltip props so every chart reads as one system. */
export const AXIS = {
  stroke: CHART.grid,
  tick: { fill: CHART.faint, fontSize: 11, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: CHART.surface,
    border: `1px solid ${CHART.grid}`,
    borderRadius: 8,
    fontSize: 12.5,
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  },
  labelStyle: { color: CHART.text },
  itemStyle: { color: CHART.text },
  cursor: { stroke: CHART.grid },
} as const;
