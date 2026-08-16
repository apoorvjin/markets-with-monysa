// Federal contract awards as supply-chain edges (USASpending.gov, free, no key).
//
// Unlike SEC concentration disclosures — where a company voluntarily names a
// counterparty above a 10% threshold — every federal award is published with
// both parties and a dollar value. The awarding agency is the customer and the
// recipient is the supplier. This is the densest zero-cost source of *named*
// relationships available, and it covers exactly the concentrated sectors SEC
// disclosure suits (defence, aerospace, health services).
//
// Deliberately NOT computing a percentage here: "Award Amount" is the total
// potential value over a contract's life (often multi-year), so dividing it by
// one year of revenue would routinely exceed 100% and misrepresent dependence.
// These edges carry an absolute dollar value only.

import { resolveEntityByName } from "./entity-resolution";

const API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const PAGE_LIMIT = 100;

export interface ContractEdge {
  supplierCik: string;
  supplierTicker: string;
  supplierName: string;
  customerName: string; // awarding agency — a government body, so never a CIK
  absValueUsd: number;
  awardId: string;
}

interface AwardRow {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Awarding Agency"?: string;
  "Award Amount"?: number;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function fetchAwardPage(page: number, lookbackDays: number): Promise<AwardRow[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters: {
        // A/B/C/D = definitive contracts, BPA calls, purchase orders, IDV orders.
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [{ start_date: isoDaysAgo(lookbackDays), end_date: isoDaysAgo(0) }],
      },
      fields: ["Award ID", "Recipient Name", "Awarding Agency", "Award Amount"],
      page,
      limit: PAGE_LIMIT,
      sort: "Award Amount",
      order: "desc",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USASpending ${res.status}`);
  const body = (await res.json()) as { results?: AwardRow[] };
  return body.results ?? [];
}

/**
 * Largest recent awards, collapsed to one edge per (recipient, agency) pair.
 * Only recipients that resolve to a listed company are kept — an unlisted
 * contractor has no page to attach the edge to.
 */
export async function fetchContractEdges(
  opts: { pages?: number; lookbackDays?: number } = {},
): Promise<ContractEdge[]> {
  const pages = opts.pages ?? 5;
  const lookbackDays = opts.lookbackDays ?? 365;

  const byPair = new Map<string, ContractEdge>();
  for (let page = 1; page <= pages; page++) {
    let rows: AwardRow[];
    try {
      rows = await fetchAwardPage(page, lookbackDays);
    } catch (e) {
      console.warn(`[splc] USASpending page ${page} failed:`, (e as Error).message);
      break;
    }
    if (rows.length === 0) break;

    for (const row of rows) {
      const recipient = row["Recipient Name"];
      const agency = row["Awarding Agency"];
      const amount = row["Award Amount"];
      if (!recipient || !agency || !Number.isFinite(amount) || (amount as number) <= 0) continue;

      const entity = await resolveEntityByName(recipient);
      if (!entity) continue; // unlisted contractor — nothing to link to

      const key = `${entity.cik}|${agency}`;
      const existing = byPair.get(key);
      // Keep the largest award per pair rather than summing: awards overlap
      // (an IDV and its orders both appear), so summing would double-count.
      if (existing && existing.absValueUsd >= (amount as number)) continue;
      byPair.set(key, {
        supplierCik: entity.cik,
        supplierTicker: entity.ticker,
        supplierName: entity.name,
        customerName: agency,
        absValueUsd: amount as number,
        awardId: row["Award ID"] ?? "",
      });
    }
  }

  return [...byPair.values()];
}
