import { z } from "zod";

export const SplcEdgeMethod = z.enum([
  "disclosed_supplier_side",
  "disclosed_customer_side",
  "derived",
  "government_contract",
]);
export type SplcEdgeMethod = z.infer<typeof SplcEdgeMethod>;

export const SplcCostBucket = z.enum(["COGS", "CAPEX", "RD", "SGA"]);
export type SplcCostBucket = z.infer<typeof SplcCostBucket>;

export const SplcEdge = z
  .object({
    supplierCik: z.string(),
    customerCik: z.string().nullable(),
    supplierName: z.string(),
    customerName: z.string(),
    costBucket: SplcCostBucket.nullable(),
    method: SplcEdgeMethod,
    pctOfSupplierRevenue: z.number().nullable(),
    pctOfCustomerBucket: z.number().nullable(),
    absValueUsd: z.number().nullable(),
    supplierFiscalPeriodEnd: z.string().nullable(),
    customerFiscalPeriodEnd: z.string().nullable(),
    periodMismatchDays: z.number().nullable(),
    confidence: z.number(),
    sourceAdsh: z.string(),
  })
  .passthrough();
export type SplcEdge = z.infer<typeof SplcEdge>;

export const SplcCoverage = z.object({
  disclosedCount: z.number(),
  derivedCount: z.number(),
});
export type SplcCoverage = z.infer<typeof SplcCoverage>;

export const SplcUniverseCompany = z
  .object({
    ticker: z.string(),
    name: z.string(),
    supplierCount: z.number().default(0),
    customerCount: z.number().default(0),
  })
  .passthrough();
export type SplcUniverseCompany = z.infer<typeof SplcUniverseCompany>;

export const SplcUniverseResponse = z.object({
  companies: z.array(SplcUniverseCompany).default([]),
  lastUpdated: z.string().nullish(),
});
export type SplcUniverseResponse = z.infer<typeof SplcUniverseResponse>;

export const SplcGraphResponse = z.object({
  ticker: z.string(),
  found: z.boolean(),
  cik: z.string().nullish(),
  name: z.string().nullish(),
  suppliers: z.array(SplcEdge).default([]),
  customers: z.array(SplcEdge).default([]),
  coverage: SplcCoverage.nullable(),
  lastUpdated: z.string().nullish(),
});
export type SplcGraphResponse = z.infer<typeof SplcGraphResponse>;
