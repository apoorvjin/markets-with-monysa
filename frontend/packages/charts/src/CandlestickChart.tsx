import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type Time,
} from "lightweight-charts";

export interface CandleInput {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function toSeriesData(candles: CandleInput[]): CandlestickData<Time>[] {
  const out: CandlestickData<Time>[] = [];
  for (const c of candles) {
    let time: Time;
    if (typeof c.time === "number") {
      time = c.time as Time;
    } else {
      // ISO strings → 'YYYY-MM-DD' business day
      time = c.time.slice(0, 10) as Time;
    }
    out.push({ time, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return out;
}

export function CandlestickChart(props: {
  candles: CandleInput[];
  height?: number;
  /** Charts stay dark in both themes — matches the mobile ChartModal. */
  upColor?: string;
  downColor?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const up = props.upColor ?? "#00d4aa";
  const down = props.downColor ?? "#ff4d6a";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: props.height ?? 380,
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
    const series = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
    series.setData(toSeriesData(props.candles));
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
    // Recreating the chart on data change is fine at this data size and
    // keeps the effect self-contained.
  }, [props.candles, props.height, up, down]);

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
