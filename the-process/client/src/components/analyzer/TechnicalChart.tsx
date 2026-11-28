/**
 * Technical Read chart (spec §6.7): ~9 months of daily closes with the
 * 50- and 200-day moving averages, and the auto-detected setups drawn
 * directly on the chart, each with its one-line thesis below.
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from 'recharts';
import { fmtMonthTick, monthStartTicks } from '../../lib/format';
import { sma, type Bar, type DetectedSetup } from '../../lib/signals';
import { CHART, AXIS, TOOLTIP_STYLE } from '../analytics/chartTheme';

const SHOWN_SESSIONS = 190; // ~9 months of trading days

export function TechnicalChart({ bars, setups }: { bars: Bar[]; setups: DetectedSetup[] }) {
  const closes = bars.map((b) => b.c);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);

  const start = Math.max(0, bars.length - SHOWN_SESSIONS);
  const data = bars.slice(start).map((b, i) => {
    const gi = start + i;
    return {
      i: gi,
      date: new Date(b.t * 1000).toISOString().slice(0, 10),
      close: b.c,
      ma50: s50[gi],
      ma200: s200[gi],
    };
  });

  const markers = setups.filter((s) => s.index >= start);
  // One tick per month, on its first trading day (avoids repeated labels).
  const ticks = monthStartTicks(data.map((d) => d.date));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="date"
            {...AXIS}
            ticks={ticks}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={fmtMonthTick}
          />
          <YAxis {...AXIS} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(0)} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [
              value?.toFixed(2),
              name === 'close' ? 'close' : name === 'ma50' ? '50-day avg' : '200-day avg',
            ]}
          />
          <Line type="monotone" dataKey="close" stroke={CHART.amber} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="ma50" stroke={CHART.gain} strokeWidth={1.2} dot={false} isAnimationActive={false} strokeDasharray="1 0" />
          <Line type="monotone" dataKey="ma200" stroke={CHART.text} strokeWidth={1.2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {markers.map((s) => (
            <ReferenceDot
              key={s.kind}
              x={data[s.index - start]?.date}
              y={bars[s.index].c}
              r={6}
              fill={s.side === 'bullish' ? CHART.gain : CHART.loss}
              stroke={CHART.surface}
              strokeWidth={2}
              label={{
                value: s.kind.replace('-', ' '),
                position: 'top',
                fill: s.side === 'bullish' ? CHART.gain : CHART.loss,
                fontSize: 11,
                fontFamily: 'ui-monospace, Menlo, monospace',
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="tc-legend">
        <span><i className="tc-swatch" style={{ background: CHART.amber }} /> price</span>
        <span><i className="tc-swatch" style={{ background: CHART.gain }} /> 50-day avg</span>
        <span><i className="tc-swatch tc-dash" style={{ borderColor: CHART.text }} /> 200-day avg</span>
      </div>
      {markers.length > 0 && (
        <ul className="tc-theses">
          {markers.map((s) => (
            <li key={s.kind} className={s.side === 'bullish' ? 'is-bull' : 'is-bear'}>
              {s.thesis}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
