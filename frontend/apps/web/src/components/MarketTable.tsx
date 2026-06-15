import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { MarketItem } from "@monysa/contracts";
import { changeClass, fmtPct, fmtPrice } from "@monysa/ui";

/** Searchable price table for indices / commodities / forex rows.
    Rows navigate to the Asset detail page. */
export function MarketTable(props: { items: MarketItem[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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
            {filtered.map((i) => (
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
