import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { SplcEdge } from "@monysa/contracts";
import { Card, fmtCompact, fmtPct, FreshnessBar, ProBlur, SkeletonList } from "@monysa/ui";
import { api } from "../lib/api";
import { useIsPro } from "../lib/session";
import { SplcInfoToggle } from "./SplcInfo";

// Compact by design: this is a summary on Asset Detail, with the full
// board one click away on /splc.
const FREE_EDGE_LIMIT = 5;
const PREVIEW_PER_SIDE = 4;

const METHOD_LABEL: Record<SplcEdge["method"], string> = {
  disclosed_supplier_side: "Disclosed",
  disclosed_customer_side: "Disclosed",
  derived: "Derived",
  government_contract: "Federal contract",
};

/** Dollars lead, share in brackets — matches the SPLC page exactly. */
function formatValue(absUsd: number | null | undefined, pct: number | null | undefined): string {
  const hasUsd = absUsd != null && Number.isFinite(absUsd);
  const hasPct = pct != null && Number.isFinite(pct);
  if (hasUsd && hasPct) return `$${fmtCompact(absUsd)} (${fmtPct(pct * 100, false)})`;
  if (hasUsd) return `$${fmtCompact(absUsd)}`;
  if (hasPct) return fmtPct(pct * 100, false);
  return "—";
}

function EdgeRow(props: { edge: SplcEdge; name: string; pct: number | null }) {
  const anonymous = /^Undisclosed /.test(props.name);
  return (
    <div className="splc-row">
      <div>
        <span className="splc-edge-name" data-anonymous={anonymous ? "true" : "false"}>
          {props.name}
        </span>
        <span className="cell-sub" style={{ marginLeft: 8 }}>
          {METHOD_LABEL[props.edge.method]} · {(props.edge.confidence * 100).toFixed(0)}%
          {props.edge.costBucket ? ` · ${props.edge.costBucket}` : ""}
        </span>
      </div>
      <span className="cell-main">{formatValue(props.edge.absValueUsd, props.pct)}</span>
    </div>
  );
}

/** Supply Chain summary for one ticker on Asset Detail.
 *
 *  Suppliers and customers are shown as separate labelled groups rather than
 *  one merged list: the same percentage means opposite things on the two
 *  sides (a supplier row is that supplier's dependence on this company, a
 *  customer row is this company's dependence on them), so merging them
 *  silently mislabels half the rows. The full interactive board lives at
 *  /splc — this is deliberately a preview. */
export function SplcGraphCard(props: { symbol: string }) {
  const isPro = useIsPro();
  const info = SplcInfoToggle();
  const { data, isLoading } = useQuery({
    // Versioned to match the SPLC page — old persisted entries are the wrong shape.
    queryKey: ["splc-graph", "v2", props.symbol],
    queryFn: () => api.getSplcGraph(props.symbol),
    staleTime: 30 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card>
        <strong>Supply Chain</strong>
        <SkeletonList rows={3} height={30} />
      </Card>
    );
  }

  const suppliers = data.suppliers.map((e) => ({
    edge: e,
    name: e.supplierName,
    pct: e.pctOfSupplierRevenue ?? e.pctOfCustomerBucket,
  }));
  const customers = data.customers.map((e) => ({
    edge: e,
    name: e.customerName,
    pct: e.pctOfSupplierRevenue ?? e.pctOfCustomerBucket,
  }));
  const total = suppliers.length + customers.length;

  const header = (
    <div className="page-header">
      <strong>Supply Chain</strong>
      <span className="splc-header-right">
        {total > 0 && (
          <span className="cell-sub">
            {data.coverage?.disclosedCount ?? 0} disclosed · {data.coverage?.derivedCount ?? 0} derived
          </span>
        )}
        {info.button}
      </span>
    </div>
  );

  if (!data.found || total === 0) {
    return (
      <Card>
        {header}
        {info.panel}
        <div className="cell-sub" style={{ padding: "var(--s4) 0" }}>
          {props.symbol} hasn't named a customer or supplier in its SEC filings. That's normal —
          companies only have to report a counterparty worth more than 10% of sales.
        </div>
      </Card>
    );
  }

  // Gate on the combined count so the free tier sees the same amount of data
  // it would on the main board.
  let budget = FREE_EDGE_LIMIT;
  const group = (
    title: string,
    denominator: string,
    rows: { edge: SplcEdge; name: string; pct: number | null }[],
  ) => {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, PREVIEW_PER_SIDE);
    const free = shown.slice(0, Math.max(0, budget));
    const gated = shown.slice(free.length);
    budget -= free.length;
    return (
      <div className="splc-group">
        <div className="splc-group-head">
          <strong>{title}</strong>
          <span className="splc-col-sub">{denominator}</span>
        </div>
        {free.map((r, i) => (
          <EdgeRow key={`${r.edge.sourceAdsh}-${r.name}-${i}`} edge={r.edge} name={r.name} pct={r.pct} />
        ))}
        {gated.length > 0 && (
          <ProBlur positive unlocked={isPro} className="splc-blur">
            {gated.map((r, i) => (
              <EdgeRow key={`g-${r.edge.sourceAdsh}-${r.name}-${i}`} edge={r.edge} name={r.name} pct={r.pct} />
            ))}
          </ProBlur>
        )}
      </div>
    );
  };

  return (
    <Card>
      {header}
      {info.panel}
      <div className="splc-groups">
        {group("Suppliers", "sell to this company · % = share of the supplier's own revenue", suppliers)}
        {group("Customers", "buy from this company · % = share of this company's revenue", customers)}
      </div>
      <div className="splc-card-footer">
        <Link to="/splc" className="splc-info-btn">
          Open full supply chain →
        </Link>
        {data.lastUpdated && <FreshnessBar lastUpdated={data.lastUpdated} />}
      </div>
    </Card>
  );
}
