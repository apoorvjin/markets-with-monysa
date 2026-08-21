import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { CbRateInfo, MarketItem } from "@monysa/contracts";
import { Sparkline } from "@monysa/charts";
import { changeClass, fmtPct, fmtPrice, ProBlur } from "@monysa/ui";
import { api } from "../lib/api";
import { useIsPro } from "../lib/session";

export type MarketKind = "indices" | "commodities" | "forex";

/** Base/quote rate-comparison label for a forex pair like EURUSD=X.
    Pro-gated: mirrors _FxDifferential in the Flutter app. */
function FxDifferential(props: {
  symbol: string;
  rates: Record<string, CbRateInfo> | undefined;
  forceReveal?: boolean;
}) {
  const isPro = useIsPro();
  const rates = props.rates;
  if (!rates) return null;
  const clean = props.symbol.replace("=X", "");
  if (clean.length < 6) return null;
  const base = rates[clean.slice(0, 3).toUpperCase()];
  const quote = rates[clean.slice(3, 6).toUpperCase()];
  if (!base || !quote) return null;

  const diff = base.rate - quote.rate;
  const label = (
    <span className={`cell-sub ${changeClass(diff)}`}>
      {base.label} {base.rate.toFixed(2)}% vs {quote.label} {quote.rate.toFixed(2)}% (
      {diff >= 0 ? "+" : ""}
      {diff.toFixed(2)}%)
    </span>
  );
  if (props.forceReveal) return label;
  return (
    <ProBlur positive={diff >= 0} unlocked={isPro} className="fx-diff-blur">
      {label}
    </ProBlur>
  );
}

/** "relevance" preserves the server's curated order (indices by market cap —
    WORLD_INDICES; forex by liquidity — FOREX_PAIRS, both in markets.ts), so it
    is deliberately a no-op rather than a sort. Mirrors _sortItems in
    markets_screen.dart. */
type SortField = "relevance" | "name" | "price" | "change";

function sortItems(
  items: MarketItem[],
  field: SortField,
  ascending: boolean,
): MarketItem[] {
  if (field === "relevance") return items;
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (field === "name") {
      return ascending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
    const aVal = (field === "price" ? a.price : a.changePercent) ?? -Infinity;
    const bVal = (field === "price" ? b.price : b.changePercent) ?? -Infinity;
    return ascending ? aVal - bVal : bVal - aVal;
  });
  return sorted;
}

/** Stable group-by-category: the server already returns items in curated
    order, so both group order (first occurrence) and each group's internal
    order fall out of that for free. Mirrors _groupByCategory. */
