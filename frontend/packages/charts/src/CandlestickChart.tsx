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
  volume?: number | null;
}

/** Indicator line drawn over the candles (SMA/EMA/BB legs, server-computed). */
export interface ChartOverlay {
  label: string;
  color: string;
  points: { time: string | number; value: number }[];
  dashed?: boolean;
}

/** Horizontal level (signal entry/SL/TP, pivot points). */
export interface ChartPriceLine {
  label: string;
  price: number;
  color: string;
}

function toLineData(
  points: { time: string | number; value: number }[],
): { time: Time; value: number }[] {
  return points.map((p) => ({
    time: (typeof p.time === "number" ? p.time : p.time.slice(0, 10)) as Time,
    value: p.value,
  }));
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
  /** Volume histogram at the bottom ~20% — mirrors the mobile LWC chart. */
  showVolume?: boolean;
  /** Cumulative VWAP overlay line — mirrors the mobile LWC chart. */
  withVwap?: boolean;
  overlays?: ChartOverlay[];
  priceLines?: ChartPriceLine[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const up = props.upColor ?? "#00d4aa";
  const down = props.downColor ?? "#ff4d6a";
  const showVolume = props.showVolume ?? true;
  const withVwap = props.withVwap ?? false;

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
    const data = toSeriesData(props.candles);
    series.setData(data);

    if (showVolume) {
      const upVol = "rgba(0,212,170,0.3)";
      const downVol = "rgba(255,77,106,0.3)";
      const volumeSeries = chart.addHistogramSeries({
        color: upVol,
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      chart.priceScale("").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(
        props.candles.map((c, i) => ({
          time: data[i]!.time,
          value: c.volume ?? 0,
          color: c.close >= c.open ? upVol : downVol,
        })),
      );
    }

    if (withVwap) {
      const vwapData: { time: Time; value: number }[] = [];
      let cumPV = 0;
      let cumVol = 0;
      props.candles.forEach((c, i) => {
        const typical = (c.high + c.low + c.close) / 3;
        const v = c.volume ?? 0;
        cumPV += typical * v;
        cumVol += v;
        if (cumVol > 0) {
          vwapData.push({ time: data[i]!.time, value: cumPV / cumVol });
        }
      });
      if (vwapData.length > 0) {
        const vwapSeries = chart.addLineSeries({
          color: "#ffb84d",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        vwapSeries.setData(vwapData);
      }
    }

    for (const overlay of props.overlays ?? []) {
      if (overlay.points.length === 0) continue;
      const line = chart.addLineSeries({
        color: overlay.color,
        lineWidth: 2,
        lineStyle: overlay.dashed ? 2 : 0,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line.setData(toLineData(overlay.points));
    }

    for (const pl of props.priceLines ?? []) {
      series.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: pl.label,
      });
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
    // Recreating the chart on data change is fine at this data size and
    // keeps the effect self-contained.
  }, [
    props.candles,
    props.height,
    up,
    down,
    showVolume,
    withVwap,
    props.overlays,
    props.priceLines,
  ]);

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
