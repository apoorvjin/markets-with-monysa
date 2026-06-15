import { useQuery } from "@tanstack/react-query";
import { DonutRingChart, type DonutSegment } from "@monysa/charts";
import { ErrorView, FreshnessBar, fmtPrice, fmtPct, SkeletonList } from "@monysa/ui";
import { api } from "../lib/api";
import { MetricCard } from "./MetricCard";
import { HoldingsTable } from "./HoldingsTable";
import { MoversCard, type MoverItem } from "./MoversCard";

const SECTOR_COLORS = [
  "#00d4aa",
  "#6366f1",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

function fearGreedColor(value: number): string {
  if (value < 25) return "var(--danger)";
  if (value < 45) return "var(--warning)";
  if (value < 55) return "var(--text-secondary)";
  return "var(--positive)";
}

export function DashboardGrid() {
  const indicesQ = useQuery({
    queryKey: ["futures", "indices"],
    queryFn: () => api.getIndices(),
    staleTime: 10 * 60_000,
  });
  const sectorsQ = useQuery({
    queryKey: ["sectors"],
    queryFn: () => api.getSectors(),
    staleTime: 15 * 60_000,
  });
  const fearGreedQ = useQuery({
    queryKey: ["fear-greed"],
    queryFn: () => api.getFearGreed(),
    staleTime: 30 * 60_000,
  });
  const bondsQ = useQuery({
    queryKey: ["bonds"],
    queryFn: () => api.getBonds(),
    staleTime: 30 * 60_000,
  });

  const indices = indicesQ.data?.items ?? [];
  const sectors = sectorsQ.data?.sectors ?? [];

  // Key indices for metric cards
  const sp500 = indices.find(
    (i) => i.name.toLowerCase().includes("s&p") || i.symbol === "^GSPC",
  );
  const nasdaq = indices.find(
    (i) =>
      i.name.toLowerCase().includes("nasdaq") || i.symbol === "^NDX" || i.symbol === "NQ=F",
  );
  const dow = indices.find(
    (i) =>
      i.name.toLowerCase().includes("dow") ||
      i.name.toLowerCase().includes("djia") ||
      i.symbol === "^DJI",
  );

  // Fallback: use first 3 indices if named ones aren't found
  const metric1 = sp500 ?? indices[0];
  const metric2 = nasdaq ?? indices[1];
  const metric3 = dow ?? indices[2];

  // Sort indices for movers
  const sorted = [...indices]
    .filter((i) => i.changePercent != null)
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));

  const gainers: MoverItem[] = sorted.slice(0, 5).map((i) => ({
    symbol: i.symbol,
    name: i.name,
    change: i.changePercent ?? 0,
  }));
  const losers: MoverItem[] = sorted
    .slice(-5)
    .reverse()
    .map((i) => ({
      symbol: i.symbol,
      name: i.name,
      change: i.changePercent ?? 0,
    }));

  // Top 8 for holdings table — only include items that have a price
  const top8 = indices.filter((i) => i.price != null).slice(0, 8);

  // Donut segments from sectors (equal-weighted visually, 1D change as sublabel)
  const donutSegments: DonutSegment[] = sectors.slice(0, 11).map((s, i) => ({
    label: s.name.replace(" Sector", "").replace(" sector", ""),
    value: 1,
    color: SECTOR_COLORS[i % SECTOR_COLORS.length] as string,
    sublabel:
      s.changePercent != null
        ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(1)}%`
        : undefined,
  }));

  const fg = fearGreedQ.data;
  const bonds = bondsQ.data;

  if (indicesQ.error) {
    return (
      <ErrorView
        message={(indicesQ.error as Error).message}
        onRetry={() => void indicesQ.refetch()}
      />
    );
  }

  const isLoading = indicesQ.isLoading;

  return (
    <div className="dash-grid">
      {/* ── Left column ─────────────────────────────────────────────── */}
      <div className="dash-left">
        {/* Breadcrumb selector */}
        <div className="selector-card">
          <div className="selector-breadcrumb">
            All Markets <strong>/ Indices</strong>
          </div>
          <span className="selector-chevron">›</span>
        </div>

        {/* 3 metric cards */}
        {isLoading ? (
          <SkeletonList rows={3} height={88} />
        ) : (
          <>
            {metric1 && (
              <MetricCard
                label={metric1.name}
                value={fmtPrice(metric1.price, metric1.currency ?? null)}
                delta={metric1.changePercent}
              />
            )}
            {metric2 && (
              <MetricCard
                label={metric2.name}
                value={fmtPrice(metric2.price, metric2.currency ?? null)}
                delta={metric2.changePercent}
              />
            )}
            {metric3 && (
              <MetricCard
                label={metric3.name}
                value={fmtPrice(metric3.price, metric3.currency ?? null)}
                delta={metric3.changePercent}
              />
            )}
          </>
        )}

        {/* Donut ring — sector allocation */}
        {sectorsQ.isLoading ? (
          <SkeletonList rows={1} height={260} />
        ) : donutSegments.length > 0 ? (
          <DonutRingChart
            segments={donutSegments}
            centerLabel="Sectors"
            centerValue={`${donutSegments.length}`}
            size={210}
            strokeWidth={26}
          />
        ) : null}

        {/* Top gainers */}
        {gainers.length > 0 && (
          <MoversCard title="Top Gainers" items={gainers} />
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="dash-right">
        {/* Performance chips — bonds + fear & greed */}
        <div className="perf-chips">
          <div className="perf-chip">
            <div className="perf-chip-label">10Y Yield</div>
            <div className="perf-chip-value" style={{ color: "var(--text-primary)" }}>
              {bonds ? `${bonds.us10y.toFixed(2)}%` : "—"}
            </div>
            <div className="perf-chip-sub">
              {bonds?.curveStatus ?? "Yield Curve"}
            </div>
          </div>
          <div className="perf-chip">
            <div className="perf-chip-label">Fear &amp; Greed</div>
            <div
              className="perf-chip-value"
              style={{
                color: fg ? fearGreedColor(fg.value) : "var(--text-primary)",
              }}
            >
              {fg ? Math.round(fg.value) : "—"}
            </div>
            <div className="perf-chip-sub">
              {fg?.classification ?? "CNN Index"}
            </div>
          </div>
          <div className="perf-chip">
            <div className="perf-chip-label">30Y Yield</div>
            <div className="perf-chip-value" style={{ color: "var(--text-primary)" }}>
              {bonds ? `${bonds.us30y.toFixed(2)}%` : "—"}
            </div>
            <div className="perf-chip-sub">
              {bonds
                ? bonds.spread3m10y >= 0
                  ? `+${bonds.spread3m10y.toFixed(0)}bps spread`
                  : `${bonds.spread3m10y.toFixed(0)}bps spread`
                : "US Treasury"}
            </div>
          </div>
        </div>

        {/* Holdings table */}
        {isLoading ? (
          <SkeletonList rows={8} height={44} />
        ) : top8.length > 0 ? (
          <HoldingsTable items={top8} />
        ) : null}

        {/* Freshness */}
        <FreshnessBar lastUpdated={indicesQ.data?.lastUpdated} />

        {/* Top losers */}
        {losers.length > 0 && (
          <MoversCard title="Top Losers" items={losers} />
        )}
      </div>
    </div>
  );
}
