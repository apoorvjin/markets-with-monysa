import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SplcEdge, SplcUniverseCompany } from "@monysa/contracts";
import { Card, ErrorView, fmtCompact, fmtPct, FreshnessBar, ProBlur, SkeletonList } from "@monysa/ui";
import { api } from "../../lib/api";
import { useIsPro } from "../../lib/session";
import { SplcInfoToggle } from "../../components/SplcInfo";

const FREE_EDGE_LIMIT = 5;
const MAX_SUGGESTIONS = 8;

const METHOD_LABEL: Record<SplcEdge["method"], string> = {
  disclosed_supplier_side: "Disclosed",
  disclosed_customer_side: "Disclosed",
  derived: "Derived",
  government_contract: "Federal contract",
};

/** Dollars lead, share follows in brackets — "$412M (22.0%)". Either half can
 *  be missing: government awards have no meaningful share (see usaspending.ts),
 *  and a percentage-only disclosure has no dollar figure unless the filer's
 *  revenue was resolvable. Renders whichever parts are actually known. */
function formatValue(absUsd: number | null | undefined, pct: number | null | undefined): string {
  const hasUsd = absUsd != null && Number.isFinite(absUsd);
  const hasPct = pct != null && Number.isFinite(pct);
  if (hasUsd && hasPct) return `$${fmtCompact(absUsd)} (${fmtPct(pct * 100, false)})`;
  if (hasUsd) return `$${fmtCompact(absUsd)}`;
  if (hasPct) return fmtPct(pct * 100, false);
  return "—";
}

/** One counterparty row. `pct` is already the share meaningful for the column
    it sits in — see columnRows() for which side each number comes from. */
function EdgeRow(props: { edge: SplcEdge; name: string; pct: number | null; onOpen?: () => void }) {
  const { edge, name, pct } = props;
  const anonymous = /^Undisclosed /.test(name);
  const clickable = !!props.onOpen;
  return (
    <div
      className="splc-edge"
      data-clickable={clickable ? "true" : "false"}
      onClick={props.onOpen}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          props.onOpen?.();
        }
      }}
    >
      <div className="splc-edge-main">
        <span className="splc-edge-name" data-anonymous={anonymous ? "true" : "false"}>{name}</span>
        <span className="splc-edge-meta">
          {METHOD_LABEL[edge.method]} · {(edge.confidence * 100).toFixed(0)}%
          {edge.costBucket ? ` · ${edge.costBucket}` : ""}
        </span>
      </div>
      <span className="splc-edge-pct">{formatValue(edge.absValueUsd, pct)}</span>
    </div>
  );
}

function Column(props: {
  title: string;
  subtitle: string;
  rows: { edge: SplcEdge; name: string; pct: number | null; ticker: string | null }[];
  emptyText: string;
  isPro: boolean;
  onOpen: (ticker: string) => void;
}) {
  const free = props.rows.slice(0, FREE_EDGE_LIMIT);
  const gated = props.rows.slice(FREE_EDGE_LIMIT);

  return (
    <div className="splc-col">
      <div className="splc-col-head">
        <strong>{props.title}</strong>
        <span className="splc-col-sub">{props.subtitle}</span>
      </div>
      {props.rows.length === 0 ? (
        <div className="splc-col-empty">{props.emptyText}</div>
      ) : (
        <>
          {free.map((r, i) => (
            <EdgeRow
              key={`${r.edge.sourceAdsh}-${r.name}-${i}`}
              edge={r.edge}
              name={r.name}
              pct={r.pct}
              onOpen={r.ticker ? () => props.onOpen(r.ticker!) : undefined}
            />
          ))}
          {gated.length > 0 && (
            <ProBlur positive unlocked={props.isPro} className="splc-col-blur">
              {gated.map((r, i) => (
                <EdgeRow key={`g-${r.edge.sourceAdsh}-${r.name}-${i}`} edge={r.edge} name={r.name} pct={r.pct} />
              ))}
            </ProBlur>
          )}
        </>
      )}
    </div>
  );
}

