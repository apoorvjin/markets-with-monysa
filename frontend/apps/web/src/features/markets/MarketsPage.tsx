import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  effectiveMarketCap,
  TREEMAP_INDICES,
  TREEMAP_TIMEFRAMES,
  type TreemapIndexParam,
  type TreemapTimeframe,
} from "@monysa/contracts";
import { CanvasTreemap } from "@monysa/charts";
import {
  changeClass,
  Chip,
  ChipRow,
  ErrorView,
  fmtCompact,
  FreshnessBar,
  ProBlur,
  Skeleton,
  SkeletonList,
} from "@monysa/ui";
import { api } from "../../lib/api";
import { MarketTable } from "../../components/MarketTable";
import { DashboardGrid } from "../../components/DashboardGrid";

const TABS = ["Dashboard", "Heatmap", "Indices", "Commodities", "Forex", "CFTC"] as const;
type Tab = (typeof TABS)[number];

const TF_LABEL: Record<TreemapTimeframe, string> = {
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  ytd: "YTD",
};

export function MarketsPage() {
  const [tab, setTab] = useState<Tab>("Dashboard");

  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">Markets</h1>
        <ChipRow>
          {TABS.map((t) => (
            <Chip key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
          ))}
        </ChipRow>
      </div>
      {tab === "Dashboard" && <DashboardGrid />}
      {tab === "Heatmap" && <TreemapTab />}
      {tab === "Indices" && <FuturesTab kind="indices" />}
      {tab === "Commodities" && <FuturesTab kind="commodities" />}
      {tab === "Forex" && <FuturesTab kind="forex" />}
      {tab === "CFTC" && <CftcTab />}
    </div>
  );
}

const COT_GROUPS = [
  ["metals", "Metals"],
  ["energy", "Energy"],
  ["indicesRates", "Indices & Rates"],
  ["agriculture", "Agriculture"],
  ["currencies", "Currencies"],
] as const;

