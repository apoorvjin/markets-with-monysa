import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  defaultVersionForType,
  POWER_MOVES_TYPES,
  STRATEGIES,
  type PowerMovesType,
  type QuoteItem,
  type ScannerAsset,
  type ScannerVersion,
} from "@monysa/contracts";
import {
  Card,
  changeClass,
  Chip,
  ChipRow,
  ErrorView,
  fmtPct,
  fmtPrice,
  FreshnessBar,
  ProBlur,
  SignalBadge,
  Skeleton,
  SkeletonList,
  Stat,
} from "@monysa/ui";
import { api } from "../../lib/api";
import {
  addAlert,
  evaluateAlerts,
  removeAlert,
  useAlerts,
} from "../../lib/alerts";
import { toggleWatchlist, useWatchlist } from "../../lib/watchlist";
import { useIsPro } from "../../lib/session";
import { BestSetupsCard } from "../../components/BestSetupsCard";

const TABS = ["Instruments", "Dashboard", "Power Moves", "Signals", "Alerts"] as const;
type Tab = (typeof TABS)[number];

export function TradingPage() {
  const [tab, setTab] = useState<Tab>("Instruments");
  const alerts = useAlerts();
  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">Trading</h1>
        <ChipRow>
          {TABS.map((t) => (
            <Chip
              key={t}
              label={t === "Alerts" && alerts.length > 0 ? `Alerts (${alerts.length})` : t}
              active={tab === t}
              onClick={() => setTab(t)}
            />
          ))}
        </ChipRow>
      </div>
      {tab === "Instruments" && <InstrumentsTab />}
      {tab === "Dashboard" && <DashboardTab onJumpToPowerMoves={() => setTab("Power Moves")} />}
      {tab === "Power Moves" && <PowerMovesTab />}
      {tab === "Signals" && <SignalsTab />}
      {tab === "Alerts" && <AlertsTab />}
    </div>
  );
}

function useQuotes(refetchMs = 30_000) {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.getQuotes(),
    staleTime: refetchMs,
    refetchInterval: refetchMs,
  });
}

// ── Instruments (no "All" chip — mirrors mobile category order) ──────────

const CATEGORIES = ["★ Watchlist", "Commodities", "Indices", "Stocks", "Forex", "Crypto"] as const;

/** Spot/Futures chip — only for commodities (priceType set); null for index/crypto/forex. */
function PriceTypeTag({ priceType }: { priceType?: "spot" | "futures" | null }) {
  if (!priceType) return null;
  const isSpot = priceType === "spot";
  return (
    <span
      title={isSpot ? "Spot price" : "Front-month futures (trades above spot)"}
      style={{
        marginLeft: 6,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        padding: "1px 5px",
        borderRadius: 100,
        verticalAlign: "middle",
        color: isSpot ? "var(--accent)" : "var(--text-faint)",
        border: `1px solid ${isSpot ? "var(--accent)" : "var(--text-faint)"}`,
        opacity: isSpot ? 1 : 0.7,
      }}
    >
      {isSpot ? "SPOT" : "FUT"}
    </span>
  );
}

function QuoteRows(props: { quotes: QuoteItem[]; watchlist: string[] }) {
  const navigate = useNavigate();
  return (
    <tbody>
      {props.quotes.map((q) => (
        <tr
          key={q.symbol}
          className="clickable"
          onClick={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: q.symbol },
              search: { name: q.name },
            })
          }
        >
          <td
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(q.symbol);
            }}
            style={{
              cursor: "pointer",
              color: props.watchlist.includes(q.symbol)
                ? "var(--warning)"
                : "var(--text-faint)",
            }}
            title="Toggle watchlist"
          >
            {props.watchlist.includes(q.symbol) ? "★" : "☆"}
          </td>
          <td>
            <span style={{ marginRight: 8 }}>{q.flag ?? ""}</span>
            <span className="cell-main">{q.name}</span>{" "}
            <span className="cell-sub">{q.symbol}</span>
            <PriceTypeTag priceType={q.priceType} />
          </td>
          <td className="num cell-main">{fmtPrice(q.price, q.currency)}</td>
          <td className={`num ${changeClass(q.change)}`}>
            {q.change == null ? "—" : q.change.toFixed(2)}
          </td>
          <td className={`num ${changeClass(q.changePercent)}`}>
            {fmtPct(q.changePercent)}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// ── Dashboard (mirrors _DashboardzTab in trading_screen.dart) ─────────────

