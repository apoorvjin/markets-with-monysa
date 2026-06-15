import { z } from "zod";

export const TreemapStock = z
  .object({
    symbol: z.string(),
    name: z.string(),
    sector: z.string().nullish(),
    /** native-currency cap; use effectiveMarketCap() for tile sizing */
    marketCap: z.number().nullish(),
    changePercent: z.number().nullish(),
    price: z.number().nullish(),
    dayHigh: z.number().nullish(),
    dayLow: z.number().nullish(),
    fiftyTwoWeekHigh: z.number().nullish(),
    fiftyTwoWeekLow: z.number().nullish(),
    sparkline: z.array(z.number()).nullish(),
    preMarketPrice: z.number().nullish(),
    preMarketChangePercent: z.number().nullish(),
    postMarketPrice: z.number().nullish(),
    postMarketChangePercent: z.number().nullish(),
    nativeCurrency: z.string().nullish(),
    /** FX-normalised USD cap; null when the FX fetch failed */
    marketCapUsd: z.number().nullish(),
    fxRateUsed: z.number().nullish(),
  })
  .passthrough();
export type TreemapStock = z.infer<typeof TreemapStock>;

/** Tile sizing must use this so cross-index comparison is meaningful. */
export function effectiveMarketCap(s: TreemapStock): number {
  return s.marketCapUsd ?? s.marketCap ?? 0;
}

export const TreemapResponse = z.object({
  index: z.string(),
  timeframe: z.string().nullish(),
  limit: z.number().nullish(),
  total: z.number().nullish(),
  stocks: z.array(TreemapStock),
  lastUpdated: z.string().nullish(),
  marketState: z.string().nullish(),
});
export type TreemapResponse = z.infer<typeof TreemapResponse>;

export const TREEMAP_INDICES = [
  { param: "sp500", label: "S&P 500" },
  { param: "ndx", label: "NASDAQ 100" },
  { param: "dji", label: "Dow Jones" },
  { param: "russell2000", label: "Russell 2000" },
  { param: "ftse100", label: "FTSE 100" },
  { param: "dax40", label: "DAX 40" },
  { param: "nikkei225", label: "Nikkei 225" },
  { param: "hsi", label: "Hang Seng" },
  { param: "nifty50", label: "Nifty 50" },
] as const;
export type TreemapIndexParam = (typeof TREEMAP_INDICES)[number]["param"];

export const TREEMAP_TIMEFRAMES = ["1d", "1w", "1m", "ytd"] as const;
export type TreemapTimeframe = (typeof TREEMAP_TIMEFRAMES)[number];

export const HeatmapTile = z
  .object({
    name: z.string(),
    emoji: z.string().nullish(),
    symbol: z.string().nullish(),
    category: z.string().nullish(),
    changePercent: z.number().nullish(),
    perf1W: z.number().nullish(),
    perf1M: z.number().nullish(),
    perf3M: z.number().nullish(),
    perf6M: z.number().nullish(),
    perf1Y: z.number().nullish(),
    perf3Y: z.number().nullish(),
    perf5Y: z.number().nullish(),
  })
  .passthrough();
export type HeatmapTile = z.infer<typeof HeatmapTile>;

/** GET /api/heatmap — keys are `regions` and `assetClasses`, NOT `tiles`. */
export const HeatmapResponse = z.object({
  regions: z.array(HeatmapTile).default([]),
  assetClasses: z.array(HeatmapTile).default([]),
  lastUpdated: z.string().nullish(),
});
export type HeatmapResponse = z.infer<typeof HeatmapResponse>;

/** GET /api/heatmap/movers — pre/post-market aware top movers for an index. */
export const MoversResponse = z.object({
  index: z.string().nullish(),
  session: z.string().nullish(),
  marketState: z.string().nullish(),
  gainers: z.array(TreemapStock).default([]),
  losers: z.array(TreemapStock).default([]),
  lastUpdated: z.string().nullish(),
});
export type MoversResponse = z.infer<typeof MoversResponse>;

export const PERF_TIMEFRAMES = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" },
  { key: "3Y", label: "3Y" },
  { key: "5Y", label: "5Y" },
] as const;
export type PerfTimeframe = (typeof PERF_TIMEFRAMES)[number]["key"];

/** Pick the perf value for a timeframe from any tile-like object. */
export function perfFor(
  t: {
    changePercent?: number | null;
    perf1W?: number | null;
    perf1M?: number | null;
    perf3M?: number | null;
    perf6M?: number | null;
    perf1Y?: number | null;
    perf3Y?: number | null;
    perf5Y?: number | null;
  },
  tf: PerfTimeframe,
): number | null {
  switch (tf) {
    case "1D":
      return t.changePercent ?? null;
    case "1W":
      return t.perf1W ?? null;
    case "1M":
      return t.perf1M ?? null;
    case "3M":
      return t.perf3M ?? null;
    case "6M":
      return t.perf6M ?? null;
    case "1Y":
      return t.perf1Y ?? null;
    case "3Y":
      return t.perf3Y ?? null;
    case "5Y":
      return t.perf5Y ?? null;
  }
}
