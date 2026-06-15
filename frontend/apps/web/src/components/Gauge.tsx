/** Semi-circular gauge (VIX / Fear & Greed / stress meter). */
export function Gauge(props: {
  value: number;
  min: number;
  max: number;
  label: string;
  sub?: string;
  /** stop colors low→high, defaults green→amber→red */
  invert?: boolean;
}) {
  const { value, min, max } = props;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = Math.PI * (1 - t); // π (left) → 0 (right)
  const cx = 90;
  const cy = 80;
  const r = 64;
  const nx = cx + r * 0.78 * Math.cos(angle);
  const ny = cy - r * 0.78 * Math.sin(angle);
  const low = props.invert ? "var(--danger)" : "var(--positive)";
  const high = props.invert ? "var(--positive)" : "var(--danger)";
  const arc = (a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={180} height={96} viewBox="0 0 180 96">
        <path d={arc(Math.PI, Math.PI * 0.66)} stroke={low} strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={arc(Math.PI * 0.64, Math.PI * 0.36)} stroke="var(--warning)" strokeWidth={10} fill="none" />
        <path d={arc(Math.PI * 0.34, 0)} stroke={high} strokeWidth={10} fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-primary)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="var(--text-primary)" />
      </svg>
      <span className="ui-stat-value">{Number.isFinite(value) ? value.toFixed(value >= 100 ? 0 : 1) : "—"}</span>
      <span className="ui-stat-label">{props.label}</span>
      {props.sub && <span className="ui-stat-sub">{props.sub}</span>}
    </div>
  );
}
