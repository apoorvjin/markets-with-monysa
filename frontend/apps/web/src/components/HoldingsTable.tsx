import { useNavigate } from "@tanstack/react-router";
import { type MarketItem } from "@monysa/contracts";
import { changeClass, fmtPct, fmtPrice } from "@monysa/ui";

const INITIAL_PALETTES = [
  { bg: "rgba(0,212,170,0.15)", fg: "#00d4aa" },
  { bg: "rgba(99,102,241,0.15)", fg: "#818cf8" },
  { bg: "rgba(245,158,11,0.15)", fg: "#fbbf24" },
  { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa" },
  { bg: "rgba(239,68,68,0.15)", fg: "#f87171" },
  { bg: "rgba(139,92,246,0.15)", fg: "#a78bfa" },
  { bg: "rgba(16,185,129,0.15)", fg: "#34d399" },
  { bg: "rgba(249,115,22,0.15)", fg: "#fb923c" },
] as const;

function inferRegion(item: MarketItem): string {
  const r = (item.region ?? "").toLowerCase();
  if (r) return r.slice(0, 2).toUpperCase();
  const n = item.name.toLowerCase();
  if (n.includes("s&p") || n.includes("dow") || n.includes("nasdaq") || n.includes("russell")) return "US";
  if (n.includes("ftse")) return "UK";
  if (n.includes("dax") || n.includes("euro") || n.includes("cac") || n.includes("aex")) return "EU";
  if (n.includes("nikkei") || n.includes("topix")) return "JP";
  if (n.includes("hang") || n.includes("hsi")) return "HK";
  if (n.includes("nifty") || n.includes("sensex")) return "IN";
  if (n.includes("asx")) return "AU";
  if (n.includes("bovespa") || n.includes("ibov")) return "BR";
  return "—";
}

export function HoldingsTable({ items }: { items: MarketItem[] }) {
  const navigate = useNavigate();

  return (
    <>
      <div className="holdings-tbl-header">
        <span className="holdings-tbl-title">Global Indices</span>
      </div>
      <table className="holdings-tbl">
        <thead>
          <tr>
            <th>Index</th>
            <th>Region</th>
            <th className="num">Price</th>
            <th className="num">1D</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const palette = INITIAL_PALETTES[i % INITIAL_PALETTES.length]!;
            return (
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
                    <div
                      className="sym-initial"
                      style={{ background: palette.bg, color: palette.fg }}
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="sym-name" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="region-badge">{inferRegion(item)}</span>
                </td>
                <td className="num" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: 500 }}>
                  {fmtPrice(item.price, item.currency)}
                </td>
                <td className={`num ${changeClass(item.changePercent)}`}>
                  {fmtPct(item.changePercent)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
