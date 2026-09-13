import { z } from "zod";

export const CountryHealthMetricKey = z.enum([
  "policy_rate",
  "credit_gdp",
  "debt_service_ratio",
  "property_price_yoy",
  "reer",
]);
export type CountryHealthMetricKey = z.infer<typeof CountryHealthMetricKey>;

export const CountryHealthMetric = z.object({
  key: CountryHealthMetricKey,
  label: z.string(),
  available: z.boolean(),
  value: z.number().nullable(),
  unit: z.string(),
  change3m: z.number().nullable(),
  change12m: z.number().nullable(),
  deviation10y: z.number().nullable(),
  tag: z.string().nullable(),
  asOf: z.string().nullable(),
});
export type CountryHealthMetric = z.infer<typeof CountryHealthMetric>;

export const CountryHealthResponse = z.object({
  countryCode: z.string(),
  metrics: z.array(CountryHealthMetric),
  lastUpdated: z.string(),
});
export type CountryHealthResponse = z.infer<typeof CountryHealthResponse>;

// A plain COUNT of stressed metrics (0-N), never a weighted score — see
// server/lib/bis/bis-derive.ts's summarizeCountryHealthFlags comment.
export const CountryHealthRanking = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  flaggedCount: z.number(),
  availableCount: z.number(),
});
export type CountryHealthRanking = z.infer<typeof CountryHealthRanking>;

export const CountryHealthRankingResponse = z.object({
  rankings: z.array(CountryHealthRanking),
  lastUpdated: z.string(),
});
export type CountryHealthRankingResponse = z.infer<typeof CountryHealthRankingResponse>;

export const BisCoverageResponse = z.object({
  countries: z.array(z.string()),
  lastUpdated: z.string(),
});
export type BisCoverageResponse = z.infer<typeof BisCoverageResponse>;

// FIN-21 — Currency Valuation on Markets → Forex.
export const CurrencyValuation = z.object({
  code: z.string(),
  name: z.string(),
  flagCountryCode: z.string(),
  available: z.boolean(),
  value: z.number().nullable(),
  deviation10y: z.number().nullable(),
  tag: z.string().nullable(),
  asOf: z.string().nullable(),
});
export type CurrencyValuation = z.infer<typeof CurrencyValuation>;

export const CurrencyValuationResponse = z.object({
  currencies: z.array(CurrencyValuation),
  lastUpdated: z.string(),
});
export type CurrencyValuationResponse = z.infer<typeof CurrencyValuationResponse>;
