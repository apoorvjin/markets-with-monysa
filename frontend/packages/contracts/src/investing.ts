import { z } from "zod";

export const SectorTariff = z
  .object({
    sectorName: z.string(),
    tariffRate: z.number(),
    sourceURL: z.string().nullish(),
  })
  .passthrough();
export type SectorTariff = z.infer<typeof SectorTariff>;

export const DebtDetail = z
  .object({
    category: z.string(),
    amountBillions: z.number().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough();
export type DebtDetail = z.infer<typeof DebtDetail>;

export const CountryTariff = z
  .object({
    countryName: z.string(),
    countryCode: z.string(),
    tariffRate: z.number(),
    sectors: z.array(SectorTariff).default([]),
    debtToUSA: z.array(DebtDetail).nullish(),
    laymanExplanation: z.string().nullish(),
    lastUpdated: z.string().nullish(),
  })
  .passthrough();
export type CountryTariff = z.infer<typeof CountryTariff>;

export const TariffsResponse = z.object({
  countries: z.array(CountryTariff),
  dataAsOf: z.string().nullish(),
  lastUpdated: z.string().nullish(),
  source: z.string().nullish(),
});
export type TariffsResponse = z.infer<typeof TariffsResponse>;

export const QuiverItem = z
  .object({
    symbol: z.string(),
    name: z.string(),
    price: z.number().nullish(),
    changePercent: z.number().nullish(),
    weight: z.number().nullish(),
    rank: z.number().nullish(),
    badge: z.string().nullish(),
    badgeLabel: z.string().nullish(),
  })
  .passthrough();
export type QuiverItem = z.infer<typeof QuiverItem>;

export const QuiverResponse = z.object({
  items: z.array(QuiverItem),
  meta: z
    .object({ label: z.string().nullish(), rebalance: z.string().nullish() })
    .passthrough()
    .nullish(),
  lastUpdated: z.string().nullish(),
});
export type QuiverResponse = z.infer<typeof QuiverResponse>;

export const CongressTrade = z
  .object({
    memberName: z.string(),
    chamber: z.string().nullish(),
    ticker: z.string().nullish(),
    name: z.string().nullish(),
    assetDescription: z.string().nullish(),
    type: z.string().nullish(),
    transactionDate: z.string().nullish(),
    filingDate: z.string().nullish(),
    amount: z.string().nullish(),
    amountMidpoint: z.number().nullish(),
    party: z.string().nullish(),
    state: z.string().nullish(),
  })
  .passthrough();
export type CongressTrade = z.infer<typeof CongressTrade>;

export const CongressTradesResponse = z.object({
  trades: z.array(CongressTrade),
  total: z.number().nullish(),
  lastUpdated: z.string().nullish(),
});
export type CongressTradesResponse = z.infer<typeof CongressTradesResponse>;

/** Wrapped response — loading=true while the server PDF pipeline runs. */
export const OgeTransaction = z
  .object({
    description: z.string(),
    type: z.string().nullish(),
    date: z.string().nullish(),
    amount: z.string().nullish(),
    amountMidpoint: z.number().nullish(),
    filingDate: z.string().nullish(),
    source: z.string().nullish(),
  })
  .passthrough();
export type OgeTransaction = z.infer<typeof OgeTransaction>;

export const OgeResponse = z.object({
  transactions: z.array(OgeTransaction),
  total: z.number().nullish(),
  lastUpdated: z.string().nullish(),
  loading: z.boolean().nullish(),
});
export type OgeResponse = z.infer<typeof OgeResponse>;

export const HouseTrade = z
  .object({
    representative: z.string().nullish(),
    ticker: z.string().nullish(),
    asset_description: z.string().nullish(),
    type: z.string().nullish(),
    amount: z.string().nullish(),
    transaction_date: z.string().nullish(),
    disclosure_date: z.string().nullish(),
    district: z.string().nullish(),
    state: z.string().nullish(),
    owner: z.string().nullish(),
    ptr_link: z.string().nullish(),
  })
  .passthrough();
export type HouseTrade = z.infer<typeof HouseTrade>;

export const HouseTradesResponse = z.object({
  trades: z.array(HouseTrade),
  total: z.number().nullish(),
  lastUpdated: z.string().nullish(),
});
export type HouseTradesResponse = z.infer<typeof HouseTradesResponse>;
