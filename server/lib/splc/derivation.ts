// Two-sided quantification: one company's disclosed customer/supplier
// concentration becomes a quantified edge for the (undisclosed) counterparty
// too, once we know the counterparty's own financials.
//
//   edgeValue            = pctOfSupplierRevenue * Revenue_supplier
//   pctOfCustomerBucket   = edgeValue / Bucket_customer
//
// Denominators come from SEC's per-company companyconcept API (verified live
// against real filings while building this — see fetchAnnualConcept below).
// That API is non-dimensional, which is exactly why it's only used for
// denominators here and never for the concentration facts themselves (those
// come from sec-notes-ingest.ts, which does carry the dimensional data).

import type { ConcentrationType, RawConcentrationFact } from "./sec-notes-ingest";
import type { CostBucket } from "./cost-buckets";
import { secFetch } from "./sec-fetch";

// Tried in priority order — filers are inconsistent about which XBRL tag
// they use for a given concept across years.
const CONCEPT_FALLBACKS: Record<CostBucket | "REVENUE", string[]> = {
  REVENUE: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
  COGS: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  CAPEX: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  RD: ["ResearchAndDevelopmentExpense"],
  SGA: ["SellingGeneralAndAdministrativeExpense"],
};

// Companies that break SG&A into separate G&A + Selling/Marketing lines
// (Microsoft is one — verified live: it 404s on the combined tag) don't
// match any single fallback above. When the combined tag is absent, sum
// these two instead of silently giving up on the whole bucket.
const SGA_COMPOSITE = ["GeneralAndAdministrativeExpense", "SellingAndMarketingExpense"];

interface AnnualFact {
  value: number;
  periodEnd: string; // YYYY-MM-DD
}

