/**
 * The four required §6.5 charts, all Recharts, all themed identically:
 * equity curve (max drawdown annotated), R-distribution histogram,
 * rolling win rate, and net R by weekday / by month.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts';
import type { EquityPoint } from '../../lib/stats';
import { drawdownSpan, winRateDomain } from '../../lib/analytics';
import { CHART, AXIS, TOOLTIP_STYLE } from './chartTheme';

const fmtR1 = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}R`;

export function EquityChart({
  points,
  maxDrawdown,
}: {
  points: EquityPoint[];
  maxDrawdown: number;
}) {
  // Spec §6.5: the curve starts at 0 before the first trade.
  const data = [{ index: 0, cumR: 0, drawdown: 0 }, ...points];
  const dd = drawdownSpan(points, maxDrawdown);
  return (
    <figure className="chart-card card">
      <figcaption>
        <h2>Equity curve</h2>
        <p className="card-sub">
          Cumulative R, trade by trade. Max drawdown so far:{' '}
          <strong className="num loss">−{maxDrawdown.toFixed(1)}R</strong>
        </p>
      </figcaption>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.amber} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART.amber} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, 'dataMax']}
            allowDecimals={false}
            {...AXIS}
          />
          <YAxis {...AXIS} tickFormatter={(v: number) => `${v}R`} />
          {dd && (
            // The worst peak-to-trough slide, drawn where it happened.
            <ReferenceArea
              x1={dd.peak}
              x2={dd.trough}
              fill={CHART.loss}
              fillOpacity={0.1}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number, name: string) =>
              name === 'cumR' ? [fmtR1(value), 'cumulative'] : [fmtR1(-value), 'drawdown']
            }
            labelFormatter={(l: number) => `trade #${l}`}
          />
          <ReferenceLine y={0} stroke={CHART.grid} />
          {/* Straight segments: each trade is a discrete step, and smoothing
              would invent curves between trades and soften sharp losses. */}
          <Area
            type="linear"
            dataKey="cumR"
            stroke={CHART.amber}
            strokeWidth={2}
            fill="url(#eqFill)"
            isAnimationActive={false}
          />
          {dd && (
            <ReferenceDot
              x={dd.trough}
              y={dd.troughR}
              r={4}
              fill={CHART.loss}
              stroke={CHART.surface}
              label={{
                value: `max DD −${maxDrawdown.toFixed(1)}R`,
                position: 'bottom',
                fill: CHART.loss,
                fontSize: 12,
                fontFamily: AXIS.tick.fontFamily,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function RHistogram({ data }: { data: { bucket: string; count: number }[] }) {
  return (
    <figure className="chart-card card">
      <figcaption>
        <h2>R distribution</h2>
        <p className="card-sub">
          Healthy: losses bunched at −1 (stops honored), wins spread right. Losses drifting past
          −1R means stops are slipping.
        </p>
      </figcaption>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="bucket" {...AXIS} />
          <YAxis {...AXIS} allowDecimals={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number) => [v, 'trades']}
            cursor={{ fill: 'rgba(232,163,61,0.06)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.bucket} fill={i <= 2 ? CHART.loss : CHART.gain} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function RollingWinRateChart({
  points,
  total,
}: {
  points: { trade: number; winRate: number }[];
  total: number;
}) {
  const window = Math.min(20, Math.max(5, Math.floor(total / 2)));
  const domain = winRateDomain(points.map((p) => p.winRate));
  return (
    <figure className="chart-card card">
      <figcaption>
        <h2>Rolling win rate</h2>
        <p className="card-sub">
          Recent form over a trailing {window}-trade window — not the lifetime average.
        </p>
      </figcaption>
      {points.length === 0 ? (
        <p className="chart-empty">Shows up from your 8th logged trade onward.</p>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="trade" {...AXIS} />
            <YAxis {...AXIS} domain={domain} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v: number) => [`${v.toFixed(0)}%`, 'win rate']}
              labelFormatter={(l: number) => `through trade #${l}`}
            />
            <ReferenceLine y={50} stroke={CHART.grid} strokeDasharray="4 4" />
            <Line
              type="linear"
              dataKey="winRate"
              stroke={CHART.amber}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  );
}

export function NetRBars({
  title,
  sub,
  data,
  labelKey,
}: {
  title: string;
  sub: string;
  data: Array<Record<string, string | number>>;
  labelKey: string;
}) {
  return (
    <figure className="chart-card card">
      <figcaption>
        <h2>{title}</h2>
        <p className="card-sub">{sub}</p>
      </figcaption>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey={labelKey} {...AXIS} />
          <YAxis {...AXIS} tickFormatter={(v: number) => `${v}R`} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number) => [fmtR1(v), 'net']}
            cursor={{ fill: 'rgba(232,163,61,0.06)' }}
          />
          <ReferenceLine y={0} stroke={CHART.grid} />
          <Bar dataKey="netR" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={(d.netR as number) >= 0 ? CHART.gain : CHART.loss}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
