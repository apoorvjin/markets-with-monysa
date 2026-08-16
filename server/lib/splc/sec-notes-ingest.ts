// Disclosed supply-chain edges from SEC's Financial Statement **and Notes**
// Data Sets (https://www.sec.gov/files/dera/data/financial-statement-notes-data-sets/).
//
// Source choice matters here and is easy to get wrong: the *plain* Financial
// Statement Data Sets only carry primary-statement facts (post-Dec-2024
// reprocessing), so a whole quarter contains ~10 filers with customer
// concentration. The **Notes** sets carry notes-level facts with dimensional
// metadata — ~270 filings/month. Verified empirically against both.
//
// Publishing cadence changed: quarterly (`2025q2_notes.zip`) through 2025q2,
// monthly (`2026_07_notes.zip`) after. Both live under the same directory.
//
// Layout differs from the plain sets: `.tsv` not `.txt`, and dimensions are
// normalized into their own file rather than inlined —
//   num.tsv : adsh, tag, ddate, qtrs, dimh, value, ...
//   dim.tsv : dimhash, segments   ("Axis=Member;Axis=Member;")
//   sub.tsv : adsh, cik, name, form, ...
// So a fact's counterparty requires joining num.dimh -> dim.dimhash.
//
// Each monthly zip is 70-290MB. We download once to a temp file and then
// random-access the three entries locally (unzipper.Open.file) — streaming
// the URL three times would re-download the whole archive per pass.

import unzipper from "unzipper";
import { createInterface } from "node:readline";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secFetch } from "./sec-fetch";

const BASE_URL = "https://www.sec.gov/files/dera/data/financial-statement-notes-data-sets";

// Only periodic reports. Registration statements (S-1/S-4/F-1/POS AM) are
// dominated by SPACs and shells whose "customers" are pre-revenue artifacts —
// they were ~40% of raw rows and almost entirely noise.
const PERIODIC_FORMS = new Set([
  "10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A",
]);

// ── Benchmark gating ──────────────────────────────────────────────────────
// ConcentrationRiskPercentage1 is reported against wildly different
// denominators. Only revenue-share (customer side) and purchase/COGS-share
// (supplier side) describe supply-chain *flow*. AccountsReceivable /
// AccountsPayable / Inventories are credit and working-capital exposure —
// real disclosures, but "40% of receivables" is not "40% of revenue", and
// rendering one as the other would put a wrong number in front of the user.
// They were also ~a third of raw rows and the main source of Σ>1.0
// constraint violations (benchmarks were being summed together).
const REVENUE_BENCHMARKS = new Set([
  "SalesRevenueNet", "SalesNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet",
  "RevenueFromContractWithCustomer", "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax", "Revenues", "RevenueNet",
]);
const PURCHASE_BENCHMARKS = new Set([
  "CostOfGoodsTotal", "CostOfGoodsAndServicesSold", "CostOfRevenue",
  "Purchase", "Purchases", "TotalPurchase", "TotalPurchases",
]);

/** Segment- and product-line-scoped benchmarks are shares of a *slice* of the
 * business, not of the whole — not comparable to a total-revenue share and
 * they legitimately sum past 1.0 across slices. Out of scope for v1. */
function isScopedBenchmark(b: string): boolean {
  return /segment|productline/i.test(b);
}

export type ConcentrationType = "customer" | "supplier";

export interface RawConcentrationFact {
  adsh: string;
  filerCik: string;
  filerName: string;
  form: string;
  benchmark: string;
  type: ConcentrationType;
  counterpartyRaw: string;
  /** True when the filer wrote "Customer A" rather than naming the company.
   *  Kept (not dropped) so the concentration itself is still visible — the
   *  UI shows these as an undisclosed counterparty and never links them. */
  counterpartyAnonymous: boolean;
  periodEndDate: string; // ddate, YYYYMMDD
  qtrs: number;
  /** "pct" -> `value` is a 0-1 share. "usd" -> `value` is an absolute amount. */
  valueType: "pct" | "usd";
  value: number;
}