function groupByCategory(items: MarketItem[]): Map<string, MarketItem[]> {
  const groups = new Map<string, MarketItem[]>();
  for (const item of items) {
    const key = item.category ?? "Other";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function SortHeader(props: {
  label: string;
  field: SortField;
  active: SortField;
  ascending: boolean;
  onSort: (f: SortField) => void;
  numeric?: boolean;
}) {
  const isActive = props.active === props.field;
  return (
    <th
      className={`sortable ${props.numeric ? "num" : ""}`}
      onClick={() => props.onSort(props.field)}
      aria-sort={isActive ? (props.ascending ? "ascending" : "descending") : "none"}
    >
      <span className="tbl-sort" data-active={isActive ? "true" : "false"}>
        {props.label}
        {isActive && <span aria-hidden="true">{props.ascending ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function NoSearchResults(props: { query: string }) {
  return (
    <div className="market-empty">
      <div className="market-empty-icon" aria-hidden="true">
        🔍
      </div>
      <p className="market-empty-title">No results for “{props.query}”</p>
      <p className="cell-sub">Try the full ticker symbol — e.g. AAPL, GC=F, EURUSD=X</p>
    </div>
  );
}

const COLUMN_LABELS: Record<
  MarketKind,
  { asset: string; price: string; change: string; meta: string }
> = {
  indices: { asset: "Index", price: "Value", change: "% 1D", meta: "Region" },
  // Commodities carry no region — the second column is their quote unit
  // ("per troy oz"), which was previously mislabelled "Region".
  commodities: { asset: "Commodity", price: "Price", change: "% Chg", meta: "Unit" },
  forex: { asset: "Asset", price: "Price", change: "% Chg", meta: "" },
};

/** Advancing / declining / unchanged across whatever is currently in view.
    A count of instruments says nothing about the tape; this does. */
function Breadth({ items }: { items: MarketItem[] }) {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const i of items) {
    const c = i.changePercent;
    if (c == null) flat += 1;
    else if (c > 0) up += 1;
    else if (c < 0) down += 1;
    else flat += 1;
  }
  const total = Math.max(1, up + down + flat);
  return (
    <div className="mt-breadth" aria-label={`${up} advancing, ${down} declining, ${flat} unchanged`}>
      <span className="mt-breadth-bar" aria-hidden="true">
        <span data-dir="up" style={{ width: `${(up / total) * 100}%` }} />
        <span data-dir="flat" style={{ width: `${(flat / total) * 100}%` }} />
        <span data-dir="down" style={{ width: `${(down / total) * 100}%` }} />
      </span>
      <span className="mt-breadth-nums">
        <span className="num-up">{up}&#9650;</span>
        <span className="num-down">{down}&#9660;</span>
        <span className="cell-sub">{flat}&#8226;</span>
      </span>
    </div>
  );
}

/** Searchable, sortable price table for indices / commodities / forex rows.
    Indices and Forex group by the server's `category` tier while unsorted;
    Commodities stays flat and pre-sorted by % change — same defaults the
    Flutter tabs use. Rows navigate to the Asset detail page. */
export function MarketTable(props: { items: MarketItem[]; kind: MarketKind }) {
  const navigate = useNavigate();
  const isForex = props.kind === "forex";
  // Forex is the only tab whose rows carry neither a sparkline nor a region
  // (the server fetches no 1M closes for FX pairs, and FOREX_PAIRS has no
  // region field), so both columns would be a wall of "—" — the Flutter forex
  // row shows neither. It gets the narrow 4-column layout instead.
  const hasSparkline = !isForex;
  const hasRegion = !isForex;
  const [query, setQuery] = useState("");
  // Commodities open pre-sorted by daily move; Indices and Forex open on the
  // server's curated order (market cap / liquidity) instead.
  const [sortBy, setSortBy] = useState<SortField>(
    props.kind === "commodities" ? "change" : "relevance",
  );
  const [ascending, setAscending] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  // Every category the feed actually returned, in the server's curated order.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const i of props.items) {
      const c = i.category;
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [props.items]);

  const { data: cbRates } = useQuery({
    queryKey: ["central-bank-rates"],
    queryFn: () => api.getCentralBankRates(),
    staleTime: 6 * 3600_000,
    enabled: isForex,
  });

  const handleSort = (field: SortField) => {
    if (sortBy === field) setAscending((v) => !v);
    else {
      setSortBy(field);
      setAscending(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.items.filter((i) => {
      if (category && (i.category ?? "Other") !== category) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q);
    });
  }, [props.items, query, category]);

  // Grouped-by-category rows only make sense on the untouched curated order —
  // sorting by Value/% is a "find the biggest mover globally" intent that
  // grouping works against. Forex keeps its groups under any sort (it sorts
  // within each group instead), matching _ForexTabState.
  const rows = useMemo(() => {
    const grouped =
      query.trim() === "" && category == null && (isForex || sortBy === "relevance");
    const out: ({ kind: "group"; label: string } | { kind: "item"; item: MarketItem })[] = [];
    if (grouped) {
      for (const [label, items] of groupByCategory(filtered)) {
        out.push({ kind: "group", label });
        for (const item of sortItems(items, sortBy, ascending)) {
          out.push({ kind: "item", item });
        }
      }
    } else {
      for (const item of sortItems(filtered, sortBy, ascending)) {
        out.push({ kind: "item", item });
      }
    }
    return out;
  }, [filtered, query, category, sortBy, ascending, isForex]);

  const open = (i: MarketItem) =>
    void navigate({
      to: "/asset/$symbol",
      params: { symbol: i.symbol },
      search: { name: i.name },
    });

  const labels = COLUMN_LABELS[props.kind];
  // Name + optional Region/Trend + Price/Change/% — spans a group header row.
  const colSpan = 1 + (hasRegion ? 1 : 0) + (hasSparkline ? 1 : 0) + 3;
  // Exactly one FX rate-comparison label is revealed across the whole list —
  // the first data row rendered, groups included, not the first of each group.
  let fxRevealed = false;

  return (
    <>
      <div className="mt-toolbar">
        <input
          className="search-input"
          placeholder="Search by name or symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter instruments"
        />
        <span className="cell-sub mt-count">
          {filtered.length === props.items.length
            ? `${filtered.length} markets`
            : `${filtered.length} of ${props.items.length}`}
        </span>
        <Breadth items={filtered} />
      </div>
      {categories.length > 1 && (
        <div className="mt-cats" role="group" aria-label="Filter by category">
          <button
            type="button"
            className="mt-cat"
            data-active={category == null ? "true" : "false"}
            aria-pressed={category == null}
            onClick={() => setCategory(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className="mt-cat"
              data-active={category === c ? "true" : "false"}
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 && query.trim() !== "" ? (
        <NoSearchResults query={query.trim()} />
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortHeader
                  label={labels.asset}
                  field="name"
                  active={sortBy}
                  ascending={ascending}
                  onSort={handleSort}
                />
                {hasRegion && <th>{labels.meta}</th>}
                {hasSparkline && <th>1M Trend</th>}
                <SortHeader
                  label={labels.price}
                  field="price"
                  active={sortBy}
                  ascending={ascending}
                  onSort={handleSort}
                  numeric
                />
                <th className="num">Change</th>
                <SortHeader
                  label={labels.change}
                  field="change"
                  active={sortBy}
                  ascending={ascending}
                  onSort={handleSort}
                  numeric
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === "group") {
                  return (
                    <tr key={`g:${row.label}`} className="tbl-group">
                      <td colSpan={colSpan}>
                        <span className="tbl-group-dot" aria-hidden="true" />
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                const i = row.item;
                const reveal = !fxRevealed;
                if (isForex) fxRevealed = true;
                return (
                  <tr
                    key={i.symbol}
                    className="clickable"
                    // A bare onClick on <tr> is mouse-only: no tab stop, no
                    // Enter/Space, nothing announced. Give the row a real
                    // button role so the whole table is keyboard-navigable.
                    role="button"
                    tabIndex={0}
                    aria-label={`${i.name} (${i.symbol}) — open details`}
                    onClick={() => open(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(i);
                      }
                    }}
                  >
                    <td>
                      <span style={{ marginRight: 8 }}>{i.flag ?? ""}</span>
                      <span className="cell-main">{i.name}</span>{" "}
                      <span className="cell-sub">{i.symbol}</span>
                      {isForex && (
                        <div>
                          <FxDifferential
                            symbol={i.symbol}
                            rates={cbRates?.rates}
                            forceReveal={reveal}
                          />
                        </div>
                      )}
                    </td>
                    {hasRegion && (
                      <td className="cell-sub">{i.region ?? i.unit ?? "—"}</td>
                    )}
                    {hasSparkline && (
                      <td className="tbl-spark">
                        {i.sparkline && i.sparkline.length > 1 ? (
                          <Sparkline
                            points={i.sparkline}
                            width={96}
                            height={26}
                            positive={(i.changePercent ?? 0) >= 0}
                          />
                        ) : (
                          <span className="cell-sub">—</span>
                        )}
                      </td>
                    )}
                    <td className="num cell-main">{fmtPrice(i.price, i.currency)}</td>
                    <td className={`num ${changeClass(i.change)}`}>
                      {i.change == null ? "—" : i.change.toFixed(2)}
                    </td>
                    <td className={`num ${changeClass(i.changePercent)}`}>
                      {fmtPct(i.changePercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
