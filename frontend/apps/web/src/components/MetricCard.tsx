interface MetricCardProps {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
}

export function MetricCard({ label, value, delta, sub }: MetricCardProps) {
  const dir =
    delta == null || !Number.isFinite(delta)
      ? "flat"
      : delta > 0
        ? "up"
        : delta < 0
          ? "down"
          : "flat";

  return (
    <div className="ui-metric-card">
      <div className="ui-metric-label">{label}</div>
      <div className="ui-metric-value">{value}</div>
      <div className="ui-metric-footer">
        {delta != null && Number.isFinite(delta) && (
          <span className="ui-delta-badge" data-dir={dir}>
            {dir === "up" ? "▲" : dir === "down" ? "▼" : ""}
            {Math.abs(delta).toFixed(2)}%
          </span>
        )}
        {sub && (
          <span className="ui-stat-sub">{sub}</span>
        )}
      </div>
    </div>
  );
}