// Filers disclose the same relationship either as a share ("Walmart = 22% of
// revenue", uom=pure) or as an amount ("Walmart = $412M", uom=USD). Reading
// only the percentage form threw away ~3,700 rows/month — measured against a
// real dataset, ~54% more facts than the percentage tags alone carry.
// Dollars are the richer form: the absolute value needs no second lookup, and
// the percentage can be recovered once the filer's revenue is known.
const REVENUE_AMOUNT_TAGS = new Set([
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "RevenueNet",
  "SalesRevenueNet",
]);
const PURCHASE_AMOUNT_TAGS = new Set(["CostOfRevenue", "CostOfGoodsAndServicesSold"]);
const PCT_TAG = "ConcentrationRiskPercentage1";

// ── Anonymized-counterparty filter ────────────────────────────────────────
// Reg S-K requires disclosing >10% customers but not naming them, so most
// members are placeholders ("CustomerA", "DistributorD") or reporting
// categories ("ManufacturingHeavy", "CustomerTypePrivate") rather than
// counterparties. Resolving those to real companies is the deferred Phase 3
// (LLM + review queue). v1 drops anything that isn't plausibly a company
// name — under-reporting beats publishing a category as if it were a firm.
const ENUMERATOR = String.raw`(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|[A-Z]|\d+)`;
const ANONYMIZED_PATTERNS: RegExp[] = [
  new RegExp(String.raw`^(customer|vendor|supplier|distributor|charterer|purchaser|client|licensee|lessee|tenant|partner|counterparty|buyer|reseller|payer|payor)s?${ENUMERATOR}?$`, "i"),
  /^(total|all|core|other|various|certain|remaining|aggregate|consolidated|corporate)/i,
  /(customers|vendors|suppliers|distributors|clients|partners|payers|payors)$/i,
  /^(one|two|three|four|five|six|seven|eight|nine|ten|single|multiple|several|major|largest|top|significant|unnamed|undisclosed|anonymous|individual|non)/i,
  /^(commercial|government|retail|wholesale|domestic|international|foreign|segment|group|region|geographic)$/i,
  /(nonsegment|segment|member|axis|concentrationrisk)$/i,
  // Reporting categories that look like names but describe a class of
  // business, not a counterparty.
  /^(customertype|manufacturing|property|servicer|variableinterestentity|commercialmortgage|residential|geographical)/i,
];

// Distinct from anonymized: these members aren't counterparties at all.
// Filers commonly reuse the MajorCustomers axis to disaggregate revenue by
// end-market ("IndustrialIndustry", "ConstructionIndustry"). An anonymized
// member is a real company whose name is withheld and is worth showing as
// "Undisclosed customer"; a category is a slice of the business and must be
// dropped outright, or the UI would list "IndustrialIndustry" as a supplier.
const CATEGORY_SUFFIXES =
  /(industry|industries|sector|sectors|market|markets|region|regions|channel|channels|segment|segments|division|business|businesses|products|services|geography|geographies|vertical|verticals|endmarket|endmarkets|category|categories|class|classes|type|types)$/i;

function isCategoryMember(member: string): boolean {
  return CATEGORY_SUFFIXES.test(member.trim());
}

function isAnonymizedMember(member: string): boolean {
  const cleaned = member.trim();
  if (cleaned.length < 3) return true;
  return ANONYMIZED_PATTERNS.some((p) => p.test(cleaned));
}

// ── Dataset discovery ─────────────────────────────────────────────────────

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function urlExists(url: string): Promise<boolean> {
  const res = await secFetch(url, { method: "HEAD" });
  return res.ok;
}

/**
 * Most recent `count` monthly datasets that actually exist, newest first.
 * Publication lags the calendar by a month or two, so this walks back from
 * today rather than assuming the current month is up.
 */
