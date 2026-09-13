import type { Express } from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDevicePlan, isPro } from "../plan-enforcement";
import { fetchAllBisSeries, type BisRawData } from "../lib/bis/bis-fetch";
import { buildCountryHealth, buildBisCoverage, buildReerMetric, summarizeCountryHealthFlags } from "../lib/bis/bis-derive";
import { CURRENCY_AREAS } from "../data/currency_areas";

// BIS series update monthly/quarterly at the source — this TTL only bounds how
// often we re-check, not real freshness. All 6 dataflows come back in one
// bulk "all countries" request each, so a 24h cache is generous, not stingy.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cache: { data: BisRawData; ts: number } | null = null;
let inFlight: Promise<BisRawData> | null = null;

async function getBisData(): Promise<BisRawData> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight; // coalesce concurrent cold-cache requests into one BIS fetch
  inFlight = fetchAllBisSeries()
    .then((data) => {
      cache = { data, ts: Date.now() };
      inFlight = null;
      return data;
    })
    .catch((e) => {
      inFlight = null;
      throw e;
    });
  return inFlight;
}

// tariffs.json is the app's existing 113-country list. Reading it here (read-only,
// bundled static file) lets the coverage endpoint drop BIS area aggregates ("XM"
// euro area, "4T"/"5A" regional groups) without a new country-list source of
// truth — see Known Pitfalls: sibling functions instead of touching economy.ts's
// live /api/tariffs handler.
let knownCountries: Map<string, string> | null = null; // code -> name
function getKnownCountries(): Map<string, string> {
  if (knownCountries) return knownCountries;
  try {
    const raw = readFileSync(resolve("server/data/tariffs.json"), "utf-8");
    const list = JSON.parse(raw) as Array<{ countryCode: string; countryName: string }>;
    knownCountries = new Map(list.map((c) => [c.countryCode.toUpperCase(), c.countryName]));
    // tariffs.json is "countries the US applies tariffs to" — it deliberately
    // excludes the US itself, which would otherwise silently drop the single
    // most BIS-complete country from the coverage list. Add it back in.
    knownCountries.set("US", "United States");
  } catch (e) {
    console.error("[bis] failed to load tariffs.json for country-code filtering:", e);
    knownCountries = new Map([["US", "United States"]]);
  }
  return knownCountries;
}

export function registerBisRoutes(app: Express): void {
  // Free and unauthenticated — lets the Country Health picker show which
  // codes actually have BIS data before the (Pro-gated) panel is requested.
  app.get("/api/macro/country-health/coverage", async (_req, res) => {
    try {
      const raw = await getBisData();
      const known = getKnownCountries();
      const countries = buildBisCoverage(raw).filter((c) => known.has(c));
      res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
      res.json({ countries, lastUpdated: raw.fetchedAt });
    } catch (e) {
      console.error("[bis] coverage fetch failed:", e);
      res.status(502).json({ error: "BIS data temporarily unavailable" });
    }
  });

  // Pro-gated, same as the per-country panel — this is a derived view over
  // the exact same paid data (which countries are flagged), not a lesser
  // free teaser of it. A COUNT of stressed metrics (0-N), never a weighted
  // score — see summarizeCountryHealthFlags's own comment for why.
  app.get("/api/macro/country-health/ranking", async (req, res) => {
    if (!isPro(getDevicePlan(req))) {
      return res.status(403).json({ error: "Country Health requires Pro plan.", code: "PLAN_REQUIRED" });
    }
    try {
      const raw = await getBisData();
      const known = getKnownCountries();
      const covered = buildBisCoverage(raw).filter((c) => known.has(c));
      const rankings = covered
        .map((code) => ({ ...summarizeCountryHealthFlags(code, raw), countryName: known.get(code)! }))
        .filter((r) => r.availableCount > 0) // exclude countries BIS has literally nothing on
        .sort((a, b) => b.flaggedCount - a.flaggedCount || b.availableCount - a.availableCount);
      res.set("Cache-Control", "private, max-age=43200"); // 12h — Pro-gated, private (mirrors exposure.ts)
      res.json({ rankings, lastUpdated: raw.fetchedAt });
    } catch (e) {
      console.error("[bis] country-health ranking failed:", e);
      res.status(502).json({ error: "BIS data temporarily unavailable" });
    }
  });

  app.get("/api/macro/country-health/:code", async (req, res) => {
    if (!isPro(getDevicePlan(req))) {
      return res.status(403).json({ error: "Country Health requires Pro plan.", code: "PLAN_REQUIRED" });
    }
    const code = String(req.params.code || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      return res.status(400).json({ error: "code must be a 2-letter ISO country code" });
    }
    try {
      const raw = await getBisData();
      const metrics = buildCountryHealth(code, raw);
      res.set("Cache-Control", "private, max-age=43200"); // 12h — Pro-gated, private (mirrors exposure.ts)
      res.json({ countryCode: code, metrics, lastUpdated: raw.fetchedAt });
    } catch (e) {
      console.error(`[bis] country-health fetch failed for ${code}:`, e);
      res.status(502).json({ error: "BIS data temporarily unavailable" });
    }
  });

  // FIN-21 — Currency Valuation on Markets → Forex. Free, unauthenticated;
  // reuses buildReerMetric() (the same function Country Health uses for its
  // REER row) — REER is currency/area-only, nothing country-specific to
  // duplicate. Currency->BIS-area mapping is server/data/currency_areas.ts,
  // covering every currency in FOREX_PAIRS (server/routes/markets.ts).
  app.get("/api/macro/currency-valuation", async (_req, res) => {
    try {
      const raw = await getBisData();
      const currencies = CURRENCY_AREAS.map((c) => {
        const metric = buildReerMetric(raw.reer.get(c.areaCode));
        return {
          code: c.code,
          name: c.name,
          flagCountryCode: c.flagCountryCode,
          available: metric.available,
          value: metric.value,
          deviation10y: metric.deviation10y,
          tag: metric.tag,
          asOf: metric.asOf,
        };
      });
      res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
      res.json({ currencies, lastUpdated: raw.fetchedAt });
    } catch (e) {
      console.error("[bis] currency-valuation fetch failed:", e);
      res.status(502).json({ error: "BIS data temporarily unavailable" });
    }
  });
}
