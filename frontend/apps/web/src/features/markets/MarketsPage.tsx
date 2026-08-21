import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  effectiveMarketCap,
  TREEMAP_INDICES,
  TREEMAP_REGIONS,
  TREEMAP_TIMEFRAMES,
  type TreemapIndexParam,
  type TreemapTimeframe,
  type TreemapStock,
} from "@monysa/contracts";
import { CanvasTreemap, tileColor } from "@monysa/charts";
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
import { useIsPro } from "../../lib/session";
import { MarketTable } from "../../components/MarketTable";
import { OverviewTab } from "./OverviewTab";
import { MARKET_TABS, type MarketTab } from "../../router";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "heatmap", label: "Heatmap" },
  { id: "indices", label: "Indices" },
  { id: "commodities", label: "Commodities" },
  { id: "forex", label: "Forex" },
  { id: "cftc", label: "CFTC" },
] as const satisfies readonly { id: MarketTab; label: string }[];

const TF_LABEL: Record<TreemapTimeframe, string> = {
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  ytd: "YTD",
};

export function MarketsPage() {
  // Tab state lives in the URL (?tab=), not useState — so a tab can be linked,
  // survives a refresh, and the browser back button steps between tabs.
  const search = useSearch({ from: "/markets" });
  const navigate = useNavigate({ from: "/markets" });
  // Normalise here as well as in validateSearch: an unrecognised ?tab= would
  // otherwise render Overview's content while lighting up no tab at all, so
  // the indicator and the content could disagree. Sub-tabs below do the same.
  const tab: MarketTab = MARKET_TABS.includes(search.tab as MarketTab)
    ? (search.tab as MarketTab)
    : "overview";
  // Switching top-level tab drops the previous tab's sub-state — carrying a
  // stale ?cot= onto the Heatmap would be meaningless.
  const setTab = (next: MarketTab) =>
    void navigate({ search: { tab: next === "overview" ? undefined : next } });

  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">Markets</h1>
      </div>
      <nav className="mk-tabs" role="tablist" aria-label="Markets sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="mk-tab"
            data-active={tab === t.id ? "true" : "false"}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab />}
      {tab === "heatmap" && <TreemapTab />}
      {tab === "indices" && <FuturesTab kind="indices" />}
      {tab === "commodities" && <FuturesTab kind="commodities" />}
      {tab === "forex" && <FuturesTab kind="forex" />}
      {tab === "cftc" && <CftcTab />}
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

// Not a COT category — CFTC has no jurisdiction outside US-regulated
// exchanges, so this is a different metric (NSE cash-market FII/DII net
// flows) kept in its own chip rather than folded into the table above.
const REGIONAL_FLOWS_KEY = "regionalFlows" as const;

/** What the COT table actually is. "Net position" and "Long %" are jargon that
    the numbers alone never explain, and CFTC's US-only scope is a recurring
    question the data itself can't answer. */
function CotInfo() {
  const [open, setOpen] = useState(false);
  return {
    button: (
      <button
        type="button"
        className="splc-info-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        What is this?
      </button>
    ),
    panel: open ? (
      <div className="splc-info">
        <p>
          <strong>Where the big speculative money is positioned.</strong> Every Friday the CFTC
          publishes how many futures contracts each type of trader holds. These rows show the
          managed-money side — hedge funds and CTAs — as of the report date below.
        </p>
        <ul>
          <li>
            <strong>Long / Short</strong> — contracts held betting the price rises / falls.
          </li>
          <li>
            <strong>Net position</strong> — long minus short. Positive means funds are net bullish.
          </li>
          <li>
            <strong>Wk net Δ</strong> — how that net figure moved since the previous week, which is
            often more informative than the level itself.
          </li>
        </ul>
        <p className="splc-info-caveat">
          The CFTC only regulates US exchanges, so there is no COT data for Eurex, HKEX, NSE or ASX
          contracts — Nikkei 225 appears only because CME dual-lists it. Reports lag by a few days
          and cover positions as of the prior Tuesday, so this is positioning, not a live feed.
          "Regional Flows" is a different dataset entirely: NSE India cash-market buying and
          selling, not futures positioning.
        </p>
      </div>
    ) : null,
  };
}

