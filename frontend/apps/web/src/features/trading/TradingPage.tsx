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
  SignalBadge,
  Skeleton,
  SkeletonList,
} from "@monysa/ui";
import { api } from "../../lib/api";
import {
  addAlert,
  evaluateAlerts,
  removeAlert,
  useAlerts,
} from "../../lib/alerts";
import { toggleWatchlist, useWatchlist } from "../../lib/watchlist";
import { BestSetupsCard } from "../../components/BestSetupsCard";

const TABS = ["Instruments", "Dashboard", "Power Moves", "Signals", "Alerts"] as const;
type Tab = (typeof TABS)[number];

export function TradingPage() {
  const [tab, setTab] = useState<Tab>("Instruments");
  const alerts = useAlerts();
  return (
    <div className="page">
      <div className="page-header">
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
      {tab === "Dashboard" && <BestSetupsCard />}
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
  { version: "v1", label: "v1 Original", enabledFor: ["Commodities"] },
  { version: "v2", label: "v2 Pine-Aligned", enabledFor: ["Commodities"] },
  { version: "v3", label: "v3 Super Pine", enabledFor: ["Indices"] },
  { version: "v3c", label: "v3 Pine Commodities", enabledFor: ["Commodities"] },
  { version: "v3f", label: "v3 Pine Forex", enabledFor: ["Forex"] },
  { version: "v3crypto", label: "v3 Pine Crypto", enabledFor: ["Crypto"] },
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
  const [type, setType] = useState<string>("ALL");
  const [strategy, setStrategy] = useState(STRATEGIES[0]!);
  const { data, isLoading, error, refetch } = useQuotes();

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
              label={s.label}
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
      {isLoading || !data ? (
        <SkeletonList rows={12} />
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
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
                return (
                  <SignalRow key={q.symbol} quote={q} loading={!!sq?.isLoading} signal={sig} />
                );
              })}
            </tbody>
          </table>
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

function AlertsTab() {
  const alerts = useAlerts();
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

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
            disabled={!symbol || !price}
          >
            Add alert
          </button>
        </div>
        {symbol && (
          <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
            Current price: {fmtPrice(priceOf(symbol))}
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