async function fetchAnnualConcept(cik: string, concept: string): Promise<AnnualFact | null> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`;
  const res = await secFetch(url);
  if (!res.ok) return null; // 404 is expected — not every filer uses every tag

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null; // SEC occasionally serves a non-JSON error body
  }

  // USD only, and only when it's actually an array. Foreign private issuers
  // (20-F) report in their own currency, and mixing currencies into one
  // derivation would silently produce a wrong ratio — skip rather than guess
  // an FX rate.
  const units = (data as { units?: Record<string, unknown> } | null)?.units;
  const rows = units?.USD;
  if (!Array.isArray(rows)) return null;

  const annual = (rows as Array<{ val: number; end: string; form: string; fp: string }>)
    .filter((r) => r && r.form === "10-K" && r.fp === "FY" && Number.isFinite(r.val))
    .sort((a, b) => (a.end < b.end ? 1 : -1));

  return annual[0] ? { value: annual[0].val, periodEnd: annual[0].end } : null;
}

/** Tries each fallback tag in order; for SGA, sums G&A + Selling/Marketing if the combined tag is absent. */
export async function fetchDenominator(
  cik: string,
  kind: CostBucket | "REVENUE",
): Promise<AnnualFact | null> {
  for (const concept of CONCEPT_FALLBACKS[kind]) {
    const fact = await fetchAnnualConcept(cik, concept);
    if (fact) return fact;
  }

  if (kind === "SGA") {
    const parts = await Promise.all(SGA_COMPOSITE.map((c) => fetchAnnualConcept(cik, c)));
    const resolved = parts.filter((p): p is AnnualFact => p !== null);
    if (resolved.length === SGA_COMPOSITE.length) {
      return { value: resolved.reduce((sum, p) => sum + p.value, 0), periodEnd: resolved[0].periodEnd };
    }
  }

  return null;
}

export type EdgeMethod =
  | "disclosed_supplier_side"
  | "disclosed_customer_side"
  | "derived"
  | "government_contract";

export interface DerivedEdge {
  supplierCik: string;
  customerCik: string | null; // null when the counterparty couldn't be resolved to a CIK (e.g. a government)
  supplierName: string;
  customerName: string;
  /** Counterparty identity was withheld by the filer ("Customer A"). */
  counterpartyAnonymous: boolean; // resolved company name if the CIK resolved, else the raw disclosed string (e.g. "UnitedStatesGovernment") — always human-readable even when customerCik is null
  costBucket: CostBucket | null; // null until classified
  method: EdgeMethod;
  pctOfSupplierRevenue: number | null;
  pctOfCustomerBucket: number | null;
  absValueUsd: number | null;
  supplierFiscalPeriodEnd: string | null;
  customerFiscalPeriodEnd: string | null;
  periodMismatchDays: number | null;
  confidence: number;
  sourceAdsh: string;
}

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

/**
 * A "customer" disclosure means the filer is the supplier (they named a
 * customer). A "supplier" disclosure means the filer is the customer (they
 * named a vendor). Either way, the disclosing filer's own revenue anchors
 * the derivation — the counterparty's bucket total (fetched separately, once
 * it's resolved + cost-bucket classified) fills in the other side.
 */
export function edgeDirection(fact: RawConcentrationFact): { supplierCik: string | null; customerCik: string | null } {
  if (fact.type === "customer") return { supplierCik: fact.filerCik, customerCik: null };
  return { supplierCik: null, customerCik: fact.filerCik };
}

export async function deriveEdge(
  fact: RawConcentrationFact,
  filerName: string,
  counterparty: { cik: string; name: string } | null,
  counterpartyBucket: CostBucket | null,
): Promise<DerivedEdge> {
  // An anonymized member ("Customer A") is never resolved to a company — the
  // concentration is real but the counterparty identity isn't disclosed, so
  // it gets a neutral label and no CIK. Naming it would be a fabrication.
  const counterpartyCik = fact.counterpartyAnonymous ? null : (counterparty?.cik ?? null);
  const counterpartyName = fact.counterpartyAnonymous
    ? (fact.type === "customer" ? "Undisclosed customer" : "Undisclosed supplier")
    : (counterparty?.name ?? fact.counterpartyRaw ?? "Unknown");

  const { supplierCik, customerCik } = edgeDirection(fact);
  const resolvedSupplierCik = supplierCik ?? counterpartyCik;
  const resolvedCustomerCik = customerCik ?? counterpartyCik;

  const base: DerivedEdge = {
    supplierCik: resolvedSupplierCik ?? "",
    customerCik: resolvedCustomerCik,
    supplierName: fact.type === "customer" ? filerName : counterpartyName,
    customerName: fact.type === "customer" ? counterpartyName : filerName,
    counterpartyAnonymous: fact.counterpartyAnonymous,
    costBucket: counterpartyBucket,
    method: fact.type === "customer" ? "disclosed_supplier_side" : "disclosed_customer_side",
    // A "pct" fact gives the share directly; a "usd" fact gives the amount and
    // the share has to be derived against the filer's own revenue below.
    pctOfSupplierRevenue: fact.valueType === "pct" && fact.type === "customer" ? fact.value : null,
    pctOfCustomerBucket: fact.valueType === "pct" && fact.type === "supplier" ? fact.value : null,
    absValueUsd: fact.valueType === "usd" ? fact.value : null,
    supplierFiscalPeriodEnd: null,
    customerFiscalPeriodEnd: null,
    periodMismatchDays: null,
    // Anonymized rows are still a real disclosure, just an unattributable
    // one — scored below a named counterparty so the UI can rank accordingly.
    confidence: fact.counterpartyAnonymous ? 0.7 : 1.0,
    sourceAdsh: fact.adsh,
  };

  // A dollar amount can be turned into a share using only the filer's own
  // revenue — no counterparty needed. Do that first so anonymized and
  // unresolved rows still get a meaningful percentage.
  if (fact.valueType === "usd" && resolvedSupplierCik && fact.type === "customer") {
    const filerRevenue = await fetchDenominator(fact.filerCik, "REVENUE");
    if (filerRevenue && filerRevenue.value > 0) {
      const share = fact.value / filerRevenue.value;
      // Guard against a mis-scoped denominator (segment-level revenue, a
      // restated period) producing an impossible >100% share.
      if (share > 0 && share <= 1) {
        base.pctOfSupplierRevenue = share;
        base.supplierFiscalPeriodEnd = filerRevenue.periodEnd;
      }
    }
  }

  if (!resolvedSupplierCik || !counterpartyCik) return base; // can't derive further without both sides resolved

  const supplierRevenue = await fetchDenominator(resolvedSupplierCik, "REVENUE");
  if (!supplierRevenue) return base;

  base.supplierFiscalPeriodEnd = supplierRevenue.periodEnd;
  if (base.absValueUsd == null && base.pctOfSupplierRevenue != null && fact.type === "customer") {
    base.absValueUsd = base.pctOfSupplierRevenue * supplierRevenue.value;
  }

  if (fact.type === "customer" && counterpartyBucket && base.absValueUsd != null) {
    const customerBucketTotal = await fetchDenominator(counterpartyCik, counterpartyBucket);
    if (customerBucketTotal) {
      base.customerFiscalPeriodEnd = customerBucketTotal.periodEnd;
      base.pctOfCustomerBucket = base.absValueUsd! / customerBucketTotal.value;
      base.periodMismatchDays = daysBetween(supplierRevenue.periodEnd, customerBucketTotal.periodEnd);
      base.method = "derived";
      base.confidence = base.periodMismatchDays > 90 ? 0.45 : 0.6;
    }
  }

  return base;
}

export interface ConstraintViolation {
  entityCik: string;
  side: "supplier" | "customer";
  sum: number;
}

/** Σ pctOfSupplierRevenue per supplier and Σ pctOfCustomerBucket per customer should each stay ≤ ~1.0. */
export function checkConstraints(edges: DerivedEdge[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const TOLERANCE = 1.05; // allow small rounding slack before flagging

  const bySupplier = new Map<string, number>();
  const byCustomer = new Map<string, number>();
  for (const e of edges) {
    // Anonymous members are frequently *aggregates* — "TenLargestCustomers",
    // "CustomerAandB", "AllCustomers" — that deliberately overlap the named
    // rows beside them. Summing a superset with its own members guarantees a
    // false violation and would withhold the filer's real, named edges.
    // Measured: this plus the period fix accounts for most flagged groups.
    if (e.counterpartyAnonymous) continue;
    if (e.pctOfSupplierRevenue != null) {
      bySupplier.set(e.supplierCik, (bySupplier.get(e.supplierCik) ?? 0) + e.pctOfSupplierRevenue);
    }
    if (e.customerCik && e.pctOfCustomerBucket != null) {
      byCustomer.set(e.customerCik, (byCustomer.get(e.customerCik) ?? 0) + e.pctOfCustomerBucket);
    }
  }

  for (const [cik, sum] of bySupplier) if (sum > TOLERANCE) violations.push({ entityCik: cik, side: "supplier", sum });
  for (const [cik, sum] of byCustomer) if (sum > TOLERANCE) violations.push({ entityCik: cik, side: "customer", sum });

  return violations;
}
