import { useEffect, useRef } from "react";
import { ColorType, createChart, type Time } from "lightweight-charts";

export interface LineSeriesInput {
  label: string;
  color: string;
  points: { time: string; value: number }[];
}

/** Multi-series line chart (e.g. yield-curve history: 3M/5Y/10Y/30Y). */
export function MultiLineChart(props: { series: LineSeriesInput[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: props.height ?? 260,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#adb5bd",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
      timeScale: { borderColor: "rgba(255,255,255,0.12)" },
    });
    for (const s of props.series) {
      const line = chart.addLineSeries({
        color: s.color,
        lineWidth: 2,
        title: s.label,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      line.setData(
        s.points.map((p) => ({ time: p.time.slice(0, 10) as Time, value: p.value })),
      );
    }
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [props.series, props.height]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        background: "#0a0a0a",
      }}
    />
  );
}
