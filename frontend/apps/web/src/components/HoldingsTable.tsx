import { useNavigate } from "@tanstack/react-router";
import { type MarketItem } from "@monysa/contracts";
import { changeClass, fmtPct, fmtPrice } from "@monysa/ui";
import { Sparkline } from "@monysa/charts";

/** Index rows for the Overview. Identity comes from the row's own `flag` +
    `region` — the previous version drew a coloured letter tile from a
    hardcoded 8-hex palette (ignoring the theme) and squeezed `region` through
    `slice(0,2)`, which rendered "United States" as "UN" and "Hong Kong" as
    "HO". Both fields ship on every row; neither needed inventing. */
export function HoldingsTable({ items }: { items: MarketItem[] }) {
  const navigate = useNavigate();

  return (
    <table className="holdings-tbl">
      <thead>
        <tr>
          <th>Index</th>
          <th>Region</th>
          <th>1M</th>
          <th className="num">Price</th>
          <th className="num">1D</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.symbol}
            onClick={() =>
              void navigate({
                to: "/asset/$symbol",
                params: { symbol: item.symbol },
                search: { name: item.name },
              })
            }
          >
            <td>
              <div className="holdings-cell-name">
                <span className="holdings-flag" aria-hidden="true">
                  {item.flag ?? "—"}
                </span>
                <span className="sym-name" title={item.name}>
                  {item.name}
                </span>
                <span className="cell-sub">{item.symbol}</span>
              </div>
            </td>
            <td className="cell-sub">{item.region ?? "—"}</td>
            <td className="holdings-spark">
              {item.sparkline && item.sparkline.length > 1 ? (
                <Sparkline
                  points={item.sparkline}
                  width={72}
                  height={22}
                  positive={(item.changePercent ?? 0) >= 0}
                />
              ) : (
                <span className="cell-sub">—</span>
              )}
            </td>
            <td className="num holdings-price">
              {fmtPrice(item.price, item.currency)}
            </td>
            <td className={`num ${changeClass(item.changePercent)}`}>
              {fmtPct(item.changePercent)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
