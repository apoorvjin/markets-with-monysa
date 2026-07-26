import { changeClass, fmtPct } from "@monysa/ui";

export interface MoverItem {
  symbol: string;
  name: string;
  change: number;
}

export function MoversCard({
  title,
  items,
}: {
  title: string;
  items: MoverItem[];
}) {
  const maxAbs = Math.max(1e-9, ...items.map((i) => Math.abs(i.change)));

  return (
    <div className="ui-metric-card movers-card">
      <div className="movers-card-title">{title}</div>
      {items.map((item, i) => (
        <div className="movers-row" key={item.symbol}>
          <span className="movers-rank">{i + 1}</span>
          <span className="movers-name" title={item.name}>
            {item.name}
          </span>
          <span className="ui-gradient-bar movers-bar">
            <span
              className="ui-gradient-bar-fill"
              data-dir={item.change < 0 ? "down" : "up"}
              style={{ width: `${(Math.abs(item.change) / maxAbs) * 100}%` }}
            />
          </span>
          <span className={`movers-pct ${changeClass(item.change)}`}>
            {fmtPct(item.change)}
          </span>
        </div>
      ))}
    </div>
  );
}
