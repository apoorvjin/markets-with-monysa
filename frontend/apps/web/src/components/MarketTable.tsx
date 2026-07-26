import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { CbRateInfo, MarketItem } from "@monysa/contracts";
import { changeClass, fmtPct, fmtPrice, ProBlur } from "@monysa/ui";
import { api } from "../lib/api";

/** Base/quote rate-comparison label for a forex pair like EURUSD=X.
    Pro-gated: mirrors _FxDifferential in the Flutter app (teaser-only on web
    — there is no purchase flow here, so it never unlocks). */
function FxDifferential(props: {
  symbol: string;
  rates: Record<string, CbRateInfo> | undefined;
  forceReveal?: boolean;
}) {
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
    <ProBlur positive={diff >= 0} className="fx-diff-blur">
      {label}
    </ProBlur>
  );
}

/** Searchable price table for indices / commodities / forex rows.
    Rows navigate to the Asset detail page. */
export function MarketTable(props: { items: MarketItem[]; isForex?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { data: cbRates } = useQuery({
    queryKey: ["central-bank-rates"],
    queryFn: () => api.getCentralBankRates(),
    staleTime: 6 * 3600_000,
    enabled: !!props.isForex,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.items;
    return props.items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q),
    );
  }, [props.items, query]);

  return (
    <>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Filter by name or symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="ui-freshness">{filtered.length} instruments</span>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Region</th>
              <th className="num">Price</th>
              <th className="num">Change</th>
              <th className="num">Change %</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i, idx) => (
              <tr
                key={i.symbol}
                className="clickable"
                onClick={() =>
                  void navigate({
                    to: "/asset/$symbol",
                    params: { symbol: i.symbol },
                    search: { name: i.name },
                  })
                }
              >
                <td>
                  <span style={{ marginRight: 8 }}>{i.flag ?? ""}</span>
                  <span className="cell-main">{i.name}</span>{" "}
                  <span className="cell-sub">{i.symbol}</span>
                  {props.isForex && (
                    <div>
                      <FxDifferential
                        symbol={i.symbol}
                        rates={cbRates?.rates}
                        forceReveal={idx === 0}
                      />
                    </div>
                  )}
                </td>
                <td className="cell-sub">{i.region ?? "—"}</td>
                <td className="num cell-main">{fmtPrice(i.price, i.currency)}</td>
                <td className={`num ${changeClass(i.change)}`}>
                  {i.change == null ? "—" : i.change.toFixed(2)}
                </td>
                <td className={`num ${changeClass(i.changePercent)}`}>
                  {fmtPct(i.changePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
