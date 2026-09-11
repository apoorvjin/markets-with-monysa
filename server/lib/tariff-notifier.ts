/**
 * server/lib/tariff-notifier.ts
 * Trade-policy broadcast trigger: a new US tariff proclamation landing in the
 * Federal Register overlay (routes/tariff-refresh.ts), which already polls FR
 * and Haiku-extracts per-country rates, sectors and effective dates.
 *
 * This trigger adds no fetching of its own — it reads the overlay the pipeline
 * already maintains (`getTariffOverlay()`, Redis + in-memory) and notices when
 * `processedDocs` grows.
 *
 * TIMELINESS CAVEAT: that pipeline refreshes at most once per 7 days, and only
 * lazily when `/api/tariffs` is hit while the overlay is stale. So a push can
 * arrive days after the proclamation itself. Tightening the poll is cheap
 * (docs are deduped by number, so only unparsed ones cost a Haiku call) but is
 * a spend decision on an existing pipeline, deliberately not made here.
 */

import { registerBroadcastTrigger } from "./broadcast-notifier";
import { getTariffOverlay, type OverlayCountry } from "../routes/tariff-refresh";

/** State encodes how many docs have been parsed plus the newest one. Pure. */
export function encodeTariffState(processedDocs: string[]): string {
  const sorted = [...processedDocs].sort();
  return `${sorted.length}:${sorted[sorted.length - 1] ?? "none"}`;
}

/**
 * The country to headline. The overlay is keyed by country, not by document,
 * so "which country did this new proclamation affect" is inferred as the one
 * with the newest effective date — correct in the common case of one action at
 * a time, and a reasonable lead when several land together. Pure.
 */
export function newestCountry(countries: Record<string, OverlayCountry>): OverlayCountry | null {
  const rows = Object.values(countries);
  if (rows.length === 0) return null;
  return rows.reduce((newest, row) =>
    Date.parse(row.effectiveDate || "") > Date.parse(newest.effectiveDate || "") ? row : newest,
  );
}

/** Regional-indicator flag from an ISO alpha-2 code. Pure. */
export function flagOf(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return "🌐";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function registerTariffActionTrigger(): void {
  registerBroadcastTrigger({
    id: "tariff-action",
    intervalMs: 6 * 60 * 60_000, // 6h — reads a cache the pipeline refreshes at most weekly
    check: async () => {
      const overlay = await getTariffOverlay();
      if (!overlay || overlay.processedDocs.length === 0) return null;

      const lead = newestCountry(overlay.countries);
      if (!lead) return null;

      const sectorText = lead.sectors?.length
        ? ` Sectors named: ${lead.sectors.slice(0, 3).map((s) => s.sectorName.toLowerCase()).join(", ")}.`
        : "";
      const effective = lead.effectiveDate
        ? new Date(lead.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "an unspecified date";

      return {
        state: encodeTariffState(overlay.processedDocs),
        title: `${flagOf(lead.countryCode)} New US tariff action — ${lead.countryName}`,
        body: `Headline rate set to ${lead.tariffRate}%, effective ${effective}.${sectorText}`,
        data: {
          countryCode: lead.countryCode,
          tariffRate: String(lead.tariffRate),
          effectiveDate: lead.effectiveDate,
          sourceURL: lead.sourceURL,
          documentNumber: lead.sourceDocumentNumber,
        },
      };
    },
    // Only a growing document set is news. A re-parse that reshuffles the
    // newest-country pick without adding a document is not.
    shouldNotify: (from, to) => {
      const prevCount = parseInt(from.split(":")[0] ?? "", 10);
      const nextCount = parseInt(to.split(":")[0] ?? "", 10);
      return Number.isFinite(prevCount) && Number.isFinite(nextCount) && nextCount > prevCount;
    },
  });
}
