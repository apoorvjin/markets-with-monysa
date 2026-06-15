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

export const ChartResponse = z.object({
  candles: z.array(Candle),
  symbol: z.string().nullish(),
  lastUpdated: z.string().nullish(),
});
export type ChartResponse = z.infer<typeof ChartResponse>;

export type ChartRange = "1mo" | "3mo" | "6mo" | "1y" | "5y";
