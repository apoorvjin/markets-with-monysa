import { useNavigate, useSearch } from "@tanstack/react-router";
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
import { TRADING_TABS, type TradingTab } from "../../router";
import { isActionable, riskReward } from "../../lib/riskReward";

/** The four steps, in the order the work actually happens. Numbering is not
    decoration here — it encodes a real sequence, and the context bar carries
    the chosen symbol forward through it. */
const STEPS = [
  { id: "scan", n: "01", label: "Scan", hint: "Find candidates" },
  { id: "evaluate", n: "02", label: "Evaluate", hint: "Judge the signal" },
  { id: "track", n: "03", label: "Track", hint: "Watch it" },
  { id: "act", n: "04", label: "Act", hint: "Set alerts" },
] as const satisfies readonly { id: TradingTab; n: string; label: string; hint: string }[];

export function TradingPage() {
  const search = useSearch({ from: "/trading" });
  const navigate = useNavigate({ from: "/trading" });
  // Lands on Evaluate, not Scan: a returning trader's job is today's signals,
  // and the step numbers make the entry point legible either way.
  const tab: TradingTab = TRADING_TABS.includes(search.tab as TradingTab)
    ? (search.tab as TradingTab)
    : "evaluate";
  const focus = search.sym ?? null;
  const alerts = useAlerts();

  const go = (next: TradingTab, sym?: string | null) =>
    void navigate({
      search: {
        tab: next === "evaluate" ? undefined : next,
        sym: (sym === undefined ? focus : sym) ?? undefined,
      },
    });

  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">Trading</h1>
      </div>
      <nav className="fn-steps" role="tablist" aria-label="Trading workflow">
        {STEPS.map((st, i) => (
          <div className="fn-step-wrap" key={st.id}>
            <button
              type="button"
              role="tab"
              className="fn-step"
              data-active={tab === st.id ? "true" : "false"}
              data-done={STEPS.findIndex((x) => x.id === tab) > i ? "true" : "false"}
              aria-selected={tab === st.id}
              onClick={() => go(st.id)}
            >
              <span className="fn-step-n" aria-hidden="true">{st.n}</span>
              <span className="fn-step-t">
                {st.label}
                {st.id === "act" && alerts.length > 0 ? ` (${alerts.length})` : ""}
              </span>
              <span className="fn-step-h">{st.hint}</span>
            </button>
            {i < STEPS.length - 1 && <span className="fn-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </nav>
      {/* On focused Evaluate the step renders its own header for the same
          symbol, so the carrying bar would duplicate it (twice over — both
          offered "Open chart"). It stays on Track and Act, where the symbol is
          context rather than the subject. */}
      {!(tab === "evaluate" && focus) && (
        <FocusBar symbol={focus} onClear={() => go(tab, null)} onStep={go} />
      )}
      {tab === "scan" && <ScanStep onEvaluate={(sym) => go("evaluate", sym)} />}
      {tab === "evaluate" && (
        <EvaluateStep
          focus={focus}
          onTrack={(sym) => go("track", sym)}
          onClearFocus={() => go("evaluate", null)}
        />
      )}
      {tab === "track" && <TrackStep />}
      {tab === "act" && <ActStep />}
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

function PowerMovesTab(props: { onEvaluate?: (sym: string) => void }) {
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
                  <th />
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
                    <td className="num">
                      {props.onEvaluate && (
                        <button
                          type="button"
                          className="mt-cat"
                          onClick={() => props.onEvaluate?.(a.symbol)}
                        >
                          Evaluate →
                        </button>
                      )}
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

// ── Funnel: the symbol carried between steps ─────────────────────────────

/** The connective tissue of the workflow. Pick a candidate in Scan and it
    stays with you through Evaluate, Track and Act instead of being re-found
    at every step. Renders nothing until a symbol is chosen. */
function FocusBar(props: {
  symbol: string | null;
  onClear: () => void;
  onStep: (t: TradingTab, sym?: string | null) => void;
}) {
  const navigate = useNavigate();
  const { data } = useQuotes(60_000);
  const symbol = props.symbol;
  if (!symbol) return null;
  const q = data?.quotes.find((x) => x.symbol === symbol);

  return (
    <div className="fn-focus">
      <span className="lbl-mini">Carrying</span>
      <span className="fn-focus-name">
        {q?.flag ? <span aria-hidden="true">{q.flag} </span> : null}
        <strong>{q?.name ?? props.symbol}</strong>{" "}
        <span className="cell-sub">{props.symbol}</span>
      </span>
      {q && (
        <span className="fn-focus-px mono-nums">
          {fmtPrice(q.price, q.currency)}{" "}
          <span className={changeClass(q.changePercent)}>{fmtPct(q.changePercent)}</span>
        </span>
      )}
      <span className="fn-focus-actions">
        <button
          type="button"
          className="mt-cat"
          onClick={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol },
              search: { name: q?.name ?? symbol },
            })
          }
        >
          Open chart
        </button>
        <button type="button" className="mt-cat" onClick={props.onClear}>
          Clear
        </button>
      </span>
    </div>
  );
}

// ── ② Evaluate — the triage queue ────────────────────────────────────────

type QueueSort = "rr" | "confidence" | "name";

/** The heart of the rebuild. The old Signals tab rendered all 49 assets as
    equal rows — roughly three quarters of them HOLD — with no ordering and no
    reward-to-risk, so finding the handful worth acting on meant reading the
    whole sheet. This leads with the actionable ones, ranked. */
function EvaluateStep(props: {
  focus: string | null;
  onTrack: (sym: string) => void;
  onClearFocus: () => void;
}) {
  // Carrying a symbol here means "judge this one". Scoring the other 48 to
  // answer that would be 49 requests against a 60/min limiter for one answer,
  // so the focused case asks a different, cheaper question instead: how do the
  // strategies rate THIS symbol.
  if (props.focus) {
    return (
      <FocusedEvaluation
        symbol={props.focus}
        onTrack={() => props.onTrack(props.focus as string)}
        onClearFocus={props.onClearFocus}
      />
    );
  }
  return <TriageQueue focus={null} onTrack={props.onTrack} />;
}

function TriageQueue(props: { focus: string | null; onTrack: (sym: string) => void }) {
  const isPro = useIsPro();
  const navigate = useNavigate();
  const [type, setType] = useState<string>("ALL");
  const [strategy, setStrategy] = useState(STRATEGIES[0]!);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<QueueSort>("confidence");
  const { data, isLoading, error, refetch } = useQuotes();
  const isAdvanced = Number(strategy.serverParam) >= 4 && !isPro;

  const symbols = useMemo(() => {
    const quotes = data?.quotes ?? [];
    if (strategy.serverParam === "9") return quotes.filter((q) => q.symbol === "SI=F");
    if (type === "ALL") return quotes;
    return quotes.filter((q) => q.category === type);
  }, [data, type, strategy]);

  // One request per asset — 49 of the signals limiter's 60/min budget on a
  // single load, and this step is now the landing tab. A bounded retry with
  // backoff lets a transient 429 recover instead of silently dropping the
  // asset from the queue. The real fix is a batch endpoint; see below.
  const signalQueries = useQueries({
    queries: symbols.map((q) => ({
      queryKey: ["signal", q.symbol, strategy.serverParam],
      queryFn: () => api.getSignal(q.symbol, strategy.serverParam),
      staleTime: 60_000,
      retry: 2,
      retryDelay: (attempt: number) => 1500 * 2 ** attempt,
    })),
  });

  const loadingCount = signalQueries.filter((s) => s.isLoading).length;
  // Never let a failed fetch quietly shrink the actionable count: "7 setups"
  // and "7 setups, 12 unscored" are very different claims to make to someone
  // deciding what to trade.
  const failedCount = signalQueries.filter((s) => s.isError).length;
  const refetchFailed = () =>
    signalQueries.forEach((sq) => {
      if (sq.isError) void sq.refetch();
    });

  const rows = useMemo(() => {
    const merged = symbols.map((q, i) => {
      const sig = signalQueries[i]?.data;
      const entry = sig?.entry ?? q.price ?? null;
      return {
        quote: q,
        signal: sig,
        loading: !!signalQueries[i]?.isLoading,
        rr: riskReward(sig?.direction, entry, sig?.stopLoss, sig?.takeProfit),
        entry,
      };
    });
    // The carried symbol is lifted out of whichever bucket it belongs to and
    // shown first, always. Most scanner hits come back HOLD, so leaving it in
    // `held` meant arriving from Scan and seeing nothing about the very
    // symbol you were sent here to evaluate.
    const pinned = props.focus ? merged.find((r) => r.quote.symbol === props.focus) ?? null : null;
    const rest = pinned ? merged.filter((r) => r !== pinned) : merged;
    const actionable = rest.filter((r) => isActionable(r.signal?.direction));
    const held = rest.filter((r) => !isActionable(r.signal?.direction));
    const rank = (a: typeof merged[number], b: typeof merged[number]) => {
      if (sort === "name") return a.quote.name.localeCompare(b.quote.name);
      if (sort === "rr") return (b.rr ?? 0) - (a.rr ?? 0);
      return (b.signal?.confidence ?? 0) - (a.signal?.confidence ?? 0);
    };
    actionable.sort(rank);
    held.sort(rank);
    // The server currently derives stop and target as fixed bands around
    // entry, so reward-to-risk comes back a constant 2.5 on every signal.
    // Ranking by it would sort on rounding noise, and printing it per row
    // would imply a difference between setups that does not exist — so it is
    // shown once as a property of the strategy instead. This checks at
    // runtime rather than hard-coding the assumption: the moment the bands
    // vary, the per-row column and the sort option come back on their own.
    const seen = new Set(
      actionable.map((r) => (r.rr == null ? "x" : r.rr.toFixed(1))).filter((v) => v !== "x"),
    );
    const rrVaries = seen.size > 1;
    const rrFixed = !rrVaries && actionable.length > 0 ? (actionable.find((r) => r.rr != null)?.rr ?? null) : null;
    return { pinned, actionable, held, rrVaries, rrFixed };
    // signalQueries is a new array each render; its data is captured via symbols+strategy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, strategy, sort, props.focus, loadingCount]);

  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;

  const queue = (
    <div className="tq">
      {rows.actionable.length === 0 && !rows.pinned && !isLoading && loadingCount === 0 && (
        <p className="tq-empty">
          No BUY or SELL signals on {strategy.label} · {strategy.name} right now — every tracked asset is on HOLD.
          <button type="button" className="tq-link" onClick={() => setShowAll(true)}>
            Show all {rows.held.length}
          </button>
        </p>
      )}
      {rows.pinned && (
        <TriageRow
          key={rows.pinned.quote.symbol}
          row={rows.pinned}
          showRr={rows.rrVaries}
          focused
          onOpen={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: rows.pinned!.quote.symbol },
              search: { name: rows.pinned!.quote.name },
            })
          }
          onTrack={() => props.onTrack(rows.pinned!.quote.symbol)}
        />
      )}
      {rows.actionable.map((r) => (
        <TriageRow
          key={r.quote.symbol}
          row={r}
          showRr={rows.rrVaries}
          focused={props.focus === r.quote.symbol}
          onOpen={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: r.quote.symbol },
              search: { name: r.quote.name },
            })
          }
          onTrack={() => props.onTrack(r.quote.symbol)}
        />
      ))}
      {showAll &&
        rows.held.map((r) => (
          <TriageRow
            key={r.quote.symbol}
            row={r}
            muted
            showRr={rows.rrVaries}
            focused={props.focus === r.quote.symbol}
            onOpen={() =>
              void navigate({
                to: "/asset/$symbol",
                params: { symbol: r.quote.symbol },
                search: { name: r.quote.name },
              })
            }
            onTrack={() => props.onTrack(r.quote.symbol)}
          />
        ))}
    </div>
  );

  return (
    <>
      <div className="tq-bar">
        <div className="tq-counts">
          <button
            type="button"
            className="mt-cat"
            data-active={!showAll ? "true" : "false"}
            aria-pressed={!showAll}
            onClick={() => setShowAll(false)}
          >
            Actionable {rows.actionable.length}
          </button>
          <button
            type="button"
            className="mt-cat"
            data-active={showAll ? "true" : "false"}
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
          >
            All {rows.actionable.length + rows.held.length}
          </button>
        </div>
        <label className="tq-select">
          <span className="lbl-mini">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as QueueSort)}>
            <option value="confidence">Confidence</option>
            {rows.rrVaries && <option value="rr">Reward : risk</option>}
            <option value="name">Name</option>
          </select>
        </label>
        {loadingCount > 0 && <span className="cell-sub">Scoring {loadingCount}…</span>}
        {rows.rrFixed != null && (
          <span className="cell-sub tq-rrnote" title="Stop and target are derived as fixed bands around entry, so this ratio is the same for every setup on this strategy.">
            Every setup targets {rows.rrFixed.toFixed(1)} : 1 reward-to-risk
          </span>
        )}
      </div>

      <div className="tq-filters">
        <ChipRow>
          {SIGNAL_TYPES.map((t) => (
            <Chip key={t} label={t} active={type === t} onClick={() => setType(t)} />
          ))}
        </ChipRow>
      </div>
      <div className="tq-filters">
        <ChipRow>
          {STRATEGIES.map((s) => (
            <Chip
              key={s.serverParam}
              label={
                <span className="tq-strat">
                  <span>
                    {s.label}
                    {Number(s.serverParam) >= 4 && !isPro ? " 🔒" : ""}
                  </span>
                  <span className="tq-strat-sub">{s.name}</span>
                </span>
              }
              active={strategy.serverParam === s.serverParam}
              onClick={() => setStrategy(s)}
            />
          ))}
        </ChipRow>
      </div>

      {failedCount > 0 && (
        <p className="tq-warn" role="status">
          Couldn&rsquo;t score {failedCount} of {symbols.length} assets — the count below is
          incomplete.{" "}
          <button type="button" className="tq-link" onClick={refetchFailed}>
            Retry
          </button>
        </p>
      )}

      {isLoading ? (
        <SkeletonList rows={8} height={54} />
      ) : isAdvanced ? (
        <ProBlur positive className="signals-advanced-blur">
          {queue}
        </ProBlur>
      ) : (
        queue
      )}

      {!showAll && rows.held.length > 0 && (
        <p className="tq-foot">
          {rows.held.length} HOLD signals hidden —{" "}
          <button type="button" className="tq-link" onClick={() => setShowAll(true)}>
            show all
          </button>
        </p>
      )}
    </>
  );
}