function DashboardTab(props: { onJumpToPowerMoves: () => void }) {
  return (
    <>
      <WatchlistSnapshotCard />
      <TopMoversCard />
      <RegimeBreadthCard />
      <PowerMovesTeaserCard onJumpToPowerMoves={props.onJumpToPowerMoves} />
      <WinRateLeaderboardCard />
      <BestSetupsCard />
    </>
  );
}

function WinRateLeaderboardCard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["scanner-backtest", "v1", "assets"],
    queryFn: () => api.getScannerBacktest("v1", "assets"),
    staleTime: 24 * 60 * 60_000,
  });

  const top = useMemo(() => {
    const ranked: Array<{ symbol: string; name: string; flag?: string | null; tier: string; winRate1y: number }> = [];
    for (const asset of data?.assets ?? []) {
      let bestTier: string | null = null;
      let bestRate = -1;
      for (const [tier, stats] of Object.entries(asset.bySignalCount)) {
        // Ignore thin samples — a "100% win rate" off 2 events isn't a track record.
        if (stats.events < 5) continue;
        if (stats.winRate1y > bestRate) {
          bestRate = stats.winRate1y;
          bestTier = tier;
        }
      }
      if (bestTier) {
        ranked.push({ symbol: asset.symbol, name: asset.name, flag: asset.flag, tier: bestTier, winRate1y: bestRate });
      }
    }
    return ranked.sort((a, b) => b.winRate1y - a.winRate1y).slice(0, 5);
  }, [data]);

  return (
    <Card>
      <div className="page-header">
        <strong>Win-Rate Leaderboard</strong>
      </div>
      <div className="cell-sub" style={{ marginTop: 2 }}>
        Best 1-year historical win rate — proven track record, not tied to today's signals
      </div>
      {error ? (
        <ErrorView message={(error as Error).message} />
      ) : isLoading || !data ? (
        <SkeletonList rows={3} height={22} />
      ) : top.length === 0 ? (
        <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
          Not enough historical data yet.
        </div>
      ) : (
        <div style={{ marginTop: "var(--s3)" }}>
          {top.map((r) => (
            <div
              key={r.symbol}
              className="clickable"
              style={{ display: "flex", alignItems: "center", gap: "var(--s2)", padding: "6px 0" }}
              onClick={() =>
                void navigate({ to: "/asset/$symbol", params: { symbol: r.symbol }, search: { name: r.name } })
              }
            >
              <span className="cell-main" style={{ flex: 1 }}>
                {r.flag ?? ""} {r.name}
              </span>
              <span className="cell-sub">
                {r.tier} sig{r.tier === "1" ? "" : "s"}
              </span>
              <span className="num num-up" style={{ minWidth: 44 }}>
                {r.winRate1y.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PowerMovesTeaserCard(props: { onJumpToPowerMoves: () => void }) {
  // Fixed to v1/Commodities — matches what a tap-through actually lands on
  // (Power Moves opens on Commodities by default).
  const { data, isLoading, error } = useQuery({
    queryKey: ["scanner", "v1"],
    queryFn: () => api.getScannerAssets("v1"),
    staleTime: 30 * 60_000,
  });

  const hot = useMemo(
    () =>
      (data?.assets ?? [])
        .filter((a) => a.category === "Commodities" && a.signalsActive >= 3)
        .sort((a, b) => b.signalsActive - a.signalsActive),
    [data],
  );

  return (
    <div style={{ cursor: "pointer" }} onClick={props.onJumpToPowerMoves}>
      <Card>
        <div className="page-header">
          <strong>⚡ Power Moves</strong>
          <span className="cell-sub">›</span>
        </div>
        {error ? (
          <ErrorView message={(error as Error).message} />
        ) : isLoading || !data ? (
          <SkeletonList rows={2} height={20} />
        ) : hot.length === 0 ? (
          <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
            No commodities showing 3+ signals right now.
          </div>
        ) : (
          <div style={{ marginTop: "var(--s2)" }}>
            <div className="cell-sub" style={{ marginBottom: "var(--s2)" }}>
              {hot.length} asset{hot.length === 1 ? "" : "s"} showing 3+ signals right now
            </div>
            {hot.slice(0, 3).map((a) => (
              <div key={a.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span className="cell-main">
                  {a.flag ?? ""} {a.name}
                </span>
                <span className="cell-sub">{a.signalsActive} signals</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const REGIME_LABELS: Record<string, string> = {
  quiet_trend: "Quiet Trend",
  quiet_range: "Quiet Range",
  volatile_trend: "Volatile Trend",
  chaotic: "Chaotic",
};

function RegimeBreadthCard() {
  const navigate = useNavigate();
  // Same query key Macro → Dashboard's RegimeSummaryCard uses — shares its
  // cache when both are mounted; server-side cached either way.
  const { data, isLoading, error } = useQuery({
    queryKey: ["regime-summary"],
    queryFn: () => api.getRegimeSummary(),
    staleTime: 10 * 60_000,
  });

  const dominantRegime = useMemo(() => {
    const entries = Object.entries(data?.regimeBreakdown ?? {});
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }, [data]);

  const miniList = (items: NonNullable<typeof data>["topBullish"], tone: "num-up" | "num-down") =>
    items.map((a) => (
      <div
        key={a.symbol}
        className="clickable"
        style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}
        onClick={() =>
          void navigate({ to: "/asset/$symbol", params: { symbol: a.symbol }, search: { name: a.name } })
        }
      >
        <span className="cell-main">
          {a.flag ?? ""} {a.symbol}
        </span>
        <span className={`num ${tone}`}>{a.confidence ?? "—"}%</span>
      </div>
    ));

  return (
    <Card>
      <div className="page-header">
        <strong>Signal Breadth</strong>
      </div>
      {error ? (
        <ErrorView message={(error as Error).message} />
      ) : isLoading || !data ? (
        <SkeletonList rows={2} height={36} />
      ) : (
        <>
          <div className="stat-row" style={{ marginTop: "var(--s3)" }}>
            <Stat label="Bullish" value={data.bullish} valueClassName="num-up" sub={`of ${data.total}`} />
            <Stat label="Neutral" value={data.neutral} sub=" " />
            <Stat label="Bearish" value={data.bearish} valueClassName="num-down" sub=" " />
          </div>
          {dominantRegime && (
            <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
              Regime: {REGIME_LABELS[dominantRegime] ?? dominantRegime}
            </div>
          )}
          {(data.topBullish.length > 0 || data.topBearish.length > 0) && (
            <div className="grid-2" style={{ marginTop: "var(--s3)" }}>
              {data.topBullish.length > 0 && (
                <div>
                  <span className="ui-stat-label">Top buy</span>
                  {miniList(data.topBullish, "num-up")}
                </div>
              )}
              {data.topBearish.length > 0 && (
                <div>
                  <span className="ui-stat-label">Top sell</span>
                  {miniList(data.topBearish, "num-down")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function WatchlistSnapshotCard() {
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const { data, isLoading, error } = useQuotes();

  const rows = useMemo(() => {
    const quotes = data?.quotes ?? [];
    return quotes.filter((q) => watchlist.includes(q.symbol)).slice(0, 6);
  }, [data, watchlist]);

  return (
    <Card>
      <div className="page-header">
        <strong>★ Your Watchlist</strong>
      </div>
      {watchlist.length === 0 ? (
        <div className="cell-sub" style={{ padding: "var(--s3) 0" }}>
          Star assets on the Instruments tab to track them here.
        </div>
      ) : error ? (
        <ErrorView message={(error as Error).message} />
      ) : isLoading || !data ? (
        <SkeletonList rows={3} height={24} />
      ) : rows.length === 0 ? (
        <div className="cell-sub" style={{ padding: "var(--s3) 0" }}>
          Your watchlist symbols aren't in the live feed right now.
        </div>
      ) : (
        <div style={{ marginTop: "var(--s3)" }}>
          {rows.map((q) => (
            <div
              key={q.symbol}
              className="clickable"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s2)",
                padding: "6px 0",
              }}
              onClick={() =>
                void navigate({
                  to: "/asset/$symbol",
                  params: { symbol: q.symbol },
                  search: { name: q.name },
                })
              }
            >
              <span>{q.flag ?? ""}</span>
              <span className="cell-main" style={{ flex: 1 }}>
                {q.name}
              </span>
              <span className="cell-sub">{fmtPrice(q.price, q.currency)}</span>
              <span className={`num ${changeClass(q.changePercent)}`} style={{ minWidth: 64 }}>
                {fmtPct(q.changePercent)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TopMoversCard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuotes();

  const { gainers, losers } = useMemo(() => {
    const ranked = (data?.quotes ?? [])
      .filter((q) => q.changePercent != null)
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    return { gainers: ranked.slice(0, 3), losers: ranked.slice(-3).reverse() };
  }, [data]);

  const moversRow = (q: QuoteItem) => (
    <div
      key={q.symbol}
      className="clickable"
      style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}
      onClick={() =>
        void navigate({ to: "/asset/$symbol", params: { symbol: q.symbol }, search: { name: q.name } })
      }
    >
      <span className="cell-main">{q.symbol}</span>
      <span className={`num ${changeClass(q.changePercent)}`}>{fmtPct(q.changePercent)}</span>
    </div>
  );

  return (
    <Card>
      <div className="page-header">
        <strong>Top Movers</strong>
      </div>
      {error ? (
        <ErrorView message={(error as Error).message} />
      ) : isLoading || !data ? (
        <SkeletonList rows={3} height={24} />
      ) : (
        <div style={{ display: "flex", gap: "var(--s5)", marginTop: "var(--s3)" }}>
          <div style={{ flex: 1 }}>
            <div className="cell-sub" style={{ marginBottom: "var(--s2)" }}>
              GAINERS
            </div>
            {gainers.map(moversRow)}
          </div>
          <div style={{ flex: 1 }}>
            <div className="cell-sub" style={{ marginBottom: "var(--s2)" }}>
              LOSERS
            </div>
            {losers.map(moversRow)}
          </div>
        </div>
      )}
    </Card>
  );
}

function InstrumentsTab() {
  const [category, setCategory] = useState<string>("Commodities");
  const watchlist = useWatchlist();
  const { data, isLoading, error, refetch } = useQuotes();

  const rows = useMemo(() => {
    const quotes = data?.quotes ?? [];
    if (category === "★ Watchlist")
      return quotes.filter((q) => watchlist.includes(q.symbol));
    return quotes.filter((q) => q.category === category);
  }, [data, category, watchlist]);

  return (
    <>
      <div className="toolbar">
        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
          ))}
        </ChipRow>
        <FreshnessBar lastUpdated={data?.timestamp} />
      </div>
      {category === "Stocks" ? (
        <StocksSearchView />
      ) : error ? (
        <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonList rows={12} />
      ) : rows.length === 0 && category === "★ Watchlist" ? (
        <Card>
          <div className="cell-sub">
            Your watchlist is empty — tap ☆ on any instrument to add it.
          </div>
        </Card>
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: "72vh" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th />
                <th>Asset</th>
                <th className="num">Price</th>
                <th className="num">Change</th>
                <th className="num">Change %</th>
              </tr>
            </thead>
            <QuoteRows quotes={rows} watchlist={watchlist} />
          </table>
        </div>
      )}
    </>
  );
}

function StocksSearchView() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  return (
    <>
      <input
        className="search-input"
        style={{ width: "100%", maxWidth: 480 }}
        placeholder="Search any stock by name or symbol…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {debounced.length < 2 ? (
        <Card>
          <div className="cell-sub">Type at least 2 characters to search global equities.</div>
        </Card>
      ) : isFetching && !data ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <tbody>
              {(data?.results ?? []).map((r) => (
                <tr
                  key={`${r.symbol}-${r.exchange ?? ""}`}
                  className="clickable"
                  onClick={() =>
                    void navigate({
                      to: "/asset/$symbol",
                      params: { symbol: r.symbol },
                      search: { name: r.name },
                    })
                  }
                >
                  <td className="cell-main">{r.symbol}</td>
                  <td>{r.name}</td>
                  <td className="cell-sub">{r.exchange ?? ""}</td>
                  <td className="cell-sub">{r.type ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Power Moves (10X scanner; version auto-select mirrors mobile) ─────────

const VERSION_CHIPS: Array<{
  version: ScannerVersion;
  label: string;
  enabledFor: PowerMovesType[];
}> = [
  { version: "v1", label: "Early Setup", enabledFor: ["Commodities"] },
  { version: "v2", label: "Confirmed Breakout", enabledFor: ["Commodities"] },
  { version: "v3", label: "Index Regime", enabledFor: ["Indices"] },
  { version: "v3c", label: "Commodity Cycle", enabledFor: ["Commodities"] },
  { version: "v3f", label: "FX Range Breakout", enabledFor: ["Forex"] },
  { version: "v3crypto", label: "Crypto Breakout", enabledFor: ["Crypto"] },
];

const V12_SIGNALS: Array<{ key: keyof ScannerAsset; label: string }> = [
  { key: "volumeSpike", label: "Vol spike" },
  { key: "volumeGreen", label: "Vol green" },
  { key: "heartbeat", label: "Heartbeat" },
  { key: "nearBreakout", label: "Breakout" },
  { key: "recordQuarter", label: "Record Q" },
  { key: "trendUp", label: "Trend up" },
];

const V3_SIGNALS: Array<{ key: keyof ScannerAsset; label: string }> = [
  { key: "thrust", label: "Thrust" },
  { key: "base", label: "Base" },
  { key: "uptrend", label: "Uptrend" },
  { key: "newHighReclaim", label: "New-high reclaim" },
  { key: "regimeBreakout", label: "Regime breakout" },
];

function PowerMovesTab() {
  const [type, setType] = useState<PowerMovesType>("Indices");
  const [version, setVersion] = useState<ScannerVersion>("v3");
  const [minSignals, setMinSignals] = useState(0);

  const onType = (t: PowerMovesType) => {
    setType(t);
    setMinSignals(0);
    setVersion(defaultVersionForType(t));
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["scanner", version],
    queryFn: () => api.getScannerAssets(version),
    staleTime: 30 * 60_000,
  });

  const signalDefs = version === "v1" || version === "v2" ? V12_SIGNALS : V3_SIGNALS;

  const rows = useMemo(() => {
    let assets = data?.assets ?? [];
    // v1/v2 endpoints return all 49 assets — filter to the selected category;
    // v3 endpoints are already per-category.
    if (version === "v1" || version === "v2")
      assets = assets.filter((a) => a.category === type);
    return assets
      .filter((a) => a.signalsActive >= minSignals)
      .sort((a, b) => b.signalsActive - a.signalsActive);
  }, [data, version, type, minSignals]);

  return (
    <>
      <div className="toolbar">
        <ChipRow>
          {POWER_MOVES_TYPES.map((t) => (
            <Chip key={t} label={t} active={type === t} onClick={() => onType(t)} />
          ))}
        </ChipRow>
      </div>
      <div className="toolbar">
        <ChipRow>
          {VERSION_CHIPS.filter((v) => v.enabledFor.includes(type)).map((v) => (
            <Chip
              key={v.version}
              label={v.label}
              active={version === v.version}
              onClick={() => setVersion(v.version)}
            />
          ))}
        </ChipRow>
        <ChipRow>
          {[0, 1, 2, 3].map((n) => (
            <Chip
              key={n}
              label={n === 0 ? "All" : `${n}+ signals`}
              active={minSignals === n}
              onClick={() => setMinSignals(n)}
            />
          ))}
        </ChipRow>
      </div>
      {error ? (
        <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonList rows={10} />
      ) : (
        <>
          <FreshnessBar lastUpdated={data.lastUpdated} />
          <div className="tbl-wrap" style={{ maxHeight: "66vh" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Price</th>
                  <th className="num">1D %</th>
                  <th className="num">Vol ratio</th>
                  <th className="num">Active</th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.symbol}>
                    <td>
                      <span style={{ marginRight: 6 }}>{a.flag ?? ""}</span>
                      <span className="cell-main">{a.name}</span>{" "}
                      <span className="cell-sub">{a.symbol}</span>
                    </td>
                    <td className="num">{fmtPrice(a.price)}</td>
                    <td className={`num ${changeClass(a.changePercent)}`}>
                      {fmtPct(a.changePercent)}
                    </td>
                    <td className="num">
                      {a.volumeRatio != null ? `${a.volumeRatio.toFixed(2)}×` : "—"}
                    </td>
                    <td className="num cell-main">{a.signalsActive}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {signalDefs
                          .filter((s) => a[s.key] === true)
                          .map((s) => (
                            <span key={String(s.key)} className="ui-badge" data-tone="buy">
                              {s.label}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ── Signals (S1–S9; S9 = Silver only) ─────────────────────────────────────

const SIGNAL_TYPES = ["ALL", "Commodities", "Indices", "Forex", "Crypto"] as const;

function SignalsTab() {
  const isPro = useIsPro();
  const [type, setType] = useState<string>("ALL");
  const [strategy, setStrategy] = useState(STRATEGIES[0]!);
  const { data, isLoading, error, refetch } = useQuotes();
  // Mobile locks any strategy with serverParam >= 4 (S4–S9 base + all S1+–S9+
  // enhanced) behind `signals_advanced`. Chips stay clickable; for free users
  // the result table renders as a blurred teaser, Pro users see it in full.
  const isAdvanced = Number(strategy.serverParam) >= 4 && !isPro;

  const symbols = useMemo(() => {
    const quotes = data?.quotes ?? [];
    if (strategy.serverParam === "9")
      return quotes.filter((q) => q.symbol === "SI=F");
    if (type === "ALL") return quotes;
    return quotes.filter((q) => q.category === type);
  }, [data, type, strategy]);

  const signalQueries = useQueries({
    queries: symbols.map((q) => ({
      queryKey: ["signal", q.symbol, strategy.serverParam],
      queryFn: () => api.getSignal(q.symbol, strategy.serverParam),
      staleTime: 60_000,
      retry: 0,
    })),
  });

  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;

  const table = (
    <table className="tbl">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Signal</th>
          <th className="num">Confidence</th>
          <th className="num">Entry</th>
          <th className="num">Stop</th>
          <th className="num">Target</th>
        </tr>
      </thead>
      <tbody>
        {symbols.map((q, i) => {
          const sq = signalQueries[i];
          const sig = sq?.data;
          return <SignalRow key={q.symbol} quote={q} loading={!!sq?.isLoading} signal={sig} />;
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="toolbar">
        <ChipRow>
          {SIGNAL_TYPES.map((t) => (
            <Chip key={t} label={t} active={type === t} onClick={() => setType(t)} />
          ))}
        </ChipRow>
        <ChipRow>
          {STRATEGIES.map((s) => (
            <Chip
              key={s.serverParam}
              label={
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.12, gap: 1 }}>
                  <span>{Number(s.serverParam) >= 4 ? `${s.label} 🔒` : s.label}</span>
                  <span style={{ fontSize: "0.72em", fontWeight: 400, opacity: 0.66 }}>{s.name}</span>
                </span>
              }
              active={strategy.serverParam === s.serverParam}
              onClick={() => setStrategy(s)}
            />
          ))}
        </ChipRow>
      </div>
      {strategy.serverParam === "9" && (
        <div className="cell-sub">
          S9 Silver Liquidity Sweep — optimised for Silver (SI=F) intraday only.
        </div>
      )}
      {isAdvanced && (
        <div className="cell-sub">S4–S9 and enhanced (+) strategies require Pro.</div>
      )}
      {isLoading || !data ? (
        <SkeletonList rows={12} />
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
          {isAdvanced ? (
            <ProBlur positive={true} className="signals-advanced-blur">
              {table}
            </ProBlur>
          ) : (
            table
          )}
        </div>
      )}
    </>
  );
}

function SignalRow(props: {
  quote: QuoteItem;
  loading: boolean;
  signal?: { direction: string; confidence?: number | null; entry?: number | null; stopLoss?: number | null; takeProfit?: number | null };
}) {
  const navigate = useNavigate();
  const { quote: q, signal: sig } = props;
  return (
    <tr
      className="clickable"
      onClick={() =>
        void navigate({ to: "/asset/$symbol", params: { symbol: q.symbol }, search: { name: q.name } })
      }
    >
      <td>
        <span style={{ marginRight: 8 }}>{q.flag ?? ""}</span>
        <span className="cell-main">{q.name}</span>{" "}
        <span className="cell-sub">{q.symbol}</span>
      </td>
      <td>{props.loading ? <Skeleton width={52} height={18} /> : <SignalBadge direction={sig?.direction} />}</td>
      <td className="num">
        {sig?.confidence != null ? `${Math.round(sig.confidence)}%` : "—"}
      </td>
      <td className="num">{fmtPrice(sig?.entry)}</td>
      <td className="num num-down">{fmtPrice(sig?.stopLoss)}</td>
      <td className="num num-up">{fmtPrice(sig?.takeProfit)}</td>
    </tr>
  );
}

// ── Alerts (localStorage, evaluated against 10s-polled quotes) ────────────

// Free-tier cap — mirrors RemoteConfigService.alertLimitFree's default ('3')
// in moby/lib/services/remote_config_service.dart. Web has no remote config
// or auth, so every visitor gets the free default.
const FREE_ALERT_LIMIT = 3;

function AlertsTab() {
  const isPro = useIsPro();
  const alerts = useAlerts();
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  // Pro (`alerts_unlimited`) lifts the free-tier cap.
  const limitReached = !isPro && alerts.length >= FREE_ALERT_LIMIT;

  // 10s polling while the tab is open — mirrors mobile alert_provider
  const { data } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.getQuotes(),
    staleTime: 10_000,
    refetchInterval: alerts.some((a) => !a.triggered) ? 10_000 : false,
  });

  useEffect(() => {
    if (!data) return;
    const prices = new Map(data.quotes.map((q) => [q.symbol, q.price]));
    evaluateAlerts(prices);
  }, [data]);

  const quotes = data?.quotes ?? [];
  const priceOf = (sym: string) => quotes.find((q) => q.symbol === sym)?.price;

  const submit = () => {
    if (limitReached) return;
    const target = Number(price);
    const q = quotes.find((x) => x.symbol === symbol);
    if (!q || !Number.isFinite(target) || target <= 0) return;
    addAlert({ symbol: q.symbol, name: q.name, targetPrice: target, direction });
    setPrice("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
      <Card>
        <strong>New price alert</strong>
        <div className="toolbar" style={{ marginTop: "var(--s4)" }}>
          <select
            className="search-input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            <option value="">Select asset…</option>
            {quotes.map((q) => (
              <option key={q.symbol} value={q.symbol}>
                {q.name} ({q.symbol})
              </option>
            ))}
          </select>
          <select
            className="search-input"
            style={{ minWidth: 100 }}
            value={direction}
            onChange={(e) => setDirection(e.target.value as "above" | "below")}
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input
            className="search-input"
            style={{ minWidth: 120 }}
            placeholder="Target price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            type="button"
            className="ui-chip"
            data-active="true"
            onClick={submit}
            disabled={!symbol || !price || limitReached}
          >
            Add alert
          </button>
        </div>
        {symbol && !limitReached && (
          <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
            Current price: {fmtPrice(priceOf(symbol))}
          </div>
        )}
        {limitReached && (
          <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
            Free tier is limited to {FREE_ALERT_LIMIT} alerts — remove one to add another.
          </div>
        )}
      </Card>
      {alerts.length === 0 ? (
        <Card>
          <div className="cell-sub">No alerts yet — create one above. Alerts are checked every 10 seconds while the app is open.</div>
        </Card>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Condition</th>
                <th className="num">Current</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="cell-main">{a.name}</span>{" "}
                    <span className="cell-sub">{a.symbol}</span>
                  </td>
                  <td>
                    {a.direction === "above" ? "≥" : "≤"} {fmtPrice(a.targetPrice)}
                  </td>
                  <td className="num">{fmtPrice(priceOf(a.symbol))}</td>
                  <td>
                    <span className="ui-badge" data-tone={a.triggered ? "buy" : "neutral"}>
                      {a.triggered ? "TRIGGERED" : "WATCHING"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="ui-chip" onClick={() => removeAlert(a.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
