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
  return (
    <div className="ui-metric-card movers-card">
      <div className="movers-card-title">{title}</div>
      {items.map((item, i) => (
        <div className="movers-row" key={item.symbol}>
          <span className="movers-rank">{i + 1}</span>
          <span className="movers-name" title={item.name}>
            {item.name}
          </span>
          <span className={`movers-pct ${changeClass(item.change)}`}>
            {fmtPct(item.change)}
          </span>
        </div>
      ))}
    </div>
  );
}