type CotGroupKey = (typeof COT_GROUPS)[number][0] | typeof REGIONAL_FLOWS_KEY;
const COT_KEYS: readonly string[] = [...COT_GROUPS.map(([k]) => k), REGIONAL_FLOWS_KEY];

function CftcTab() {
  const isPro = useIsPro();
  const search = useSearch({ from: "/markets" });
  const navigate = useNavigate();
  const group: CotGroupKey = COT_KEYS.includes(search.cot ?? "")
    ? (search.cot as CotGroupKey)
    : "metals";
  const setGroup = (next: CotGroupKey) =>
    void navigate({
      to: "/markets",
      search: { ...search, cot: next === "metals" ? undefined : next },
    });
  const info = CotInfo();
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
      <div className="cot-head">
        <ChipRow>
        {COT_GROUPS.map(([key, label]) => (
          <Chip key={key} label={label} active={group === key} onClick={() => setGroup(key)} />
        ))}
          <Chip
            label="Regional Flows"
            active={group === REGIONAL_FLOWS_KEY}
            onClick={() => setGroup(REGIONAL_FLOWS_KEY)}
          />
        </ChipRow>
        {info.button}
      </div>
      {info.panel}
      {group === REGIONAL_FLOWS_KEY && <RegionalFlowsPanel groups={data.regionalFlows ?? []} />}
      {group !== REGIONAL_FLOWS_KEY &&
        COT_GROUPS.filter(([key]) => key === group).map(([key, label]) => {
        const rows = data[key];
        if (!rows || rows.length === 0) {
          return (
            <p key={key} className="cell-sub" style={{ marginTop: "var(--s4)" }}>
              No data available
            </p>
          );
        }
        return (
          <div key={key}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th className="num">Long</th>
                    <th className="num">Short</th>
                    <th className="num">Net position</th>
                    <th>Positioning</th>
                    <th className="num">Wk net Δ</th>
                    <th>Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, i) => {
                    // Pro users see every row in full; free users see only the
                    // first row and a blurred compact teaser for the rest.
                    if (i === 0 || isPro) {
                      return (
                        <tr key={m.name}>
                          <td>
                            <span style={{ marginRight: 6 }}>{m.emoji ?? ""}</span>
                            <span className="cell-main">{m.name}</span>
                          </td>
                          <td className="num num-up">
                            {m.longContracts?.toLocaleString("en-US") ?? "—"}
                          </td>
                          <td className="num num-down">
                            {m.shortContracts?.toLocaleString("en-US") ?? "—"}
                          </td>
                          <td className={`num ${changeClass(m.netPosition)}`}>
                            {m.netPosition?.toLocaleString("en-US") ?? "—"}
                          </td>
                          <td>
                            {m.longPct == null ? (
                              "—"
                            ) : (
                              <span
                                className="cot-pos"
                                title={`${m.longPct.toFixed(1)}% long / ${(100 - m.longPct).toFixed(1)}% short`}
                              >
                                <span className="cot-bar" aria-hidden="true">
                                  <span className="cot-bar-long" style={{ flex: m.longPct }} />
                                  <span
                                    className="cot-bar-short"
                                    style={{ flex: 100 - m.longPct }}
                                  />
                                </span>
                                <span className="cot-pos-num">
                                  {m.longPct.toFixed(0)}% long
                                </span>
                              </span>
                            )}
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
                        </tr>
                      );
                    }
                    return (
                      <tr key={m.name}>
                        <td colSpan={7} style={{ padding: "var(--s2) 0" }}>
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
            {data.reportDate && (
              <p className="cell-sub" style={{ marginTop: "var(--s3)" }}>
                CFTC report date: {data.reportDate.slice(0, 10)}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

// Different metric from the COT table above (cash-market net buy/sell, not
// futures long/short positioning) — rendered as cards, not the COT `<table>`,
// so the shape difference stays visually obvious rather than implied.
function RegionalFlowsPanel({ groups }: { groups: import("@monysa/contracts").RegionalFlowGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="cell-sub" style={{ marginTop: "var(--s3)" }}>
        No regional flow data available right now.
      </p>
    );
  }
  return (
    <div style={{ marginTop: "var(--s3)", display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      {groups.map((g) => (
        <div key={g.region} className="ui-card" style={{ padding: "var(--s4)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s2)" }}>
            <strong>
              {g.flag ?? ""} {g.region} — {g.market}
            </strong>
            <span className="cell-sub">{g.date ?? "—"}</span>
          </div>
          <div className="tbl-wrap" style={{ marginTop: "var(--s3)" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th className="num">Buy ({g.unit})</th>
                  <th className="num">Sell ({g.unit})</th>
                  <th className="num">Net ({g.unit})</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => (
                  <tr key={item.category}>
                    <td>
                      <span className="cell-main">{item.label}</span>
                      <span className="cell-sub" style={{ marginLeft: 6 }}>
                        ({item.category})
                      </span>
                    </td>
                    <td className="num">{item.buyValue.toLocaleString("en-US")}</td>
                    <td className="num">{item.sellValue.toLocaleString("en-US")}</td>
                    <td className={`num ${changeClass(item.netValue)}`}>
                      {item.netValue >= 0 ? "+" : ""}
                      {item.netValue.toLocaleString("en-US")} · {item.netBias}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {g.source && (
            <p className="cell-sub" style={{ marginTop: "var(--s2)" }}>
              Source: {g.source}
            </p>
          )}
        </div>
      ))}
    </div>
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

// Data-driven session pill for the treemap payload's own `marketState` — not
// the nav's MarketStatus widget, which derives global exchange hours from the
// clock. Mirrors _MarketStatusPill in treemap_tab.dart, including which states
// count as "live": only PRE (4:00–9:30am) and POST (4:00–8:00pm) are real
// sessions — PREPRE and POSTPOST have no trading and read as Closed.
const MARKET_STATE_STYLES: Record<
  string,
  { label: string; color: string; pulse: boolean }
> = {
  REGULAR: { label: "Live", color: "#22C55E", pulse: true },
  PRE: { label: "Pre-market", color: "#F59E0B", pulse: true },
  POST: { label: "After-hours", color: "#60A5FA", pulse: true },
  // Server-synthesised: the 8pm–4am ET Blue Ocean session, only present when
  // live overnight prices exist (US indices).
  OVERNIGHT: { label: "Overnight", color: "#818CF8", pulse: true },
};

function MarketStatePill(props: { state: string | null | undefined }) {
  const s =
    MARKET_STATE_STYLES[props.state ?? ""] ??
    ({ label: "Closed", color: "#EF4444", pulse: false } as const);
  return (
    <span
      className="mkt-state"
      data-pulse={s.pulse ? "true" : "false"}
      style={{ "--mkt-state-color": s.color } as React.CSSProperties}
    >
      <span className="mkt-state-dot" aria-hidden="true" />
      Market Status: {s.label}
    </span>
  );
}

// Swatches come from the chart's own tileColor(), not copied hexes — mobile's
// legend uses SectorTreemap's palette, which is a different scale from the
// ±3%-clamped diverging ramp CanvasTreemap paints here.
const HEATMAP_LEGEND = [
  [-3, "Down 3% or more"],
  [-1.5, "Down up to 3%"],
  [0, "Roughly flat"],
  [1.5, "Up to 3%"],
  [3, "Up 3% or more"],
] as const;

/** Toggle + panel, mirroring _showInfo's bottom sheet on mobile. Tile colour
    has no meaning without the scale, so the legend ships next to the chart. */
function HeatmapInfo() {
  const [open, setOpen] = useState(false);
  return {
    button: (
      <button
        type="button"
        className="splc-info-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        What is this?
      </button>
    ),
    panel: open ? (
      <div className="splc-info">
        <p>
          <strong>Stocks shown as tiles.</strong> Tile size = market capitalisation in USD. For
          non-US indices, market caps are converted to USD using live FX rates so cross-index tile
          sizes are comparable. Tile colour = the selected timeframe's % change.
        </p>
        <div className="heatmap-legend">
          {HEATMAP_LEGEND.map(([change, label]) => (
            <span className="heatmap-legend-row" key={label}>
              <span
                className="heatmap-legend-swatch"
                style={{ background: tileColor(change) }}
              />
              {label}
            </span>
          ))}
        </div>
        <p>
          <strong>Live data.</strong> Constituents refresh daily. Prices and market caps refresh
          every five minutes from Yahoo Finance during market hours.
        </p>
        <p>Click a tile to open its detail page, or a sector heading to drill into that sector.</p>
      </div>
    ) : null,
  };
}

// Live pre/post-market change (vs the regular close) for the active session, or
// null outside extended hours. Mirrors mobile's sessionDeltaPct.
function sessionDelta(
  marketState: string | null | undefined,
  s: TreemapStock,
): number | null {
  if (marketState === "OVERNIGHT") return s.overnightChangePercent ?? null;
  if (marketState === "PRE" || marketState === "PREPRE")
    return s.preMarketChangePercent ?? null;
  if (marketState === "POST" || marketState === "POSTPOST")
    return s.postMarketChangePercent ?? null;
  return null;
}

function TreemapTab() {
  const navigate = useNavigate();
  const isPro = useIsPro();
  const search = useSearch({ from: "/markets" });
  const index: TreemapIndexParam = TREEMAP_INDICES.some((i) => i.param === search.index)
    ? (search.index as TreemapIndexParam)
    : "sp500";
  const timeframe: TreemapTimeframe = TREEMAP_TIMEFRAMES.includes(
    search.tf as TreemapTimeframe,
  )
    ? (search.tf as TreemapTimeframe)
    : "1d";
  const setIndex = (next: TreemapIndexParam) =>
    void navigate({
      to: "/markets",
      search: { ...search, index: next === "sp500" ? undefined : next },
    });
  const setTimeframe = (next: TreemapTimeframe) =>
    void navigate({
      to: "/markets",
      search: { ...search, tf: next === "1d" ? undefined : next },
    });
  const [focusedSector, setFocusedSector] = useState<string | null>(null);
  const info = HeatmapInfo();

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
    extraChange: sessionDelta(data?.marketState, s),
    sublabel: `${s.name} · ${s.sector ?? "—"} · ${fmtCompact(effectiveMarketCap(s))}`,
    group: s.sector ?? "Other",
    buySignal: s.buyVolumeSignal ?? false,
  }));

  return (
    <>
      <div className="hm-regions">
        {TREEMAP_REGIONS.map((region) => {
          const inRegion = TREEMAP_INDICES.filter((i) => i.region === region);
          if (inRegion.length === 0) return null;
          return (
            <div className="hm-region" key={region}>
              <span className="hm-region-label">{region}</span>
              <div className="hm-region-chips">
                {inRegion.map((i) => (
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
              </div>
            </div>
          );
        })}
      </div>
      <div className="toolbar">
        <ChipRow>
          {TREEMAP_TIMEFRAMES.map((tf) => (
            <Chip
              key={tf}
              label={tf === "1d" || isPro ? TF_LABEL[tf] : `🔒 ${TF_LABEL[tf]}`}
              active={timeframe === tf}
              onClick={() => setTimeframe(tf)}
            />
          ))}
        </ChipRow>
        <MarketStatePill state={data?.marketState} />
        <FreshnessBar lastUpdated={data?.lastUpdated} />
        {/* Flags a short map: fewer names came back than the 500 requested,
            because Yahoo could not resolve every constituent. Same condition
            the Flutter header uses (stocks.length < the requested limit) —
            `total` is itself the resolved count, so comparing against it
            would never fire. */}
        {data != null &&
          data.limit != null &&
          data.stocks.length < data.limit && (
            <span className="cell-sub">
              Showing {data.stocks.length} of {data.total ?? data.stocks.length} resolved
            </span>
          )}
        {data != null && data.stocks.length > 0 && (
          <span className="hm-breadth">
            <span className="num-up">
              {data.stocks.filter((s) => (s.changePercent ?? 0) > 0).length}
            </span>
            <span className="cell-sub">advancing</span>
            <span className="num-down">
              {data.stocks.filter((s) => (s.changePercent ?? 0) < 0).length}
            </span>
            <span className="cell-sub">declining</span>
          </span>
        )}
        {info.button}
      </div>
      {info.panel}
      {!focusedSector && data != null && data.stocks.length > 0 && (
        <p className="hm-hint">
          Click a sector heading to focus it, or a tile to open that company.
        </p>
      )}
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
          {timeframe !== "1d" && !isPro ? (
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
      <MarketTable items={data.items} kind={props.kind} />
    </>
  );
}