function TriageRow(props: {
  row: {
    quote: QuoteItem;
    signal?: { direction: string; confidence?: number | null; stopLoss?: number | null; takeProfit?: number | null };
    loading: boolean;
    rr: number | null;
    entry: number | null;
  };
  focused?: boolean;
  muted?: boolean;
  /** Only true when reward-to-risk actually varies between setups. */
  showRr?: boolean;
  onOpen: () => void;
  onTrack: () => void;
}) {
  const { quote: q, signal: sig, rr, entry } = props.row;
  const dir = (sig?.direction ?? "").toUpperCase();
  const watchlist = useWatchlist();
  const watched = watchlist.includes(q.symbol);

  if (props.row.loading) {
    return (
      <div className="tq-row" aria-busy="true">
        <Skeleton height={38} />
      </div>
    );
  }

  return (
    <div
      className="tq-row"
      data-muted={props.muted ? "true" : "false"}
      data-focused={props.focused ? "true" : "false"}
    >
      <SignalBadge direction={sig?.direction} />
      <div className="tq-main">
        <div className="tq-title">
          {q.flag && <span aria-hidden="true">{q.flag}</span>}
          <button type="button" className="tq-name" onClick={props.onOpen}>
            {q.name}
          </button>
          <span className="cell-sub">{q.symbol}</span>
          {sig?.confidence != null && (
            <>
              <span className="tq-meter" aria-hidden="true">
                <i
                  data-dir={dir === "SELL" ? "down" : "up"}
                  style={{ width: `${Math.min(100, Math.max(0, sig.confidence))}%` }}
                />
              </span>
            </>
          )}
        </div>
        <div className="tq-levels mono-nums">
          {fmtPrice(entry, q.currency)} → target{" "}
          <span className="num-up">{fmtPrice(sig?.takeProfit, q.currency)}</span> · stop{" "}
          <span className="num-down">{fmtPrice(sig?.stopLoss, q.currency)}</span>
        </div>
      </div>
      {props.showRr ? (
        <div className="tq-rr">
          <span className="lbl-mini">R : R</span>
          <span className={`tq-rr-v ${rr != null && rr >= 1 ? "num-up" : "num-flat"}`}>
            {rr != null ? rr.toFixed(1) : "—"}
          </span>
        </div>
      ) : (
        <div className="tq-rr">
          <span className="lbl-mini">Conf</span>
          <span className={`tq-rr-v ${dir === "SELL" ? "num-down" : "num-up"}`}>
            {sig?.confidence != null ? `${Math.round(sig.confidence)}%` : "—"}
          </span>
        </div>
      )}
      <div className="tq-actions">
        <button
          type="button"
          className="tq-ico"
          aria-pressed={watched}
          aria-label={watched ? `Remove ${q.name} from watchlist` : `Add ${q.name} to watchlist`}
          title={watched ? "In your watchlist" : "Add to watchlist"}
          onClick={() => toggleWatchlist(q.symbol)}
        >
          {watched ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="tq-ico"
          aria-label={`Carry ${q.name} to Track`}
          title="Carry to Track"
          onClick={props.onTrack}
        >
          →
        </button>
      </div>
    </div>
  );
}

// ── ① Scan — find candidates ─────────────────────────────────────────────

/** Everything that answers "what is worth a look today": the Pine scanner,
    the server's best setups, the historical win-rate leaderboard, and the
    day's movers. All four previously lived on a Dashboard tab that sat
    outside any workflow. */
function ScanStep(props: { onEvaluate: (sym: string) => void }) {
  return (
    <div className="fn-pane">
      <PowerMovesTab onEvaluate={props.onEvaluate} />
      <div className="fn-split">
        <BestSetupsCard />
        <WinRateLeaderboardCard />
      </div>
      <TopMoversCard />
    </div>
  );
}

// ── ③ Track — watch it ───────────────────────────────────────────────────

function TrackStep() {
  return (
    <div className="fn-pane">
      <WatchlistSnapshotCard />
      <InstrumentsTab />
    </div>
  );
}

// ── ④ Act — set alerts ───────────────────────────────────────────────────

function ActStep() {
  return (
    <div className="fn-pane">
      <AlertsTab />
    </div>
  );
}

// ── ② Evaluate, focused on one carried symbol ────────────────────────────

/** One symbol, rated by every strategy the viewer can actually see.
 *
 *  This is the cheap half of the funnel: N strategy calls for one symbol
 *  (3 on free, 9 on Pro) instead of the queue's one call per asset. It also
 *  answers a better question — "do the strategies agree on this?" — than
 *  re-listing 49 assets you did not ask about. */
function FocusedEvaluation(props: {
  symbol: string;
  onTrack: () => void;
  onClearFocus: () => void;
}) {
  const isPro = useIsPro();
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const watched = watchlist.includes(props.symbol);
  const { data: quotes } = useQuotes();
  const quote = quotes?.quotes.find((q) => q.symbol === props.symbol);

  // Base strategies only — the "+" variants are refinements of the same nine,
  // and 18 rows reads as noise. Gated ones are skipped rather than fetched and
  // blurred: no point spending a request on a row the viewer cannot read.
  const visible = useMemo(
    () =>
      STRATEGIES.filter(
        (st) => !st.isEnhanced && (isPro || Number(st.serverParam) <= 3),
      ),
    [isPro],
  );

  const queries = useQueries({
    queries: visible.map((st) => ({
      queryKey: ["signal", props.symbol, st.serverParam],
      queryFn: () => api.getSignal(props.symbol, st.serverParam),
      staleTime: 60_000,
      retry: 2,
      retryDelay: (attempt: number) => 1500 * 2 ** attempt,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const failed = queries.filter((q) => q.isError).length;

  const tally = { BUY: 0, SELL: 0, HOLD: 0 };
  queries.forEach((q) => {
    const d = (q.data?.direction ?? "").toUpperCase();
    if (d === "BUY" || d === "SELL" || d === "HOLD") tally[d] += 1;
  });
  const scored = tally.BUY + tally.SELL + tally.HOLD;
  const lean =
    tally.BUY > tally.SELL && tally.BUY > tally.HOLD
      ? "BUY"
      : tally.SELL > tally.BUY && tally.SELL > tally.HOLD
        ? "SELL"
        : "HOLD";

  return (
    <>
      <div className="fe-head">
        <div>
          <span className="lbl-mini">Evaluating</span>
          <h2 className="fe-title">
            {quote?.flag && <span aria-hidden="true">{quote.flag} </span>}
            {quote?.name ?? props.symbol}{" "}
            <span className="cell-sub">{props.symbol}</span>
          </h2>
        </div>
        {quote && (
          <span className="fe-px mono-nums">
            {fmtPrice(quote.price, quote.currency)}{" "}
            <span className={changeClass(quote.changePercent)}>
              {fmtPct(quote.changePercent)}
            </span>
          </span>
        )}
        <button type="button" className="mt-cat fe-back" onClick={props.onClearFocus}>
          ← Full queue
        </button>
      </div>

      {!loading && scored > 0 && (
        <div className="fe-consensus" data-lean={lean}>
          <SignalBadge direction={lean} />
          <span className="fe-consensus-txt">
            <strong>
              {lean === "HOLD" ? tally.HOLD : lean === "BUY" ? tally.BUY : tally.SELL} of {scored}
            </strong>{" "}
            {visible.length === scored ? "strategies" : "scored strategies"} say {lean}
          </span>
          <span className="fe-tally">
            <span className="num-up">{tally.BUY} buy</span>
            <span className="num-flat">{tally.HOLD} hold</span>
            <span className="num-down">{tally.SELL} sell</span>
          </span>
          {!isPro && (
            <span className="cell-sub fe-note">
              Free tier rates {visible.length} of 9 strategies
            </span>
          )}
        </div>
      )}

      {failed > 0 && (
        <p className="tq-warn" role="status">
          Couldn&rsquo;t score {failed} of {visible.length} strategies.
        </p>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Signal</th>
              <th className="num">Confidence</th>
              <th className="num">Entry</th>
              <th className="num">Stop</th>
              <th className="num">Target</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((st, i) => {
              const q = queries[i];
              const sig = q?.data;
              return (
                <tr key={st.serverParam}>
                  <td>
                    <span className="cell-main">{st.label}</span>{" "}
                    <span className="cell-sub">{st.name}</span>
                  </td>
                  <td>
                    {q?.isLoading ? (
                      <Skeleton width={52} height={18} />
                    ) : (
                      <SignalBadge direction={sig?.direction} />
                    )}
                  </td>
                  <td className="num">
                    {sig?.confidence != null ? `${Math.round(sig.confidence)}%` : "—"}
                  </td>
                  <td className="num">{fmtPrice(sig?.entry ?? quote?.price, quote?.currency)}</td>
                  <td className="num num-down">{fmtPrice(sig?.stopLoss, quote?.currency)}</td>
                  <td className="num num-up">{fmtPrice(sig?.takeProfit, quote?.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="fe-actions">
        <button
          type="button"
          className="mt-cat"
          aria-pressed={watched}
          onClick={() => toggleWatchlist(props.symbol)}
        >
          {watched ? "★ In watchlist" : "☆ Add to watchlist"}
        </button>
        <button
          type="button"
          className="mt-cat"
          onClick={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: props.symbol },
              search: { name: quote?.name ?? props.symbol },
            })
          }
        >
          Open chart
        </button>
        <button type="button" className="mt-cat" data-active="true" onClick={props.onTrack}>
          Track this →
        </button>
      </div>
    </>
  );
}