export function SplcPage() {
  const isPro = useIsPro();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const info = SplcInfoToggle();
  const [selected, setSelected] = useState<string | null>(null);

  const universe = useQuery({
    // Key is versioned: the payload changed from `tickers` to `companies`,
    // and a persisted entry under the old key parses to an empty list. A new
    // key has no stored entry, so there is nothing stale to inherit — this is
    // what rescues browsers that already cached the empty result.
    queryKey: ["splc-universe", "v2"],
    queryFn: () => api.getSplcUniverse(),
    // Always re-check on mount. Cached data still renders immediately; this
    // just guarantees a wrong/empty copy can't survive a page load, which a
    // staleTime window alone does not.
    refetchOnMount: "always",
    // Deliberately short for a once-nightly dataset. This response is
    // persisted to localStorage, so a bad or empty copy would otherwise stick
    // around for the full window with no way for the user to clear it. The
    // payload is small and revalidates to a 304, so re-checking is nearly
    // free — cheaper than serving an empty company list for an hour.
    staleTime: 5 * 60_000,
  });

  const companies = universe.data?.companies ?? [];

  // Symbol OR company name, both. Symbol prefix matches rank first so typing
  // "D" surfaces D before every company with "d" in its name.
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const scored: { c: SplcUniverseCompany; score: number }[] = [];
    for (const c of companies) {
      const t = c.ticker.toUpperCase();
      const n = c.name.toUpperCase();
      let score = -1;
      if (t === q) score = 0;
      else if (t.startsWith(q)) score = 1;
      else if (n.startsWith(q)) score = 2;
      else if (n.includes(q)) score = 3;
      else if (t.includes(q)) score = 4;
      if (score >= 0) scored.push({ c, score });
    }
    return scored
      .sort((a, b) =>
        a.score !== b.score
          ? a.score - b.score
          : b.c.supplierCount + b.c.customerCount - (a.c.supplierCount + a.c.customerCount),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((s) => s.c);
  }, [query, companies]);

  const graph = useQuery({
    // Versioned for the same reason as the universe key — the graph payload
    // gained `name`, so old persisted entries are the wrong shape.
    queryKey: ["splc-graph", "v2", selected],
    queryFn: () => api.getSplcGraph(selected!),
    enabled: !!selected,
    staleTime: 30 * 60_000,
    refetchOnMount: "always",
  });

  function pick(ticker: string) {
    setSelected(ticker);
    setQuery("");
  }

  const data = graph.data;
  // On a supplier row this company is the *customer*, so pctOfSupplierRevenue
  // is the supplier's dependence on it — which is what the column header
  // says. Sorted biggest-first so the most concentrated relationships lead.
  const supplierRows = (data?.suppliers ?? [])
    .map((e) => ({
      edge: e,
      name: e.supplierName,
      pct: e.pctOfSupplierRevenue ?? e.pctOfCustomerBucket,
      ticker: null as string | null,
    }))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || (b.edge.absValueUsd ?? 0) - (a.edge.absValueUsd ?? 0));
  const customerRows = (data?.customers ?? [])
    .map((e) => ({
      edge: e,
      name: e.customerName,
      pct: e.pctOfSupplierRevenue ?? e.pctOfCustomerBucket,
      ticker: null as string | null,
    }))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || (b.edge.absValueUsd ?? 0) - (a.edge.absValueUsd ?? 0));

  // Only link a counterparty onward if it has its own page in the universe.
  const tickerByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.name.toUpperCase(), c.ticker);
    return m;
  }, [companies]);
  for (const r of [...supplierRows, ...customerRows]) {
    r.ticker = tickerByName.get(r.name.toUpperCase()) ?? null;
  }

  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">SPLC Analysis</h1>
        <span className="splc-header-right">
          <span className="cell-sub">
            {companies.length > 0 ? `${companies.length} companies with disclosed relationships` : ""}
          </span>
          {info.button}
        </span>
      </div>

      {info.panel}

      <Card className="splc-search-card">
        <label className="splc-search-label" htmlFor="splc-search">
          Search a company by name or symbol
        </label>
        <input
          id="splc-search"
          className="splc-search-input"
          placeholder="e.g. FICO, or Fair Isaac"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query.trim() !== "" && (
          <div className="splc-suggestions">
            {companies.length === 0 ? (
              // Distinguish "your search matched nothing" from "we have no
              // company list at all" — blaming the query when the universe
              // failed to load sends people hunting for a typo that isn't there.
              <div className="splc-suggest-empty">
                {universe.isLoading
                  ? "Loading the company list…"
                  : "The company list isn't available right now. Reload the page to try again."}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="splc-suggest-empty">
                No company matching “{query.trim()}” has disclosed a named customer or supplier.
              </div>
            ) : (
              suggestions.map((c) => (
                <button key={c.ticker} type="button" className="splc-suggest" onClick={() => pick(c.ticker)}>
                  <span className="splc-suggest-ticker">{c.ticker}</span>
                  <span className="splc-suggest-name">{c.name}</span>
                  <span className="splc-suggest-counts">
                    {c.supplierCount} in · {c.customerCount} out
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </Card>

      {universe.isLoading && <SkeletonList rows={3} height={30} />}
      {universe.error && <ErrorView message="Couldn't load the SPLC universe." />}

      {!selected && !universe.isLoading && (
        <Card>
          <div className="splc-placeholder">
            <strong>Pick a company to see its supply chain.</strong>
            <p>
              Suppliers appear on the left (they sell to the company), customers on the right (they
              buy from it). Every figure comes from an SEC filing and is labelled with how certain
              it is.
            </p>
            {companies.length > 0 && (
              <div className="splc-quickpicks">
                <span className="cell-sub">Try:</span>
                {companies
                  .slice()
                  .sort((a, b) => b.supplierCount + b.customerCount - (a.supplierCount + a.customerCount))
                  .slice(0, 8)
                  .map((c) => (
                    <button key={c.ticker} type="button" className="splc-quickpick" onClick={() => pick(c.ticker)}>
                      {c.ticker}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {selected && graph.isLoading && <SkeletonList rows={6} height={34} />}

      {selected && data && !graph.isLoading && (
        <>
          <div className="splc-board">
            {/* The same percentage reads in opposite directions per column,
                so each column states its own denominator. On a supplier row
                the figure is that supplier's dependence on this company —
                not this company's spend. Bloomberg splits these as
                "relationship exposure" vs "company exposure". */}
            <Column
              title="Suppliers"
              subtitle="sell to this company · % = share of the supplier's own revenue"
              rows={supplierRows}
              emptyText="No supplier has named this company in its filings."
              isPro={isPro}
              onOpen={pick}
            />

            <div className="splc-centre">
              <div className="splc-centre-card">
                <span className="splc-centre-ticker">{data.ticker}</span>
                <span className="splc-centre-name">{data.name ?? ""}</span>
                <span className="splc-centre-counts">
                  {supplierRows.length} in · {customerRows.length} out
                </span>
                <button
                  type="button"
                  className="splc-centre-link"
                  onClick={() =>
                    navigate({
                      to: "/asset/$symbol",
                      params: { symbol: data.ticker },
                      search: { name: data.name ?? undefined },
                    })
                  }
                >
                  Open {data.ticker} →
                </button>
              </div>
            </div>

            <Column
              title="Customers"
              subtitle="buy from this company · % = share of this company's revenue"
              rows={customerRows}
              emptyText="This company hasn't named a customer in its filings."
              isPro={isPro}
              onOpen={pick}
            />
          </div>
          <FreshnessBar lastUpdated={data.lastUpdated} />
        </>
      )}
    </div>
  );
}
