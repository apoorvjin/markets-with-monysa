import { z } from "zod";

/** Row in /api/futures/{indices,commodities,forex} — also country stocks. */
export const MarketItem = z
  .object({
    symbol: z.string(),
    name: z.string(),
    region: z.string().nullish(),
    flag: z.string().nullish(),
    openTime: z.string().nullish(),
    tz: z.string().nullish(),
    currency: z.string().nullish(),
    price: z.number().nullish(),
    change: z.number().nullish(),
    changePercent: z.number().nullish(),
  })
  .passthrough();
export type MarketItem = z.infer<typeof MarketItem>;

export const FuturesResponse = z.object({
  items: z.array(MarketItem),
  lastUpdated: z.string().nullish(),
});
export type FuturesResponse = z.infer<typeof FuturesResponse>;

export const Candle = z.object({
  time: z.union([z.string(), z.number()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullish(),
});
export type Candle = z.infer<typeof Candle>;

/** One point of a server-computed indicator series (?indicators= on /api/chart). */
export const IndicatorPoint = z.object({
  time: z.union([z.string(), z.number()]),
  value: z.number(),
});
export type IndicatorPoint = z.infer<typeof IndicatorPoint>;

const LineIndicator = z.array(IndicatorPoint);
const BollingerIndicator = z.object({
  upper: LineIndicator,
  mid: LineIndicator,
  lower: LineIndicator,
});
const MacdIndicator = z.object({
  macd: LineIndicator,
  signal: LineIndicator,
  histogram: LineIndicator,
});
const StochIndicator = z.object({ k: LineIndicator, d: LineIndicator });
const AdxIndicator = z.object({
  adx: LineIndicator,
  plusDi: LineIndicator,
  minusDi: LineIndicator,
});
const PivotIndicator = z.array(
  z.object({ label: z.string(), price: z.number() }),
);

/** Keyed by the request spec entry, e.g. "sma:20" or "bb:20:2". */
export const IndicatorSeries = z.union([
  BollingerIndicator,
  MacdIndicator,
  StochIndicator,
  AdxIndicator,
  PivotIndicator,
  LineIndicator,
]);
export type IndicatorSeries = z.infer<typeof IndicatorSeries>;

export const ChartResponse = z.object({
  candles: z.array(Candle),
  symbol: z.string().nullish(),
  lastUpdated: z.string().nullish(),
  indicators: z.record(IndicatorSeries).optional(),
});
export type ChartResponse = z.infer<typeof ChartResponse>;

export type ChartRange = "1mo" | "3mo" | "6mo" | "1y" | "5y";
