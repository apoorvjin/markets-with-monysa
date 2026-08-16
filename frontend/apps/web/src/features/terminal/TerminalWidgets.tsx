import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type {
  ChartRange,
  CotItem,
  InstitutionalFlowAsset,
  InstitutionalFlowType,
  QuoteItem,
  TreemapIndexParam,
  TreemapStock,
  WireItem,
} from "@monysa/contracts";
import {
  effectiveMarketCap,
  INSTITUTIONAL_FLOW_TYPES,
  TREEMAP_INDICES,
  WIRE_DESKS,
} from "@monysa/contracts";
import { CandlestickChart, CanvasTreemap, MultiLineChart } from "@monysa/charts";
import { fmtCompact, fmtPct, fmtPrice, SignalBadge, timeAgo } from "@monysa/ui";
import { Gauge } from "../../components/Gauge";
import { api } from "../../lib/api";
import { setFocusedSymbol, useFocusedSymbol } from "../../lib/focus";
import { toggleWatchlist, useWatchlist } from "../../lib/watchlist";
import type { PanelType } from "../../lib/terminalLayout";

const DEFAULT_FOCUS = { symbol: "AAPL", name: "Apple Inc." };
const CATEGORY_ORDER = ["Indices", "Commodities", "Forex", "Crypto", "Stocks"] as const;

/* ── Shared bits ───────────────────────────────────────────────────────── */

function useQuotesMap() {
  const { data } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.getQuotes(),
    refetchInterval: 30_000,
  });
  const quotes = data?.quotes ?? [];
  const map = new Map(quotes.map((q) => [q.symbol, q]));
  return { quotes, map };
}

/** A compact quote row that flashes on tick and calls onSelect (→ focus). */
function QuoteRow({ q, onSelect }: { q: QuoteItem; onSelect: () => void }) {
  const prev = useRef(q.price);
  const [flash, setFlash] = useState<"up" | "dn" | null>(null);
  useEffect(() => {
    if (q.price !== prev.current) {
      setFlash(q.price > prev.current ? "up" : "dn");
      prev.current = q.price;
      const t = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(t);
    }
  }, [q.price]);
  const chg = q.changePercent ?? null;
  const dir = chg == null ? "flat" : chg >= 0 ? "up" : "dn";
  return (
    <div
      className={`fbt-row${flash ? ` flash-${flash}` : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="fbt-row-sym">
        {q.symbol}
        <span>{q.name}</span>
      </span>
      <span className="fbt-row-px">{fmtPrice(q.price, q.currency)}</span>
      <span className={`fbt-row-chg ${dir}`}>{chg == null ? "—" : fmtPct(chg)}</span>
    </div>
  );
}

function Chips<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="fbt-w-chips">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="fbt-w-chip"
          data-active={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Watchlist (shared by the widget and the rail) ─────────────────────── */

export function WatchlistList({ removable = false }: { removable?: boolean }) {
  const symbols = useWatchlist();
  const { map } = useQuotesMap();

  if (symbols.length === 0) {
    return (
      <div className="fbt-w-empty">
        No symbols yet. Star any quote, or add via ⌘K.
      </div>
    );
  }
  return (
    <div className="fbt-rows">
      {symbols.map((sym) => {
        const q = map.get(sym);
        const name = q?.name ?? sym;
        const chg = q?.changePercent ?? null;
        const dir = chg == null ? "flat" : chg >= 0 ? "up" : "dn";
        return (
          <div
            key={sym}
            className="fbt-row fbt-wl-row"
            role="button"
            tabIndex={0}
            onClick={() => setFocusedSymbol(sym, name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFocusedSymbol(sym, name);
              }
            }}
          >
            <span className="fbt-row-sym">
              {sym}
              <span>{name}</span>
            </span>
            <span className="fbt-row-px">{q ? fmtPrice(q.price, q.currency) : "—"}</span>
            <span className={`fbt-row-chg ${dir}`}>{chg == null ? "—" : fmtPct(chg)}</span>
            {removable && (
              <button
                type="button"
                className="fbt-wl-x"
                aria-label={`Remove ${sym}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWatchlist(sym);
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WatchlistWidget() {
  return <WatchlistList removable />;
}

/* ── Chart (follows focused symbol) ────────────────────────────────────── */

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
];

function ChartWidget() {
  const navigate = useNavigate();
  const focus = useFocusedSymbol() ?? DEFAULT_FOCUS;
  const [range, setRange] = useState<ChartRange>("3mo");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chart", focus.symbol, range],
    queryFn: () => api.getChart(focus.symbol, range),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="fbt-w-chart">
      <div className="fbt-w-bar">
        <button
          type="button"
          className="fbt-w-sym"
          onClick={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: focus.symbol },
              search: { name: focus.name },
            })
          }
          title="Open full asset view"
        >
          {focus.symbol} <span>{focus.name}</span> ↗
        </button>
        <Chips options={RANGES} value={range} onChange={setRange} />
      </div>
      <div className="fbt-w-chartbody">
        {isLoading ? (
          <div className="fbt-w-loading">Loading chart…</div>
        ) : isError || !data ? (
          <div className="fbt-w-empty">Chart unavailable for {focus.symbol}.</div>
        ) : (
          <CandlestickChart candles={data.candles} height={260} withVwap />
        )}
      </div>
    </div>
  );
}