function CftcTab() {
  const [group, setGroup] = useState<(typeof COT_GROUPS)[number][0]>("metals");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cot-metals"],
    queryFn: () => api.getCotMetals(),
    staleTime: 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={12} />;
  return (
    <>
      <ChipRow>
        {COT_GROUPS.map(([key, label]) => (
          <Chip key={key} label={label} active={group === key} onClick={() => setGroup(key)} />
        ))}
      </ChipRow>
      {COT_GROUPS.filter(([key]) => key === group).map(([key, label]) => {
        const rows = data[key];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={key}>
            <strong>{label}</strong>
            <div className="tbl-wrap" style={{ marginTop: "var(--s3)" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th className="num">Net position</th>
                    <th className="num">Long %</th>
                    <th className="num">Wk net Δ</th>
                    <th>Sentiment</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, i) => {
                    if (i === 0) {
                      return (
                        <tr key={m.name}>
                          <td>
                            <span style={{ marginRight: 6 }}>{m.emoji ?? ""}</span>
                            <span className="cell-main">{m.name}</span>
                          </td>
                          <td className={`num ${changeClass(m.netPosition)}`}>
                            {m.netPosition?.toLocaleString("en-US") ?? "—"}
                          </td>
                          <td className="num">
                            {m.longPct != null ? `${m.longPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className={`num ${changeClass(m.weekNetChange)}`}>
                            {m.weekNetChange?.toLocaleString("en-US") ?? "—"}
                          </td>
                          <td>
                            <span
                              className="ui-badge"
                              data-tone={
                                (m.sentiment ?? "").toLowerCase().includes("bull")
                                  ? "buy"
                                  : (m.sentiment ?? "").toLowerCase().includes("bear")
                                    ? "sell"
                                    : "hold"
                              }
                            >
                              {m.sentiment ?? "—"}
                            </span>
                            {m.usdBias && (
                              <span className="cell-sub" style={{ marginLeft: 8 }}>
                                USD {m.usdBias}
                              </span>
                            )}
                          </td>
                          <td className="cell-sub">{m.reportDate ?? "—"}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={m.name}>
                        <td colSpan={6} style={{ padding: "var(--s2) 0" }}>
                          <ProBlur positive={(m.netPosition ?? 0) >= 0} className="cftc-row-blur">
                            <span style={{ marginRight: 6 }}>{m.emoji ?? ""}</span>
                            <span className="cell-main">{m.name}</span>
                            <span className="cell-sub" style={{ marginLeft: 10 }}>
                              net {m.netPosition?.toLocaleString("en-US") ?? "—"} · long{" "}
                              {m.longPct != null ? `${m.longPct.toFixed(1)}%` : "—"} ·{" "}
                              {m.sentiment ?? "—"}
                            </span>
                          </ProBlur>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Loosely mimics a squarified treemap mosaic (varied tile sizes stacked in
// rows) so the loading state doesn't jump-cut into a completely different
// shape once data arrives — a generic row-list skeleton reads nothing like
// the eventual tile grid. Total height roughly matches CanvasTreemap's own
// height={620} so the page doesn't visibly resize when data loads.
function TreemapSkeleton() {
  const rows: { height: number; flexes: number[] }[] = [
    { height: 200, flexes: [3, 2] },
    { height: 140, flexes: [1, 1, 1, 1] },
    { height: 160, flexes: [2, 1, 2] },
    { height: 100, flexes: [1, 1, 1, 1, 1] },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          {row.flexes.map((flex, j) => (
            <div key={j} style={{ flex }}>
              <Skeleton height={row.height} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TreemapTab() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<TreemapIndexParam>("sp500");
  const [timeframe, setTimeframe] = useState<TreemapTimeframe>("1d");
  const [focusedSector, setFocusedSector] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["treemap", index, timeframe],
    queryFn: () => api.getTreemap(index, timeframe, 500),
    staleTime: 5 * 60_000,
  });

  const stocks = focusedSector
    ? (data?.stocks ?? []).filter((s) => (s.sector ?? "Other") === focusedSector)
    : (data?.stocks ?? []);

  const totalCap = stocks.reduce((a, s) => a + effectiveMarketCap(s), 0);
  const weightedAvg =
    stocks.reduce((a, s) => a + (s.changePercent ?? 0) * effectiveMarketCap(s), 0) /
    (totalCap === 0 ? 1 : totalCap);

  const treemapData = stocks.map((s) => ({
    id: s.symbol,
    label: s.symbol,
    value: effectiveMarketCap(s),
    change: s.changePercent ?? 0,
    sublabel: `${s.name} · ${s.sector ?? "—"} · ${fmtCompact(effectiveMarketCap(s))}`,
    group: s.sector ?? "Other",
    buySignal: s.buyVolumeSignal ?? false,
  }));

  return (
    <>
      <ChipRow>
        {TREEMAP_INDICES.map((i) => (
          <Chip
            key={i.param}
            label={i.label}
            active={index === i.param}
            onClick={() => {
              setIndex(i.param);
              setFocusedSector(null);
            }}
          />
        ))}
      </ChipRow>
      <div className="toolbar">
        <ChipRow>
          {TREEMAP_TIMEFRAMES.map((tf) => (
            <Chip
              key={tf}
              label={tf === "1d" ? TF_LABEL[tf] : `🔒 ${TF_LABEL[tf]}`}
              active={timeframe === tf}
              onClick={() => setTimeframe(tf)}
            />
          ))}
        </ChipRow>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {focusedSector && (
        <div className="toolbar">
          <ChipRow>
            <Chip label="← All sectors" active={false} onClick={() => setFocusedSector(null)} />
          </ChipRow>
          <span>
            <strong>{focusedSector}</strong>{" "}
            <span className="cell-sub">
              {stocks.length} stocks · avg{" "}
              <span className={changeClass(weightedAvg)}>
                {weightedAvg >= 0 ? "+" : ""}
                {weightedAvg.toFixed(2)}%
              </span>
            </span>
          </span>
        </div>
      )}
      {error ? (
        <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <TreemapSkeleton />
      ) : (
        <>
          {timeframe !== "1d" ? (
            <ProBlur positive={weightedAvg >= 0} className="treemap-blur">
              <CanvasTreemap height={620} data={treemapData} />
            </ProBlur>
          ) : (
            <CanvasTreemap
              height={620}
              data={treemapData}
              onGroupSelect={focusedSector ? undefined : (g) => setFocusedSector(g)}
              onSelect={(d) => {
                if (d) {
                  void navigate({
                    to: "/asset/$symbol",
                    params: { symbol: d.id },
                    search: { name: d.sublabel?.split(" · ")[0] ?? d.id },
                  });
                }
              }}
            />
          )}
          {timeframe === "1d" && (
            <div className="cell-sub" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  border: "2px solid #FFC107",
                }}
              />
              Gold ring = strong buying volume (last 30 min)
            </div>
          )}
        </>
      )}
    </>
  );
}

function FuturesTab(props: { kind: "indices" | "commodities" | "forex" }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["futures", props.kind],
    queryFn: () =>
      props.kind === "indices"
        ? api.getIndices()
        : props.kind === "commodities"
          ? api.getCommodities()
          : api.getForex(),
    staleTime: 10 * 60_000,
  });

  if (error) {
    return (
      <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
    );
  }
  if (isLoading || !data) return <SkeletonList rows={12} />;
  return (
    <>
      <FreshnessBar lastUpdated={data.lastUpdated} />
      <MarketTable items={data.items} isForex={props.kind === "forex"} />
    </>
  );
}
