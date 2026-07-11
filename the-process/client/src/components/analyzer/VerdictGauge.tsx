/**
 * Verdict gauge (spec §6.7): a semicircular dial from "lean short"
 * through "no edge" to "lean long", with the needle at the score's
 * position. Pure SVG.
 */
export function VerdictGauge({ gauge, label }: { gauge: number; label: string }) {
  // Map gauge −1…+1 to an angle across the semicircle (180° → 0°).
  const angle = Math.PI * (1 - (gauge + 1) / 2);
  const cx = 130;
  const cy = 120;
  const r = 96;
  const nx = cx + r * 0.82 * Math.cos(angle);
  const ny = cy - r * 0.82 * Math.sin(angle);

  const arc = (from: number, to: number, color: string, key: string) => {
    const a1 = Math.PI * (1 - (from + 1) / 2);
    const a2 = Math.PI * (1 - (to + 1) / 2);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    return (
      <path
        key={key}
        d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="butt"
        opacity={0.8}
      />
    );
  };

  return (
    <figure className="gauge">
      <svg viewBox="0 0 260 140" role="img" aria-label={`Verdict: ${label}`}>
        {arc(-1, -0.28, 'var(--loss)', 'short')}
        {arc(-0.28, 0.28, 'var(--caution)', 'neutral')}
        {arc(0.28, 1, 'var(--gain)', 'long')}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={5} fill="var(--text)" />
        <text x={20} y={136} className="gauge-label">lean short</text>
        <text x={cx} y={16} textAnchor="middle" className="gauge-label">no edge</text>
        <text x={240} y={136} textAnchor="end" className="gauge-label">lean long</text>
      </svg>
      <figcaption className="gauge-verdict">{label}</figcaption>
    </figure>
  );
}