/* ── Movers ────────────────────────────────────────────────────────────── */

const MOVER_INDICES: { value: TreemapIndexParam; label: string }[] = TREEMAP_INDICES.map((i) => ({
  value: i.param,
  label: i.label,
}));

function MoverList({ title, rows }: { title: string; rows: TreemapStock[] }) {
  return (
    <div className="fbt-w-sub">
      <div className="fbt-w-subhead">{title}</div>
      <div className="fbt-rows">
        {rows.slice(0, 6).map((s) => {
          const chg = s.changePercent ?? 0;
          const dir = chg >= 0 ? "up" : "dn";
          return (
            <div
              key={s.symbol}
              className="fbt-row"
              role="button"
              tabIndex={0}
              onClick={() => setFocusedSymbol(s.symbol, s.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFocusedSymbol(s.symbol, s.name);
                }
              }}
            >
              <span className="fbt-row-sym">
                {s.symbol}
                <span>{s.name}</span>
              </span>
              <span className="fbt-row-px">{fmtPrice(s.price, s.nativeCurrency)}</span>
              <span className={`fbt-row-chg ${dir}`}>{fmtPct(chg)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoversWidget() {
  const [index, setIndex] = useState<TreemapIndexParam>("sp500");
  const { data, isLoading } = useQuery({
    queryKey: ["movers", index],
    queryFn: () => api.getMovers(index),
    staleTime: 60_000,
  });
  return (
    <div className="fbt-w-scroll">
      <Chips options={MOVER_INDICES} value={index} onChange={setIndex} />
      {isLoading && !data ? (
        <div className="fbt-w-loading">Loading movers…</div>
      ) : (
        <>
          <MoverList title="Gainers" rows={data?.gainers ?? []} />
          <MoverList title="Losers" rows={data?.losers ?? []} />
        </>
      )}
    </div>
  );
}

/* ── Treemap ───────────────────────────────────────────────────────────── */

const TREEMAP_CHIPS = TREEMAP_INDICES.map((i) => ({
  value: i.param,
  label: i.label,
}));

function TreemapWidget() {
  const [index, setIndex] = useState<TreemapIndexParam>("sp500");
  const { data, isLoading } = useQuery({
    queryKey: ["treemap", index, "1d"],
    queryFn: () => api.getTreemap(index, "1d", 500),
    staleTime: 5 * 60_000,
  });
  const stocks = data?.stocks ?? [];
  const treemapData = stocks.map((s) => ({
    id: s.symbol,
    label: s.symbol,
    value: effectiveMarketCap(s),
    change: s.changePercent ?? 0,
    sublabel: `${s.name} · ${fmtCompact(effectiveMarketCap(s))}`,
    group: s.sector ?? "Other",
  }));
  return (
    <div className="fbt-w-chart">
      <div className="fbt-w-bar">
        <Chips options={TREEMAP_CHIPS} value={index} onChange={setIndex} />
      </div>
      <div className="fbt-w-chartbody">
        {isLoading && !data ? (
          <div className="fbt-w-loading">Loading heatmap…</div>
        ) : treemapData.length === 0 ? (
          <div className="fbt-w-empty">No data.</div>
        ) : (
          <CanvasTreemap
            height={300}
            data={treemapData}
            onSelect={(d) => d && setFocusedSymbol(d.id, d.label)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Market Board (all categories, click → focus) ──────────────────────── */

function QuotesWidget() {
  const { quotes } = useQuotesMap();
  if (quotes.length === 0) {
    return <div className="fbt-w-loading">Connecting to feeds…</div>;
  }
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: quotes.filter((q) => q.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="fbt-w-scroll">
      {groups.map((g) => (
        <div className="fbt-w-sub" key={g.cat}>
          <div className="fbt-w-subhead">
            {g.cat}
            <span>{g.rows.length}</span>
          </div>
          <div className="fbt-rows">
            {g.rows.map((q) => (
              <QuoteRow key={q.symbol} q={q} onSelect={() => setFocusedSymbol(q.symbol, q.name)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Macro (VIX + Fear & Greed gauges) ─────────────────────────────────── */

function MacroWidget() {
  const vol = useQuery({
    queryKey: ["volatility"],
    queryFn: () => api.getVolatilityAssets(),
    staleTime: 5 * 60_000,
  });
  const fg = useQuery({
    queryKey: ["feargreed"],
    queryFn: () => api.getFearGreed(),
    staleTime: 5 * 60_000,
  });
  const vix = vol.data?.vix?.price;

  if (vix == null && !fg.data) {
    return <div className="fbt-w-loading">Loading macro…</div>;
  }
  return (
    <div className="fbt-w-macro">
      {vix != null && (
        <Gauge
          value={vix}
          min={10}
          max={50}
          label="VIX"
          sub={vol.data?.vix?.bandLabel ?? vol.data?.vix?.band ?? ""}
        />
      )}
      {fg.data && <Gauge value={fg.data.value} min={0} max={100} label="Fear & Greed" />}
    </div>
  );
}

/* ── Correlation heatmap grid ──────────────────────────────────────────── */

function corrBg(v: number): string {
  const a = Math.min(Math.abs(v), 1) * 0.62;
  return v >= 0 ? `rgba(0,212,170,${a})` : `rgba(255,77,106,${a})`;
}

function CorrelationWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["correlation"],
    queryFn: () => api.getCorrelation(),
    staleTime: 5 * 60_000,
  });
  if (isLoading && !data) return <div className="fbt-w-loading">Loading correlations…</div>;
  const syms = data?.symbols ?? [];
  const m = data?.matrix ?? [];
  if (syms.length === 0) return <div className="fbt-w-empty">No correlation data.</div>;
  return (
    <div className="fbt-w-corr">
      <table className="fbt-corr">
        <thead>
          <tr>
            <th />
            {syms.map((s) => (
              <th key={s.symbol} title={s.name}>
                {s.symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {syms.map((s, i) => (
            <tr key={s.symbol}>
              <th title={s.name}>{s.symbol}</th>
              {syms.map((c2, j) => {
                const v = m[i]?.[j] ?? 0;
                return (
                  <td
                    key={c2.symbol}
                    style={{ background: corrBg(v) }}
                    title={`${s.symbol} / ${c2.symbol}: ${v.toFixed(2)}`}
                  >
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Portfolio & P&L (user holdings, priced from getChart) ─────────────── */

interface Holding {
  symbol: string;
  shares: number;
}
const PF_KEY = "finbrio-portfolio";
function loadPf(): Holding[] {
  try {
    const a = JSON.parse(localStorage.getItem(PF_KEY) ?? "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function PortfolioWidget() {
  const [holdings, setHoldings] = useState<Holding[]>(loadPf);
  const [sym, setSym] = useState("");
  const [sh, setSh] = useState("");
  const save = (h: Holding[]) => {
    setHoldings(h);
    try {
      localStorage.setItem(PF_KEY, JSON.stringify(h));
    } catch {
      /* private mode — in-memory only */
    }
  };
  const add = () => {
    const s = sym.trim().toUpperCase();
    const n = parseFloat(sh);
    if (!s || !isFinite(n) || n <= 0) return;
    save([...holdings.filter((h) => h.symbol !== s), { symbol: s, shares: n }]);
    setSym("");
    setSh("");
  };
  const charts = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["chart", h.symbol, "1mo"],
      queryFn: () => api.getChart(h.symbol, "1mo" as ChartRange),
      staleTime: 5 * 60_000,
    })),
  });
  const rows = holdings.map((h, i) => {
    const candles = charts[i]?.data?.candles ?? [];
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const price = last?.close ?? null;
    const prevClose = prev?.close ?? null;
    const value = price != null ? price * h.shares : null;
    const dayPL = price != null && prevClose != null ? (price - prevClose) * h.shares : null;
    const chgPct =
      price != null && prevClose != null && prevClose !== 0 ? (price / prevClose - 1) * 100 : null;
    return { ...h, value, dayPL, chgPct };
  });
  const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const dayTotal = rows.reduce((a, r) => a + (r.dayPL ?? 0), 0);
  const base = total - dayTotal;
  const dayPct = base > 0 ? (dayTotal / base) * 100 : 0;

  return (
    <div className="fbt-w-scroll">
      <div className="fbt-pf-summary">
        <div>
          <div className="fbt-pf-total">{fmtPrice(total)}</div>
          <div className="fbt-pf-label">Portfolio value</div>
        </div>
        <div className={`fbt-pf-day ${dayTotal >= 0 ? "up" : "dn"}`}>
          {dayTotal >= 0 ? "+" : ""}
          {fmtPrice(dayTotal)} <span>{fmtPct(dayPct)}</span>
        </div>
      </div>
      <div className="fbt-w-bar">
        <input
          className="fbt-pf-in"
          placeholder="SYMBOL"
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <input
          className="fbt-pf-in"
          placeholder="Shares"
          value={sh}
          inputMode="decimal"
          onChange={(e) => setSh(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="fbt-ws-icon" onClick={add}>
          Add
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="fbt-w-empty">Add a holding to track live value & P&amp;L.</div>
      ) : (
        <div className="fbt-rows">
          {rows.map((r) => (
            <div
              key={r.symbol}
              className="fbt-row fbt-wl-row"
              role="button"
              tabIndex={0}
              onClick={() => setFocusedSymbol(r.symbol, r.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFocusedSymbol(r.symbol, r.symbol);
                }
              }}
            >
              <span className="fbt-row-sym">
                {r.symbol}
                <span>{r.shares} sh</span>
              </span>
              <span className="fbt-row-px">{r.value != null ? fmtPrice(r.value) : "—"}</span>
              <span
                className={`fbt-row-chg ${r.chgPct == null ? "flat" : r.chgPct >= 0 ? "up" : "dn"}`}
              >
                {r.chgPct == null ? "—" : fmtPct(r.chgPct)}
              </span>
              <button
                type="button"
                className="fbt-wl-x"
                aria-label={`Remove ${r.symbol}`}
                onClick={(e) => {
                  e.stopPropagation();
                  save(holdings.filter((h) => h.symbol !== r.symbol));
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Compare (N symbols normalized to 100) ─────────────────────────────── */

const CMP_COLORS = ["#00d4aa", "#4da3ff", "#ffb84d", "#9b8cff", "#ff4d6a", "#2ce8c0"];
function toTimeStr(t: string | number): string {
  if (typeof t === "string") return t;
  const ms = t < 1e12 ? t * 1000 : t;
  return new Date(ms).toISOString().slice(0, 10);
}

function CompareWidget() {
  const symbols = useWatchlist();
  const [range, setRange] = useState<ChartRange>("3mo");
  const list = symbols.slice(0, 6);
  const charts = useQueries({
    queries: list.map((s) => ({
      queryKey: ["chart", s, range],
      queryFn: () => api.getChart(s, range),
      staleTime: 5 * 60_000,
    })),
  });
  if (list.length === 0) {
    return (
      <div className="fbt-w-empty">Add symbols to your watchlist to compare them here.</div>
    );
  }
  const series = list
    .map((s, i) => {
      const candles = charts[i]?.data?.candles ?? [];
      const startBase = candles[0]?.close ?? null;
      const points =
        startBase && startBase !== 0
          ? candles.map((c) => ({ time: toTimeStr(c.time), value: (c.close / startBase) * 100 }))
          : [];
      return { label: s, color: CMP_COLORS[i % CMP_COLORS.length]!, points };
    })
    .filter((sr) => sr.points.length > 0);
  return (
    <div className="fbt-w-chart">
      <div className="fbt-w-bar">
        <span className="fbt-w-cmp-legend">
          {series.map((sr) => (
            <span key={sr.label} style={{ color: sr.color }}>
              ● {sr.label}
            </span>
          ))}
        </span>
        <Chips options={RANGES} value={range} onChange={setRange} />
      </div>
      <div className="fbt-w-chartbody">
        {series.length === 0 ? (
          <div className="fbt-w-loading">Loading…</div>
        ) : (
          <MultiLineChart series={series} height={260} />
        )}
      </div>
    </div>
  );
}

/* ── Wire (one news desk) ──────────────────────────────────────────────── */

const ALL_DESK = "__all__" as const;
type WireDeskSel = (typeof WIRE_DESKS)[number] | typeof ALL_DESK;
const WIRE_CHIPS: { value: WireDeskSel; label: string }[] = [
  { value: ALL_DESK, label: "ALL" },
  ...WIRE_DESKS.map((d) => ({ value: d, label: d.replace(/-/g, " ").toUpperCase() })),
];
function sevClass(sev: string): string {
  const s = sev.toLowerCase();
  if (s.includes("break")) return "brk";
  if (s.includes("alert") || s.includes("caution")) return "alt";
  return "nrm";
}

function WireWidget() {
  const [desk, setDesk] = useState<WireDeskSel>(ALL_DESK);
  const isAll = desk === ALL_DESK;

  // One desk (only fetched when a specific desk is selected).
  const single = useQuery({
    queryKey: ["wire", desk],
    queryFn: () => api.getWireItems(desk as (typeof WIRE_DESKS)[number], 30),
    refetchInterval: 90_000,
    enabled: !isAll,
  });

  // ALL: fan out across every desk (shares the per-desk cache keys), then
  // merge + dedup by sourceId/link + sort newest-first.
  const allQueries = useQueries({
    queries: WIRE_DESKS.map((d) => ({
      queryKey: ["wire", d],
      queryFn: () => api.getWireItems(d, 20),
      refetchInterval: 90_000,
      enabled: isAll,
    })),
  });

  let items: WireItem[];
  let isLoading: boolean;
  if (isAll) {
    const seen = new Set<string>();
    const merged: WireItem[] = [];
    for (const q of allQueries) {
      for (const it of q.data?.items ?? []) {
        const key = it.link || it.sourceId;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
      }
    }
    merged.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
    items = merged.slice(0, 60);
    isLoading = merged.length === 0 && allQueries.some((q) => q.isLoading);
  } else {
    items = single.data?.items ?? [];
    isLoading = single.isLoading && !single.data;
  }

  return (
    <div className="fbt-w-scroll">
      <div className="fbt-w-bar">
        <Chips options={WIRE_CHIPS} value={desk} onChange={setDesk} />
      </div>
      {isLoading ? (
        <div className="fbt-w-loading">Loading wire…</div>
      ) : items.length === 0 ? (
        <div className="fbt-w-empty">No items on this desk.</div>
      ) : (
        <div className="fbt-wire">
          {items.map((it) => (
            <a
              key={it.link || it.sourceId}
              className="fbt-wire-item"
              href={it.link}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className={`fbt-wire-sev ${sevClass(it.severity)}`}>
                {it.severity.slice(0, 3).toUpperCase()}
              </span>
              <span className="fbt-wire-title">{it.title}</span>
              <span className="fbt-wire-meta">
                {isAll ? `${it.desk.replace(/-/g, " ")} · ` : ""}
                {it.source} · {timeAgo(it.pubDate)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Signals (watchlist, live direction) ───────────────────────────────── */

function SignalsWidget() {
  const symbols = useWatchlist();
  const list = symbols.slice(0, 12);
  const results = useQueries({
    queries: list.map((s) => ({
      queryKey: ["signal", s, "1"],
      queryFn: () => api.getSignal(s, "1"),
      staleTime: 60_000,
    })),
  });
  if (list.length === 0) {
    return <div className="fbt-w-empty">Add symbols to your watchlist to see live signals.</div>;
  }
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-rows">
        {list.map((s, i) => {
          const sig = results[i]?.data;
          const conf = sig?.confidence ?? null;
          return (
            <div
              key={s}
              className="fbt-row"
              role="button"
              tabIndex={0}
              onClick={() => setFocusedSymbol(s, s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFocusedSymbol(s, s);
                }
              }}
            >
              <span className="fbt-row-sym">{s}</span>
              <span className="fbt-row-px">{conf != null ? `${Math.round(conf)}%` : ""}</span>
              <span className="fbt-sig-cell">
                {sig ? <SignalBadge direction={sig.direction} /> : "…"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Economic calendar ─────────────────────────────────────────────────── */

function EconWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["econEvents"],
    queryFn: () => api.getEconomyEvents(),
    staleTime: 30 * 60_000,
  });
  const events = data?.events ?? [];
  if (isLoading && !data) return <div className="fbt-w-loading">Loading calendar…</div>;
  if (events.length === 0) return <div className="fbt-w-empty">No upcoming events.</div>;
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-econ">
        {events.slice(0, 40).map((ev, i) => (
          <div key={`${ev.date}-${ev.event}-${i}`} className="fbt-econ-row">
            <span className="fbt-econ-date">
              {ev.dateLabel ?? ev.date}
              {ev.time ? ` ${ev.time}` : ""}
            </span>
            <span className="fbt-econ-name">
              {ev.country ? `${ev.country} · ` : ""}
              {ev.event}
            </span>
            <span className="fbt-econ-num">{ev.forecast ?? ev.previous ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Breaking (cross-desk breaking headlines) ──────────────────────────── */

function BreakingWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["wireBreaking"],
    queryFn: () => api.getWireBreaking(),
    refetchInterval: 60_000,
  });
  const items = data?.items ?? [];
  return (
    <div className="fbt-w-scroll">
      {isLoading && !data ? (
        <div className="fbt-w-loading">Loading breaking…</div>
      ) : items.length === 0 ? (
        <div className="fbt-w-empty">No breaking items right now.</div>
      ) : (
        <div className="fbt-wire">
          {items.map((it) => (
            <a
              key={it.link || it.sourceId}
              className="fbt-wire-item"
              href={it.link}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className={`fbt-wire-sev ${sevClass(it.severity)}`}>
                {it.severity.slice(0, 3).toUpperCase()}
              </span>
              <span className="fbt-wire-title">{it.title}</span>
              <span className="fbt-wire-meta">
                {it.desk.replace(/-/g, " ")} · {it.source} · {timeAgo(it.pubDate)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Geo-Intel (quakes / predictions / maritime / airspace) ────────────── */

const GEO_FEEDS = [
  { value: "quakes", label: "Quakes" },
  { value: "markets", label: "Predictions" },
  { value: "maritime", label: "Maritime" },
  { value: "airspace", label: "Airspace" },
] as const;
type GeoFeed = (typeof GEO_FEEDS)[number]["value"];

function QuakesFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["intelQuakes"],
    queryFn: () => api.getIntelQuakes(),
    refetchInterval: 5 * 60_000,
  });
  const items = data?.items ?? [];
  if (isLoading && !data) return <div className="fbt-w-loading">Loading…</div>;
  if (items.length === 0) return <div className="fbt-w-empty">No recent quakes.</div>;
  return (
    <div className="fbt-intel">
      {items.slice(0, 30).map((q) => (
        <a key={q.id} className="fbt-intel-row" href={q.url} target="_blank" rel="noreferrer noopener">
          <span className={`fbt-intel-mag${(q.mag ?? 0) >= 6 ? " fbt-intel-strong" : ""}`}>
            {q.mag != null ? q.mag.toFixed(1) : "—"}
          </span>
          <span className="fbt-intel-main">
            {q.place}
            {q.tsunami ? " · ⚠ tsunami" : ""}
          </span>
          <span className="fbt-intel-time">{timeAgo(q.time)}</span>
        </a>
      ))}
    </div>
  );
}

function PredictionsFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["intelMarkets"],
    queryFn: () => api.getIntelMarkets(),
    refetchInterval: 10 * 60_000,
  });
  const items = data?.items ?? [];
  if (isLoading && !data) return <div className="fbt-w-loading">Loading…</div>;
  if (items.length === 0) return <div className="fbt-w-empty">No markets.</div>;
  return (
    <div className="fbt-intel">
      {items.slice(0, 25).map((m) => (
        <a key={m.id} className="fbt-intel-row" href={m.url} target="_blank" rel="noreferrer noopener">
          <span className="fbt-intel-mag">
            {m.yesPrice != null ? `${Math.round(m.yesPrice * 100)}%` : "—"}
          </span>
          <span className="fbt-intel-main">{m.question}</span>
          <span className="fbt-intel-time">{m.volume != null ? fmtCompact(m.volume) : ""}</span>
        </a>
      ))}
    </div>
  );
}

function MaritimeFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["intelMaritime"],
    queryFn: () => api.getIntelMaritime(),
    refetchInterval: 30 * 60_000,
  });
  const items = data?.items ?? [];
  if (isLoading && !data) return <div className="fbt-w-loading">Loading…</div>;
  if (items.length === 0) return <div className="fbt-w-empty">No warnings.</div>;
  return (
    <div className="fbt-intel">
      {items.slice(0, 25).map((w) => (
        <div key={w.id} className="fbt-intel-row">
          <span className="fbt-intel-mag fbt-intel-tag">{w.navArea}</span>
          <span className="fbt-intel-main">{w.summary}</span>
          <span className="fbt-intel-time">{timeAgo(w.issued)}</span>
        </div>
      ))}
    </div>
  );
}

function AirspaceFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["intelAirspace"],
    queryFn: () => api.getIntelAirspace(),
    refetchInterval: 3 * 60_000,
  });
  const items = data?.items ?? [];
  if (isLoading && !data) return <div className="fbt-w-loading">Loading…</div>;
  if (items.length === 0) return <div className="fbt-w-empty">No active events.</div>;
  return (
    <div className="fbt-intel">
      {items.slice(0, 25).map((a, i) => (
        <div key={`${a.airport}-${i}`} className="fbt-intel-row">
          <span className="fbt-intel-mag fbt-intel-tag">{a.airport}</span>
          <span className="fbt-intel-main">
            {a.reason}
            {a.detail ? ` — ${a.detail}` : ""}
          </span>
          <span className="fbt-intel-time">{a.kind.replace(/-/g, " ")}</span>
        </div>
      ))}
    </div>
  );
}

function GeoIntelWidget() {
  const [feed, setFeed] = useState<GeoFeed>("quakes");
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-w-bar">
        <Chips options={GEO_FEEDS} value={feed} onChange={setFeed} />
      </div>
      {feed === "quakes" && <QuakesFeed />}
      {feed === "markets" && <PredictionsFeed />}
      {feed === "maritime" && <MaritimeFeed />}
      {feed === "airspace" && <AirspaceFeed />}
    </div>
  );
}

/* ── Institutional flow ────────────────────────────────────────────────── */

const FLOW_CHIPS = INSTITUTIONAL_FLOW_TYPES.map((t) => ({ value: t.param, label: t.label }));

function flowMetric(type: InstitutionalFlowType, a: InstitutionalFlowAsset): string {
  switch (type) {
    case "accumulation":
    case "distribution":
      return a.volumeRatio != null ? `${a.volumeRatio.toFixed(1)}× vol` : "";
    case "vwap":
      return a.vwapDeviation != null
        ? `${a.vwapDeviation >= 0 ? "+" : ""}${a.vwapDeviation.toFixed(1)}% VWAP`
        : "";
    case "obv":
      return a.obvSlopeRatio != null ? `OBV ${a.obvSlopeRatio.toFixed(2)}` : "";
    case "short":
      return a.shortPercentFloat != null ? `${a.shortPercentFloat.toFixed(1)}% short` : "";
    case "insider":
      return a.insiderCount != null ? `${a.insiderCount} insiders` : "";
    default:
      return "";
  }
}

function InstFlowWidget() {
  const [type, setType] = useState<InstitutionalFlowType>("accumulation");
  const { data, isLoading } = useQuery({
    queryKey: ["instFlow", type],
    queryFn: () => api.getInstitutionalFlow(type),
    staleTime: 5 * 60_000,
  });
  const assets = data?.assets ?? [];
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-w-bar">
        <Chips options={FLOW_CHIPS} value={type} onChange={setType} />
      </div>
      {isLoading && !data ? (
        <div className="fbt-w-loading">Loading flow…</div>
      ) : assets.length === 0 ? (
        <div className="fbt-w-empty">No data.</div>
      ) : (
        <div className="fbt-rows">
          {assets.slice(0, 15).map((a) => {
            const chg = a.changePercent ?? null;
            const dir = chg == null ? "flat" : chg >= 0 ? "up" : "dn";
            return (
              <div
                key={a.symbol}
                className="fbt-row"
                role="button"
                tabIndex={0}
                onClick={() => setFocusedSymbol(a.symbol, a.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFocusedSymbol(a.symbol, a.name);
                  }
                }}
              >
                <span className="fbt-row-sym">
                  {a.symbol}
                  <span>{flowMetric(type, a)}</span>
                </span>
                <span className="fbt-row-px">{a.price != null ? fmtPrice(a.price) : "—"}</span>
                <span className={`fbt-row-chg ${dir}`}>{chg == null ? "—" : fmtPct(chg)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── CFTC COT positioning ──────────────────────────────────────────────── */

const COT_GROUPS = [
  { value: "metals", label: "Metals" },
  { value: "energy", label: "Energy" },
  { value: "indicesRates", label: "Indices & Rates" },
  { value: "agriculture", label: "Agriculture" },
  { value: "currencies", label: "Currencies" },
] as const;
type CotGroup = (typeof COT_GROUPS)[number]["value"];

function CotWidget() {
  const [group, setGroup] = useState<CotGroup>("metals");
  const { data, isLoading } = useQuery({
    queryKey: ["cot"],
    queryFn: () => api.getCotMetals(),
    staleTime: 30 * 60_000,
  });
  const rows: CotItem[] = data ? data[group] : [];
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-w-bar">
        <Chips options={COT_GROUPS} value={group} onChange={setGroup} />
      </div>
      {isLoading && !data ? (
        <div className="fbt-w-loading">Loading COT…</div>
      ) : rows.length === 0 ? (
        <div className="fbt-w-empty">No positioning data.</div>
      ) : (
        <div className="fbt-rows">
          {rows.map((c, i) => {
            const dir = c.weekNetChange == null ? "flat" : c.weekNetChange >= 0 ? "up" : "dn";
            return (
              <div key={c.symbol ?? c.name ?? i} className="fbt-row">
                <span className="fbt-row-sym">
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                  <span>{c.sentiment ?? ""}</span>
                </span>
                <span className="fbt-row-px">
                  {c.netPosition != null ? c.netPosition.toLocaleString() : "—"}
                </span>
                <span className={`fbt-row-chg ${dir}`}>
                  {c.weekNetChange == null
                    ? "—"
                    : `${c.weekNetChange >= 0 ? "+" : ""}${c.weekNetChange.toLocaleString()}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Smart money (lobbying / insider leaders) ──────────────────────────── */

const SMART_MODES = [
  { value: "lobbying", label: "Lobbying" },
  { value: "insider", label: "Insider" },
] as const;
type SmartMode = (typeof SMART_MODES)[number]["value"];

function SmartMoneyWidget() {
  const [mode, setMode] = useState<SmartMode>("lobbying");
  const { data, isLoading } = useQuery({
    queryKey: ["quiver", mode],
    queryFn: () => (mode === "lobbying" ? api.getQuiverLobbying() : api.getQuiverInsider()),
    staleTime: 60 * 60_000,
  });
  const items = data?.items ?? [];
  return (
    <div className="fbt-w-scroll">
      <div className="fbt-w-bar">
        <Chips options={SMART_MODES} value={mode} onChange={setMode} />
      </div>
      {isLoading && !data ? (
        <div className="fbt-w-loading">Loading…</div>
      ) : items.length === 0 ? (
        <div className="fbt-w-empty">No data.</div>
      ) : (
        <div className="fbt-rows">
          {items.map((it) => {
            const chg = it.changePercent ?? null;
            const dir = chg == null ? "flat" : chg >= 0 ? "up" : "dn";
            const badge = it.badgeLabel ?? it.lobbyingGrowth ?? it.badge ?? it.name;
            return (
              <div
                key={it.symbol}
                className="fbt-row"
                role="button"
                tabIndex={0}
                onClick={() => setFocusedSymbol(it.symbol, it.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFocusedSymbol(it.symbol, it.name);
                  }
                }}
              >
                <span className="fbt-row-sym">
                  {it.symbol}
                  <span>{badge}</span>
                </span>
                <span className="fbt-row-px">{it.price != null ? fmtPrice(it.price) : "—"}</span>
                <span className={`fbt-row-chg ${dir}`}>{chg == null ? "—" : fmtPct(chg)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Registry ──────────────────────────────────────────────────────────── */

const WIDGETS: Record<PanelType, () => ReactElement> = {
  watchlist: WatchlistWidget,
  chart: ChartWidget,
  movers: MoversWidget,
  treemap: TreemapWidget,
  quotes: QuotesWidget,
  macro: MacroWidget,
  correlation: CorrelationWidget,
  portfolio: PortfolioWidget,
  compare: CompareWidget,
  wire: WireWidget,
  signals: SignalsWidget,
  econ: EconWidget,
  breaking: BreakingWidget,
  geointel: GeoIntelWidget,
  instflow: InstFlowWidget,
  cot: CotWidget,
  smartmoney: SmartMoneyWidget,
};

export function WidgetHost({ type }: { type: PanelType }) {
  const Widget = WIDGETS[type];
  return <Widget />;
}
