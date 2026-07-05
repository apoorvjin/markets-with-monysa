import { z } from "zod";

export const EtfCategory = z.enum([
  "sector",
  "broad",
  "international",
  "fixed_income",
  "commodity",
  "thematic",
  "leveraged",
]);
export type EtfCategory = z.infer<typeof EtfCategory>;

export const EtfItem = z
  .object({
    symbol: z.string(),
    name: z.string(),
    emoji: z.string(),
    category: EtfCategory,
    risk: z.string().nullish(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    preMarketPrice: z.number().nullish(),
    preMarketChangePercent: z.number().nullish(),
  })
  .passthrough();
export type EtfItem = z.infer<typeof EtfItem>;

export const EtfListResponse = z.object({
  category: z.string(),
  items: z.array(EtfItem),
  lastUpdated: z.string().nullish(),
});
export type EtfListResponse = z.infer<typeof EtfListResponse>;

export const EtfHolding = z
  .object({
    symbol: z.string().nullish(),
    name: z.string().nullish(),
    weightPct: z.number().nullish(),
  })
  .passthrough();
export type EtfHolding = z.infer<typeof EtfHolding>;

export const EtfSectorWeighting = z
  .object({
    sector: z.string(),
    weightPct: z.number().nullish(),
  })
  .passthrough();
export type EtfSectorWeighting = z.infer<typeof EtfSectorWeighting>;

export const EtfProfileResponse = z.object({
  symbol: z.string(),
  expenseRatio: z.number().nullish(),
  aum: z.number().nullish(),
  family: z.string().nullish(),
  holdings: z.array(EtfHolding).default([]),
  sectorWeightings: z.array(EtfSectorWeighting).default([]),
  lastUpdated: z.string().nullish(),
});
export type EtfProfileResponse = z.infer<typeof EtfProfileResponse>;

export const EtfRotationItem = z
  .object({
    symbol: z.string(),
    name: z.string(),
    emoji: z.string(),
    category: z.string().nullish(),
    rsRatio: z.number().nullish(),
    rsMomentum: z.number().nullish(),
    quadrant: z.enum(["Leading", "Improving", "Weakening", "Lagging"]).nullish(),
  })
  .passthrough();
export type EtfRotationItem = z.infer<typeof EtfRotationItem>;

export const EtfRotationResponse = z.object({
  items: z.array(EtfRotationItem),
  lastUpdated: z.string().nullish(),
});
export type EtfRotationResponse = z.infer<typeof EtfRotationResponse>;
