import { z } from "zod";

export const VolatilityAsset = z
  .object({
    symbol: z.string(),
    name: z.string(),
    flag: z.string().nullish(),
    category: z.string().nullish(),
    volatilityMult: z.number().nullish(),
    direction: z.string().nullish(),
    description: z.string().nullish(),
    price: z.number(),
    change: z.number().nullish(),
    changePercent: z.number().nullish(),
    changePercent1W: z.number().nullish(),
    changePercent1M: z.number().nullish(),
    changePercent3M: z.number().nullish(),
    sparkline: z.array(z.number()).nullish(),
  })
  .passthrough();
export type VolatilityAsset = z.infer<typeof VolatilityAsset>;

/** key is `items` (NOT `assets`); vix is an object — read vix.price. */
export const VolatilityAssetsResponse = z.object({
  items: z.array(VolatilityAsset),
  vix: z
    .object({
      price: z.number(),
      band: z.string().nullish(),
      bandLabel: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
  lastUpdated: z.string().nullish(),
});
export type VolatilityAssetsResponse = z.infer<typeof VolatilityAssetsResponse>;

export const FearGreedResponse = z.object({
  value: z.number(),
  classification: z.string(),
  history: z
    .array(z.object({ value: z.number(), date: z.string() }))
    .nullish(),
  lastUpdated: z.string().nullish(),
});
export type FearGreedResponse = z.infer<typeof FearGreedResponse>;

export const BondsResponse = z.object({
  us3m: z.number(),
  us5y: z.number(),
  us10y: z.number(),
  us30y: z.number(),
  spread3m10y: z.number(),
  curveStatus: z.string(),
  lastUpdated: z.string().nullish(),
});
export type BondsResponse = z.infer<typeof BondsResponse>;

export const Sector = z
  .object({
    symbol: z.string().nullish(),
    name: z.string(),
    emoji: z.string().nullish(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    perf1W: z.number().nullish(),
    perf1M: z.number().nullish(),
    perf3M: z.number().nullish(),
    perf6M: z.number().nullish(),
    perf1Y: z.number().nullish(),
    perf3Y: z.number().nullish(),
    perf5Y: z.number().nullish(),
    /** SPX-relative RRG values, centred at 100 */
    rsRatio: z.number().nullish(),
    rsMomentum: z.number().nullish(),
  })
  .passthrough();
export type Sector = z.infer<typeof Sector>;

export const SectorsResponse = z.object({
  sectors: z.array(Sector),
  lastUpdated: z.string().nullish(),
});
export type SectorsResponse = z.infer<typeof SectorsResponse>;

export const Crisis = z
  .object({
    id: z.string().nullish(),
    name: z.string(),
    period: z.string().nullish(),
    vixPeak: z.number().nullish(),
    status: z.string().nullish(),
    outcome: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
export type Crisis = z.infer<typeof Crisis>;

export const CrisesResponse = z.object({
  crises: z.array(Crisis),
  dataAsOf: z.string().nullish(),
  lastUpdated: z.string().nullish(),
});
export type CrisesResponse = z.infer<typeof CrisesResponse>;

export const EconomyEvent = z
  .object({
    date: z.string(),
    time: z.string().nullish(),
    country: z.string().nullish(),
    event: z.string(),
    impact: z.string().nullish(),
    previous: z.string().nullish(),
    forecast: z.string().nullish(),
  })
  .passthrough();
export type EconomyEvent = z.infer<typeof EconomyEvent>;

export const EconomyEventsResponse = z.object({
  events: z.array(EconomyEvent),
  lastUpdated: z.string().nullish(),
});
export type EconomyEventsResponse = z.infer<typeof EconomyEventsResponse>;

export const YieldCurvePoint = z.object({
  date: z.string(),
  us3m: z.number().nullish(),
  us5y: z.number().nullish(),
  us10y: z.number().nullish(),
  us30y: z.number().nullish(),
});
export type YieldCurvePoint = z.infer<typeof YieldCurvePoint>;

export const YieldCurveHistoryResponse = z.object({
  series: z.array(YieldCurvePoint),
  lastUpdated: z.string().nullish(),
});
export type YieldCurveHistoryResponse = z.infer<typeof YieldCurveHistoryResponse>;

/** POST /api/volatility/briefing → { briefing } (GPT macro stress analysis). */
export const BriefingResponse = z.object({ briefing: z.string().default("") });
export type BriefingResponse = z.infer<typeof BriefingResponse>;

export const UsaDebtResponse = z
  .object({
    recordDate: z.string().nullish(),
    totalDebt: z.number().nullish(),
    totalDebtFormatted: z.string().nullish(),
    debtPerCitizen: z.string().nullish(),
    debtPerTaxpayer: z.string().nullish(),
    debtToGdpRatio: z.string().nullish(),
    dailyIncrease: z.string().nullish(),
    annualDeficit: z.string().nullish(),
    interestPayments: z.string().nullish(),
  })
  .passthrough();
export type UsaDebtResponse = z.infer<typeof UsaDebtResponse>;
