// Nightly SPLC batch: ingest -> resolve -> classify cost buckets -> derive
// two-sided edges -> materialize one Firestore doc per ticker so the API
// route is a single read. Mirrors signal-ledger.ts's boot-setTimeout +
// isLeader()-gated nightly setInterval shape.
//
// The universe is **discovered, not curated**: whichever filers actually
// disclose a named customer/supplier concentration and map to a ticker are
// the universe. An earlier version curated DJI/NDX mega-caps up front and
// produced an empty feature — mega-caps essentially never disclose a >10%
// single customer, since the Reg S-K threshold only catches concentrated
// businesses. Let the data decide who belongs.

import { adminFirestore } from "../firebase-admin";
import { isLeader } from "../leader";
import { resolveEntityByCik, resolveEntityByName } from "./entity-resolution";
import { ingestDisclosedConcentrationFacts, type RawConcentrationFact } from "./sec-notes-ingest";
import { classifyCostBucket } from "./cost-buckets";
import { deriveEdge, checkConstraints, type DerivedEdge } from "./derivation";
import { fetchContractEdges } from "./usaspending";

interface SplcGraphDoc {
  ticker: string;
  cik: string;
  name: string;
  suppliers: DerivedEdge[];
  customers: DerivedEdge[];
  coverage: { disclosedCount: number; derivedCount: number };
  lastUpdated: string;
}

/** A 10-K/10-Q concentration note restates prior periods as separate rows
 * sharing one adsh — historical snapshots of the same relationship, not
 * concurrent exposure.
 *
 * Picking the latest period *per counterparty* independently is not enough:
 * different counterparties then land on different periods (and different
 * `qtrs` durations), and summing a 12-month share against a 9-month one is
 * meaningless. Measured on two months of real data, that mismatch — not
 * genuine over-disclosure — caused 33 of 51 flagged groups.
 *
 * So the cohort is chosen per (filer, side, valueType): take the most recent
 * period end, preferring the longest duration on ties, and keep only rows
 * reported on exactly that basis. */
function consistentPeriodOnly(facts: RawConcentrationFact[]): RawConcentrationFact[] {
  const groups = new Map<string, RawConcentrationFact[]>();
  for (const fact of facts) {
    const key = `${fact.filerCik}|${fact.type}|${fact.valueType}`;
    const list = groups.get(key);
    if (list) list.push(fact);
    else groups.set(key, [fact]);
  }

  const out: RawConcentrationFact[] = [];
  for (const rows of groups.values()) {
    let bestDate = "";
    let bestQtrs = -1;
    for (const r of rows) {
      if (r.periodEndDate > bestDate || (r.periodEndDate === bestDate && r.qtrs > bestQtrs)) {
        bestDate = r.periodEndDate;
        bestQtrs = r.qtrs;
      }
    }
    const cohort = rows.filter((r) => r.periodEndDate === bestDate && r.qtrs === bestQtrs);
    // One row per counterparty within the cohort (a filer can restate the
    // same counterparty twice in one filing).
    const seen = new Set<string>();
    for (const r of cohort) {
      if (seen.has(r.counterpartyRaw)) continue;
      seen.add(r.counterpartyRaw);
      out.push(r);
    }
  }
  return out;
}

export interface SplcUniverseEntry {
  ticker: string;
  name: string;
  supplierCount: number;
  customerCount: number;
}

