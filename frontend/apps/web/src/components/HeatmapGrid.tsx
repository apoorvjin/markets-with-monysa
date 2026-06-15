import { useState } from "react";
import {
  PERF_TIMEFRAMES,
  perfFor,
  type HeatmapTile,
  type PerfTimeframe,
} from "@monysa/contracts";
import { Chip, ChipRow, fmtPct } from "@monysa/ui";

function tileBg(v: number | null): string {
  if (v == null) return "var(--surface-card)";
  const t = Math.max(-1, Math.min(1, v / 4));
  return t >= 0
    ? `rgba(0, 212, 170, ${0.12 + t * 0.5})`
    : `rgba(255, 77, 106, ${0.12 - t * 0.5})`;
}

/** Color-coded performance grid with the full 1D–5Y timeframe selector —
    mirrors shared/widgets/performance_heatmap.dart. */
export function HeatmapGrid(props: { title: string; tiles: HeatmapTile[] }) {
  const [tf, setTf] = useState<PerfTimeframe>("1D");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <div className="page-header">
        <strong>{props.title}</strong>
        <ChipRow>
          {PERF_TIMEFRAMES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              active={tf === t.key}
              onClick={() => setTf(t.key)}
            />
          ))}
        </ChipRow>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: "var(--s2)",
        }}
      >
        {props.tiles.map((tile) => {
          const v = perfFor(tile, tf);
          return (
            <div
              key={tile.name}
              style={{
                background: tileBg(v),
                borderRadius: "var(--r-sm)",
                padding: "var(--s3) var(--s4)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {tile.emoji ?? ""} {tile.name}
              </span>
              <span
                style={{ fontVariantNumeric: "tabular-nums" }}
                className={v == null ? "num-flat" : v >= 0 ? "num-up" : "num-down"}
              >
                {fmtPct(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
