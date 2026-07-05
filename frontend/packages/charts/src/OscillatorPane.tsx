import { useEffect, useRef } from "react";
import { ColorType, createChart, type Time } from "lightweight-charts";

export interface OscillatorLine {
  label: string;
  color: string;
  points: { time: string | number; value: number }[];
}

/**
 * Small sub-pane chart for oscillator indicators (RSI, MACD, Stochastic,
 * ADX) below the main CandlestickChart — mirrors the mobile in-house chart's
 * sub-pane pattern. Always dark, like CandlestickChart.
 */
export function OscillatorPane(props: {
  lines: OscillatorLine[];
  height?: number;
  /** Horizontal guide levels, e.g. RSI 70/30 or ADX 25. */
  guides?: { value: number; color: string }[];
  /** Fix the value scale, e.g. [0, 100] for RSI/Stochastic. */
  range?: [number, number];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: props.height ?? 120,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#adb5bd",
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
      timeScale: { borderColor: "rgba(255,255,255,0.12)", visible: false },
      handleScroll: false,
      handleScale: false,
    });

    let first = true;
    for (const line of props.lines) {
      if (line.points.length === 0) continue;
      const series = chart.addLineSeries({
        color: line.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: line.label,
        ...(props.range
          ? {
              autoscaleInfoProvider: () => ({
                priceRange: { minValue: props.range![0], maxValue: props.range![1] },
              }),
            }
          : {}),
      });
      series.setData(
        line.points.map((p) => ({
          time: (typeof p.time === "number"
            ? p.time
            : p.time.slice(0, 10)) as Time,
          value: p.value,
        })),
      );
      if (first) {
        for (const g of props.guides ?? []) {
          series.createPriceLine({
            price: g.value,
            color: g.color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: "",
          });
        }
        first = false;
      }
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [props.lines, props.height, props.guides, props.range]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        background: "#0a0a0a",
        marginTop: 4,
      }}
    />
  );
}