export async function runSplcBatch(opts: { months?: number; datasets?: string[] } = {}): Promise<{
  tickersWithData: number;
  edgesWritten: number;
  universe: SplcUniverseEntry[];
}> {
  const rawFacts = await ingestDisclosedConcentrationFacts(opts);
  const facts = consistentPeriodOnly(rawFacts);
  console.log(`[splc] ${rawFacts.length} raw facts -> ${facts.length} after single-period cohort selection`);

  // Graph centres come from BOTH sides of every disclosure, not just filers.
  // When FICO names Experian as a customer, that same fact makes FICO a
  // *supplier* on Experian's page — so Experian earns a page even though it
  // disclosed nothing itself. This is the free density multiplier: one
  // one-sided legal disclosure yields two browsable companies.
  const cikToTicker = new Map<string, { ticker: string; name: string }>();
  for (const fact of facts) {
    if (cikToTicker.has(fact.filerCik)) continue;
    const entity = await resolveEntityByCik(fact.filerCik);
    if (entity) cikToTicker.set(fact.filerCik, { ticker: entity.ticker, name: entity.name });
  }

  const edges: DerivedEdge[] = [];
  for (const fact of facts) {
    if (!cikToTicker.has(fact.filerCik)) continue;
    // Anonymized rows ("Customer A") are kept as edges but resolve to nobody:
    // they can't become a graph centre and must not be Haiku-classified.
    const counterparty = fact.counterpartyAnonymous
      ? null
      : await resolveEntityByName(fact.counterpartyRaw);
    if (counterparty && !cikToTicker.has(counterparty.cik)) {
      cikToTicker.set(counterparty.cik, { ticker: counterparty.ticker, name: counterparty.name });
    }
    const classified = counterparty ? await classifyCostBucket(counterparty.cik, counterparty.name) : null;
    edges.push(await deriveEdge(fact, fact.filerName, counterparty, classified?.bucket ?? null));
  }

  // Federal awards: a second, independent source of *named* relationships.
  // Appended after the SEC edges so a failure here can never take the SEC
  // graph down with it.
  try {
    const contracts = await fetchContractEdges();
    for (const c of contracts) {
      if (!cikToTicker.has(c.supplierCik)) {
        cikToTicker.set(c.supplierCik, { ticker: c.supplierTicker, name: c.supplierName });
      }
      edges.push({
        supplierCik: c.supplierCik,
        customerCik: null, // a federal agency has no CIK
        supplierName: c.supplierName,
        customerName: c.customerName,
        counterpartyAnonymous: false,
        costBucket: null,
        method: "government_contract",
        // No percentage on purpose — award totals span multiple years and
        // would exceed 100% of one year's revenue. See usaspending.ts.
        pctOfSupplierRevenue: null,
        pctOfCustomerBucket: null,
        absValueUsd: c.absValueUsd,
        supplierFiscalPeriodEnd: null,
        customerFiscalPeriodEnd: null,
        periodMismatchDays: null,
        confidence: 1.0, // a published contract, not an inference
        sourceAdsh: c.awardId,
      });
    }
    console.log(`[splc] USASpending: ${contracts.length} contract edges`);
  } catch (e) {
    console.error("[splc] USASpending ingest failed (SEC edges unaffected):", (e as Error).message);
  }

  const violations = checkConstraints(edges);
  if (violations.length > 0) {
    console.warn(`[splc] ${violations.length} constraint violation(s) — those entities' edges withheld:`, violations.slice(0, 5));
  }
  const violatingCiks = new Set(violations.map((v) => v.entityCik));
  const clean = edges.filter(
    (e) => !violatingCiks.has(e.supplierCik) && !(e.customerCik && violatingCiks.has(e.customerCik)),
  );

  const graphs = new Map<string, SplcGraphDoc>();
  for (const [cik, { ticker, name }] of cikToTicker) {
    // Reader's perspective: "suppliers" = who supplies TO this ticker,
    // "customers" = who this ticker supplies TO.
    const suppliersOfThisTicker = clean.filter((e) => e.customerCik === cik);
    const customersOfThisTicker = clean.filter((e) => e.supplierCik === cik);
    if (suppliersOfThisTicker.length === 0 && customersOfThisTicker.length === 0) continue;

    const all = [...suppliersOfThisTicker, ...customersOfThisTicker];
    graphs.set(ticker, {
      ticker,
      cik,
      name,
      suppliers: suppliersOfThisTicker,
      customers: customersOfThisTicker,
      coverage: {
        disclosedCount: all.filter((e) => e.method !== "derived").length,
        derivedCount: all.filter((e) => e.method === "derived").length,
      },
      lastUpdated: new Date().toISOString(),
    });
  }

  // Carries names + counts so the SPLC page can search by company name (not
  // just symbol) and rank results without fetching every graph doc.
  const universe = [...graphs.values()]
    .map((g) => ({
      ticker: g.ticker,
      name: g.name,
      supplierCount: g.suppliers.length,
      customerCount: g.customers.length,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const db = adminFirestore();
  let edgesWritten = 0;

  if (db) {
    // Firestore caps a batch at 500 writes; chunk to stay under it.
    const entries = [...graphs.entries()];
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      for (const [ticker, doc] of entries.slice(i, i + 400)) {
        batch.set(db.collection("splcGraph").doc(ticker), doc, { merge: false });
        edgesWritten += doc.suppliers.length + doc.customers.length;
      }
      await batch.commit();
    }
    // Single doc the universe endpoint reads, so listing the universe never
    // requires scanning the whole collection. Firestore caps a document at
    // 1MB; at ~60 bytes per entry that holds ~15k companies, well beyond
    // what SEC concentration disclosures will ever produce.
    await db.collection("splcMeta").doc("universe").set({
      companies: universe,
      lastUpdated: new Date().toISOString(),
    });
  } else {
    console.warn("[splc] Firestore not configured — batch computed but not persisted");
  }

  console.log(`[splc] batch complete: ${graphs.size} tickers, ${edgesWritten} edges`);
  return { tickersWithData: graphs.size, edgesWritten, universe };
}

function scheduleAtUtc(hour: number, minute: number, fn: () => void): void {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(() => {
    fn();
    setInterval(fn, 24 * 60 * 60_000);
  }, next.getTime() - now.getTime());
}

/** Called once, explicitly, from index.ts — not fired as an import side
 * effect — so it's easy to find and disable. */
export function startSplcJobs(): void {
  setTimeout(() => {
    if (!isLeader()) { console.log("[splc] skipping startup batch — follower"); return; }
    runSplcBatch().catch((e) => console.error("[splc] startup batch failed:", e));
  }, 4 * 60_000); // after BacktestWarm (2m) / AdvCorrelationWarm (2.5m) / SignalLedger (3-3.5m)

  scheduleAtUtc(1, 0, () => {
    if (isLeader()) runSplcBatch().catch((e) => console.error("[splc] nightly batch failed:", e));
  });
}
