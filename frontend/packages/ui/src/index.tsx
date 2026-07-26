import type { CSSProperties, ReactNode } from "react";
import { isFresh, signalTone, timeAgo } from "./format";

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

/** "X ago" freshness banner — mirrors freshness_bar.dart. Shows a pulsing
    live dot when the timestamp is recent (< 90s), matching the marketing
    site's LIVE badge. */
export function FreshnessBar(props: { lastUpdated: string | null | undefined }) {
  const label = timeAgo(props.lastUpdated);
  if (!label) return null;
  return (
    <div className="ui-freshness">
      {isFresh(props.lastUpdated) && <span className="ui-live-dot" aria-hidden="true" />}
      Updated {label}
    </div>
  );
}

/** Blurs children behind a gain/loss-tinted "Upgrade to Pro" overlay.
    Visual-only teaser — web has no purchase flow, so this never unlocks;
    mirrors ProBlurOverlay in the Flutter app (pro_blur_overlay.dart). */
export function ProBlur(props: {
  children: ReactNode;
  positive: boolean;
  className?: string;
  /** Override for tight spaces where "Upgrade to Pro" would clip (e.g. an
      inline metric chip). Defaults to the full phrase. */
  label?: string;
}) {
  return (
    <span className={`pro-blur ${props.className ?? ""}`}>
      <span className="pro-blur-content" aria-hidden="true">
        {props.children}
      </span>
      <span className="pro-blur-overlay" data-tone={props.positive ? "up" : "down"}>
        {props.label ?? "Upgrade to Pro"}
      </span>
    </span>
  );
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
