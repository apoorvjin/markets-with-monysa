import { z } from "zod";

/** 10X scanner asset row — v1/v2 share base signals, v3 adds regime signals. */
export const ScannerAsset = z
  .object({
    symbol: z.string(),
    name: z.string(),
    flag: z.string().nullish(),
    category: z.string().nullish(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    volumeRatio: z.number().nullish(),
    // v1/v2 signals
    volumeSpike: z.boolean().nullish(),
    volumeGreen: z.boolean().nullish(),
    heartbeat: z.boolean().nullish(),
    nearBreakout: z.boolean().nullish(),
    recordQuarter: z.boolean().nullish(),
    trendUp: z.boolean().nullish(),
    consolidationRangePct: z.number().nullish(),
    epsApplicable: z.boolean().nullish(),
    // v3 "Super Pine" signals
    thrust: z.boolean().nullish(),
    base: z.boolean().nullish(),
    uptrend: z.boolean().nullish(),
    newHighReclaim: z.boolean().nullish(),
    regimeBreakout: z.boolean().nullish(),
    signalsActive: z.number(),
  })
  .passthrough();
export type ScannerAsset = z.infer<typeof ScannerAsset>;

export const ScannerResponse = z.object({
  assets: z.array(ScannerAsset),
  lastUpdated: z.string().nullish(),
  cacheTtlSeconds: z.number().nullish(),
});
export type ScannerResponse = z.infer<typeof ScannerResponse>;

/** Power Moves scanner versions. v1/v2 apply to Commodities; v3 variants are
    per-category (Indices→v3, Commodities→v3c, Forex→v3f, Crypto→v3crypto). */
export type ScannerVersion = "v1" | "v2" | "v3" | "v3c" | "v3f" | "v3crypto";

export const POWER_MOVES_TYPES = [
  "Indices",
  "Forex",
  "Commodities",
  "Crypto",
] as const;
export type PowerMovesType = (typeof POWER_MOVES_TYPES)[number];

/** Mirrors mobile _onTypeChanged auto-versioning. */
export function defaultVersionForType(t: PowerMovesType): ScannerVersion {
  switch (t) {
    case "Indices":
      return "v3";
    case "Forex":
      return "v3f";
    case "Crypto":
      return "v3crypto";
    default:
      return "v1";
  }
}

export const MULTIBAGGER_COUNTRIES = [
  { param: "us", label: "🇺🇸 US", scannerPath: "stocks" },
  { param: "india", label: "🇮🇳 India", scannerPath: "india" },
  { param: "uk", label: "🇬🇧 UK", scannerPath: "uk" },
  { param: "japan", label: "🇯🇵 Japan", scannerPath: "japan" },
  { param: "hongkong", label: "🇭🇰 HK", scannerPath: "hongkong" },
  { param: "china", label: "🇨🇳 China", scannerPath: "china" },
  { param: "euronext", label: "🇪🇺 Euronext", scannerPath: "euronext" },
] as const;
export type MultibaggerCountry = (typeof MULTIBAGGER_COUNTRIES)[number]["param"];

export const BestSetup = z
  .object({
    symbol: z.string(),
    name: z.string(),
    flag: z.string().nullish(),
    category: z.string().nullish(),
    signalsActive: z.number().nullish(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    volumeRatio: z.number().nullish(),
    winRate1m: z.number().nullish(),
    winRate3m: z.number().nullish(),
    winRate6m: z.number().nullish(),
    winRate1y: z.number().nullish(),
    winRate3y: z.number().nullish(),
    sampleSize3y: z.number().nullish(),
    avgReturn3m: z.number().nullish(),
  })
  .passthrough();
export type BestSetup = z.infer<typeof BestSetup>;

export const BestSetupsResponse = z.object({
  setups: z.array(BestSetup),
  cacheWarm: z.boolean().nullish(),
  lastUpdated: z.string().nullish(),
});
export type BestSetupsResponse = z.infer<typeof BestSetupsResponse>;

export const SectorStockEntry = z
  .object({
    symbol: z.string(),
    name: z.string(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    volumeRatio: z.number().nullish(),
    signalsActive: z.number().nullish(),
    winRate1m: z.number().nullish(),
  })
  .passthrough();
export type SectorStockEntry = z.infer<typeof SectorStockEntry>;

export const SectorBestSetupsGroup = z
  .object({
    sector: z.string(),
    emoji: z.string().nullish(),
    stocks: z.array(SectorStockEntry).default([]),
  })
  .passthrough();
export type SectorBestSetupsGroup = z.infer<typeof SectorBestSetupsGroup>;

/** Cold cache returns cacheWarm:false skeleton in <5ms — client must poll
    (30s interval, max 10 attempts), never block. */
export const SectorBestSetupsResponse = z.object({
  leading: z.array(SectorBestSetupsGroup).default([]),
  improving: z.array(SectorBestSetupsGroup).default([]),
  cacheWarm: z.boolean(),
  version: z.string().nullish(),
  lastUpdated: z.string().nullish(),
});
export type SectorBestSetupsResponse = z.infer<typeof SectorBestSetupsResponse>;

/** Institutional Flow scanner — pump-signal stock lists.
    Types: accumulation | distribution | vwap | obv | short | insider. */
export const INSTITUTIONAL_FLOW_TYPES = [
  { param: "accumulation", label: "Accumulation" },
  { param: "distribution", label: "Distribution" },
  { param: "vwap", label: "VWAP Break" },
  { param: "obv", label: "OBV Divergence" },
  { param: "short", label: "Short Squeeze" },
  { param: "insider", label: "Insider Clusters" },
] as const;
export type InstitutionalFlowType =
  (typeof INSTITUTIONAL_FLOW_TYPES)[number]["param"];

export const InstitutionalFlowAsset = z
  .object({
    symbol: z.string(),
    name: z.string(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    volumeRatio: z.number().nullish(),
    vwapDeviation: z.number().nullish(),
    obvSlopeRatio: z.number().nullish(),
    periodChangePercent: z.number().nullish(),
    shortPercentFloat: z.number().nullish(),
    shortRatio: z.number().nullish(),
    insiderCount: z.number().nullish(),
    filingCount: z.number().nullish(),
  })
  .passthrough();
export type InstitutionalFlowAsset = z.infer<typeof InstitutionalFlowAsset>;

export const InstitutionalFlowResponse = z.object({
  assets: z.array(InstitutionalFlowAsset).default([]),
  type: z.string().nullish(),
  lastUpdated: z.string().nullish(),
});
export type InstitutionalFlowResponse = z.infer<typeof InstitutionalFlowResponse>;

export const RegimeSummaryResponse = z
  .object({
    bullish: z.number(),
    neutral: z.number(),
    bearish: z.number(),
    total: z.number(),
    regimeBreakdown: z.record(z.number()).nullish(),
    topBullish: z
      .array(
        z
          .object({
            symbol: z.string(),
            name: z.string(),
            flag: z.string().nullish(),
            confidence: z.number().nullish(),
          })
          .passthrough(),
      )
      .default([]),
    topBearish: z
      .array(
        z
          .object({
            symbol: z.string(),
            name: z.string(),
            flag: z.string().nullish(),
            confidence: z.number().nullish(),
          })
          .passthrough(),
      )
      .default([]),
    lastUpdated: z.string().nullish(),
  })
  .passthrough();
export type RegimeSummaryResponse = z.infer<typeof RegimeSummaryResponse>;

export const EarningsItem = z
  .object({
    symbol: z.string(),
    name: z.string().nullish(),
    sector: z.string().nullish(),
    earningsDate: z.string().nullish(),
  })
  .passthrough();
export type EarningsItem = z.infer<typeof EarningsItem>;

export const EarningsResponse = z.object({
  items: z.array(EarningsItem),
  lastUpdated: z.string().nullish(),
});
export type EarningsResponse = z.infer<typeof EarningsResponse>;

/** CFTC COT position row (hedge-fund positioning). */
export const CotItem = z
  .object({
    name: z.string(),
    emoji: z.string().nullish(),
    symbol: z.string().nullish(),
    category: z.string().nullish(),
    longContracts: z.number().nullish(),
    shortContracts: z.number().nullish(),
    netPosition: z.number().nullish(),
    longPct: z.number().nullish(),
    sentiment: z.string().nullish(),
    weekNetChange: z.number().nullish(),
    weekNetChangePct: z.number().nullish(),
    reportDate: z.string().nullish(),
    usdBias: z.string().nullish(),
  })
  .passthrough();
export type CotItem = z.infer<typeof CotItem>;

export const CotResponse = z
  .object({
    metals: z.array(CotItem).default([]),
    indicesRates: z.array(CotItem).default([]),
    currencies: z.array(CotItem).default([]),
    energy: z.array(CotItem).default([]),
    agriculture: z.array(CotItem).default([]),
    lastUpdated: z.string().nullish(),
  })
  .passthrough();
export type CotResponse = z.infer<typeof CotResponse>;