export async function recentMonthlyDatasets(count: number, maxLookback = 12): Promise<string[]> {
  const found: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < maxLookback && found.length < count; i++) {
    const key = monthKey(cursor);
    if (await urlExists(`${BASE_URL}/${key}_notes.zip`)) found.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return found;
}

// ── Zip access ────────────────────────────────────────────────────────────

async function downloadToTemp(url: string, dir: string): Promise<string> {
  const res = await secFetch(url);
  if (!res.ok || !res.body) throw new Error(`SEC dataset fetch failed: ${url} -> ${res.status}`);
  const path = join(dir, "notes.zip");
  await pipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), createWriteStream(path));
  return path;
}

async function readEntryLines(
  zipPath: string,
  entryName: string,
  onLine: (cols: string[], idx: Record<string, number>) => void,
): Promise<void> {
  const dir = await unzipper.Open.file(zipPath);
  const entry = dir.files.find((f) => f.path === entryName);
  if (!entry) throw new Error(`${entryName} not found in ${zipPath}`);

  const rl = createInterface({ input: entry.stream(), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  for await (const line of rl) {
    const cols = line.split("\t");
    if (!idx) {
      idx = Object.fromEntries(cols.map((h, i) => [h, i]));
      continue;
    }
    onLine(cols, idx);
  }
}

// ── Ingest ────────────────────────────────────────────────────────────────

async function ingestOneDataset(datasetKey: string): Promise<RawConcentrationFact[]> {
  const isMonthly = datasetKey.includes("_");
  const url = `${BASE_URL}/${datasetKey}_notes.zip`;
  void isMonthly; // naming differs (2025q2 vs 2026_07) but the URL shape is identical

  const dir = await mkdtemp(join(tmpdir(), "splc-notes-"));
  try {
    const zipPath = await downloadToTemp(url, dir);

    // Pass 1 — dimension hashes that describe customer/supplier concentration.
    const dims = new Map<string, string>();
    await readEntryLines(zipPath, "dim.tsv", (cols, idx) => {
      const segments = cols[idx.segments] ?? "";
      // Amount-denominated rows are dimensioned by MajorCustomers alone and
      // carry no ConcentrationRiskByType, so match that axis too.
      if (
        segments.includes("ConcentrationRiskByType=CustomerConcentrationRisk") ||
        segments.includes("ConcentrationRiskByType=SupplierConcentrationRisk") ||
        segments.includes("MajorCustomers=")
      ) {
        dims.set(cols[idx.dimhash], segments);
      }
    });

    // Pass 2 — periodic-report submissions only.
    const subs = new Map<string, { cik: string; name: string; form: string }>();
    await readEntryLines(zipPath, "sub.tsv", (cols, idx) => {
      const form = cols[idx.form];
      if (!PERIODIC_FORMS.has(form)) return;
      subs.set(cols[idx.adsh], {
        cik: (cols[idx.cik] ?? "").padStart(10, "0"),
        name: cols[idx.name] ?? "",
        form,
      });
    });

    // Pass 3 — the facts themselves (the large file; nothing buffered).
    const out: RawConcentrationFact[] = [];
    await readEntryLines(zipPath, "num.tsv", (cols, idx) => {
      const tag = cols[idx.tag];
      const unit = cols[idx.uom];
      const isPct = tag === PCT_TAG && unit === "pure";
      const isAmount =
        unit === "USD" && (REVENUE_AMOUNT_TAGS.has(tag) || PURCHASE_AMOUNT_TAGS.has(tag));
      if (!isPct && !isAmount) return;

      const segments = dims.get(cols[idx.dimh]);
      if (!segments) return;
      const sub = subs.get(cols[idx.adsh]);
      if (!sub) return;

      const parts: Record<string, string> = {};
      for (const pair of segments.split(";")) {
        const eq = pair.indexOf("=");
        if (eq > 0) parts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }

      const riskType = parts["ConcentrationRiskByType"];
      const benchmark = parts["ConcentrationRiskByBenchmark"] ?? "";

      let type: ConcentrationType;
      if (isPct) {
        // Percentage rows carry an explicit risk type and a benchmark that
        // decides whether the number means what the UI claims.
        if (riskType === "CustomerConcentrationRisk") type = "customer";
        else if (riskType === "SupplierConcentrationRisk") type = "supplier";
        else return;
        if (!benchmark || isScopedBenchmark(benchmark)) return;
        const allowed = type === "customer" ? REVENUE_BENCHMARKS : PURCHASE_BENCHMARKS;
        if (!allowed.has(benchmark)) return;
      } else {
        // Amount rows require an explicit ConcentrationRiskByType. Measured on
        // a real month: of 3,561 USD rows on the MajorCustomers axis, the 267
        // carrying a risk type are genuine counterparties (Amazon, WalMart),
        // while the 3,294 without it are revenue disaggregation by end-market
        // or product line ("IndustrialIndustry", "LiveAndHistoricalRacing").
        // Without this gate the columns fill with business segments posing as
        // companies.
        if (riskType === "CustomerConcentrationRisk") type = "customer";
        else if (riskType === "SupplierConcentrationRisk") type = "supplier";
        else return;
        if (isScopedBenchmark(benchmark)) return;
      }

      const cpKey = Object.keys(parts).find(
        (k) => k !== "ConcentrationRiskByType" && k !== "ConcentrationRiskByBenchmark",
      );
      const counterpartyRaw = cpKey ? parts[cpKey] : "";
      if (!counterpartyRaw || isCategoryMember(counterpartyRaw)) return;
      // An amount row dimensioned by something other than a customer axis is
      // ordinary revenue disaggregation (by geography, product, segment), not
      // a counterparty relationship.
      if (isAmount && !("MajorCustomers" in parts)) return;

      const value = Number(cols[idx.value]);
      if (!Number.isFinite(value) || value <= 0) return;
      if (isPct && value > 1) return;

      out.push({
        adsh: cols[idx.adsh],
        filerCik: sub.cik,
        filerName: sub.name,
        form: sub.form,
        benchmark: benchmark || tag,
        type,
        counterpartyRaw,
        counterpartyAnonymous: isAnonymizedMember(counterpartyRaw),
        periodEndDate: cols[idx.ddate],
        qtrs: Number(cols[idx.qtrs]),
        valueType: isPct ? "pct" : "usd",
        value,
      });
    });

    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A company discloses concentration in its 10-K (annual) and often its 10-Qs.
// Ingesting a full 12 months guarantees every filer is seen at least once,
// which is the difference between a sparse graph and a complete one.
//
// Cost note: this is bandwidth and CPU, not dollars. SEC charges nothing,
// inbound transfer to Fly is free, and each zip is streamed then deleted, so
// disk never accumulates. The only real budget is nightly runtime (~20s per
// month of data), which is why this runs once a day on the leader rather
// than per request.
// Capped at 6 months by product decision: concentration disclosures go stale
// fast (they restate annually), and a longer window buys diminishing coverage
// while surfacing older, less trustworthy relationships.
const DEFAULT_MONTHS = 6;
export const MAX_MONTHS = 6;

/**
 * Ingests the most recent `months` datasets. Concentration disclosures are
 * annual/quarterly, so a single month only sees whoever filed in that window
 * — several months are needed for meaningful coverage.
 */
export async function ingestDisclosedConcentrationFacts(
  opts: { months?: number; datasets?: string[] } = {},
): Promise<RawConcentrationFact[]> {
  const months = Math.min(opts.months ?? DEFAULT_MONTHS, MAX_MONTHS);
  const keys = opts.datasets ?? (await recentMonthlyDatasets(months));
  const all: RawConcentrationFact[] = [];
  for (const key of keys) {
    try {
      const facts = await ingestOneDataset(key);
      console.log(`[splc] ${key}: ${facts.length} named concentration facts`);
      all.push(...facts);
    } catch (e) {
      console.error(`[splc] ingest failed for ${key}:`, (e as Error).message);
    }
  }
  return all;
}
