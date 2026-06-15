import type { CSSProperties, ReactNode } from "react";
import { signalTone, timeAgo } from "./format";

export * from "./format";

export function Card(props: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`ui-card ${props.className ?? ""}`} style={props.style}>
      {props.children}
    </div>
  );
}

export function Chip(props: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-chip"
      data-active={props.active ? "true" : "false"}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export function ChipRow(props: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
      {props.children}
    </div>
  );
}

/** BUY / SELL / HOLD colored chip — mirrors signal_badge.dart. */
export function SignalBadge(props: { direction: string | null | undefined }) {
  const tone = signalTone(props.direction);
  return (
    <span className="ui-badge" data-tone={tone}>
      {(props.direction ?? "—").toUpperCase()}
    </span>
  );
}

export function Skeleton(props: { height?: number; width?: string | number }) {
  return (
    <div
      className="ui-skeleton"
      style={{ height: props.height ?? 16, width: props.width ?? "100%" }}
    />
  );
}

export function SkeletonList(props: { rows?: number; height?: number }) {
  const rows = props.rows ?? 8;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={props.height ?? 40} />
      ))}
    </div>
  );
}

export function Stat(props: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-label">{props.label}</span>
      <span className={`ui-stat-value ${props.valueClassName ?? ""}`}>
        {props.value}
      </span>
      {props.sub != null && <span className="ui-stat-sub">{props.sub}</span>}
    </div>
  );
}

/** "X ago" freshness banner — mirrors freshness_bar.dart. */
export function FreshnessBar(props: { lastUpdated: string | null | undefined }) {
  const label = timeAgo(props.lastUpdated);
  if (!label) return null;
  return <div className="ui-freshness">Updated {label}</div>;
}

export function ErrorView(props: { message?: string; onRetry?: () => void }) {
  return (
    <div className="ui-error">
      <div>{props.message ?? "Something went wrong."}</div>
      {props.onRetry && (
        <button type="button" onClick={props.onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
