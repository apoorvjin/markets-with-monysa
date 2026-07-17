/**
 * Live tariff refresh pipeline — overlays recent US tariff actions on top of the
 * static `server/data/tariffs.json` baseline.
 *
 * Trigger model (deliberately minimal):
 *   • Automatic: the first `/api/tariffs` request that finds the overlay cache
 *     older than 7 days kicks off ONE background refresh. Coalesced + leader-
 *     gated + Redis-locked → at most one run per 7 days across all machines.
 *   • Manual: `POST /api/tariffs/refresh` (admin) flushes the cache and forces
 *     an immediate refresh regardless of the 7-day window.
 *   • Nothing else — no cron, no interval timer, no boot pre-warm.
 *
 * Cost control: every step upstream of the LLM is free (Federal Register API +
 * string filtering). Only Federal Register documents we have never parsed before
 * (deduped by document number) are sent to Haiku, so a quiet week costs $0. The
 * whole thing is country-agnostic — it extracts whatever countries a proclamation
 * names, not a hardcoded list.
 *
 * Graceful degradation: if ANTHROPIC_API_KEY is absent, or the poll/extraction
 * fails, the overlay stays empty and `/api/tariffs` serves the static baseline
 * exactly as before — the existing implementation is the fallback.
 */

import { Redis } from "@upstash/redis";
import Anthropic from "@anthropic-ai/sdk";
import { isLeader } from "../lib/leader";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverlayCountry {
  countryCode: string;   // ISO alpha-2, uppercase — join key against the baseline
  countryName: string;
  tariffRate: number;    // headline ad valorem rate, %
  sectors?: Array<{ sectorName: string; tariffRate: number; sourceURL?: string }>;
  effectiveDate: string; // ISO YYYY-MM-DD
  sourceURL: string;             // Federal Register html_url — for audit / spot-check
  sourceDocumentNumber: string;  // Federal Register document number
}

export interface TariffOverlay {
  countries: Record<string, OverlayCountry>; // keyed by uppercase countryCode
  processedDocs: string[];                    // FR document numbers already extracted
  lastPolledAt: string;                       // ISO — when the poll last ran
  latestEffectiveDate: string | null;         // newest effectiveDate seen → drives dataAsOf
}

// ── Cache (two-layer: Redis + in-memory, 7-day TTL — mirrors routes/oge.ts) ─────

const CACHE_TTL_S = 7 * 24 * 60 * 60;
const CACHE_TTL_MS = CACHE_TTL_S * 1000;
const REDIS_KEY = "tariffs:overlay";
const LOCK_KEY = "tariffs:refresh-lock";
const LOCK_TTL_S = 5 * 60; // 5 min — Federal Register poll + a few Haiku calls

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

let memCache: { data: TariffOverlay; ts: number } | null = null;

function getMemCached(): TariffOverlay | null {
  if (!memCache || Date.now() - memCache.ts > CACHE_TTL_MS) return null;
  return memCache.data;
}

/**
 * Current overlay for merging — reads the in-memory layer, falling back to Redis.
 * Ignores the 7-day TTL so a slightly-stale overlay is still served (the refresh
 * runs in the background); returns null only when nothing has ever been computed.
 */
export async function getTariffOverlay(): Promise<TariffOverlay | null> {
  if (memCache) return memCache.data;
  if (redis) {
    try {
      const raw = await redis.get<TariffOverlay>(REDIS_KEY);
      if (raw) {
        memCache = { data: raw, ts: Date.now() };
        return raw;
      }
    } catch (e) {
      console.warn("[tariffs] redis get failed:", (e as Error).message);
    }
  }
  return null;
}

async function setOverlay(data: TariffOverlay) {
  memCache = { data, ts: Date.now() };
  if (redis) {
    try {
      await redis.set(REDIS_KEY, data, { ex: CACHE_TTL_S });
    } catch (e) {
      console.warn("[tariffs] redis set failed:", (e as Error).message);
    }
  }
}

export async function bustTariffOverlay() {
  memCache = null;
  _fetching = false;
  if (redis) {
    try {
      await redis.del(REDIS_KEY, LOCK_KEY);
    } catch (e) {
      console.warn("[tariffs] redis del failed:", (e as Error).message);
    }
  }
}

async function acquireLock(): Promise<boolean> {
  if (!redis) return true; // single-machine dev — always proceed
  try {
    return (await redis.set(LOCK_KEY, "1", { nx: true, ex: LOCK_TTL_S })) === "OK";
  } catch {
    return true; // Redis unavailable — let this machine proceed
  }
}
async function releaseLock() {
  if (!redis) return;
  try {
    await redis.del(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

// ── Federal Register poll ──────────────────────────────────────────────────────

// Query the baseline snapshot date onward and rely on document-number dedup, so a
// mid-run failure never permanently skips a document. Presidential proclamations
// only; the term filter is just a coarse prefilter — the title gate below is what
// actually decides.
const FR_BASELINE_DATE = "2025-04-09";
const FR_MAX_PAGES = 4; // newest-first; a page is 20 docs — plenty of headroom

interface FrDoc {
  document_number: string;
  title: string;
  publication_date: string;
  html_url: string;
  raw_text_url: string;
}

// The `term=tariff` query already guarantees every result mentions tariffs in its
// body, so we do NOT require a tariff keyword in the title — country-specific
// tariff orders are often titled obliquely (e.g. the Brazil 50% action was
// "Addressing Threats to the United States by the Government of Brazil", with no
// tariff word). We only drop obvious commemorative/ceremonial proclamations here;
// Haiku is the precision layer and returns [] for anything that isn't a real
// country-rate action (each such miss costs one cheap call, once, then is deduped).
const TITLE_DENY = /honor|celebration|memorial|in memory|day of|national .* (day|week|month)|anniversary|awareness|appreciation|remembrance|founding|birthday/i;

async function fetchFederalRegisterDocs(): Promise<FrDoc[]> {
  const docs: FrDoc[] = [];
  for (let page = 1; page <= FR_MAX_PAGES; page++) {
    const url =
      "https://www.federalregister.gov/api/v1/documents.json" +
      "?conditions%5Bterm%5D=tariff" +
      "&conditions%5Btype%5D%5B%5D=PRESDOCU" +
      `&conditions%5Bpublication_date%5D%5Bgte%5D=${FR_BASELINE_DATE}` +
      "&order=newest&per_page=20" +
      `&page=${page}` +
      "&fields%5B%5D=document_number&fields%5B%5D=title" +
      "&fields%5B%5D=publication_date&fields%5B%5D=html_url&fields%5B%5D=raw_text_url";

    const resp = await fetch(url, {
      headers: { "User-Agent": "finbrio-app/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) throw new Error(`Federal Register ${resp.status}`);
    const json = (await resp.json()) as { results?: FrDoc[]; total_pages?: number };
    const results = Array.isArray(json.results) ? json.results : [];
    docs.push(...results);
    if (page >= (json.total_pages ?? 1)) break;
  }
  return docs;
}

function isTariffAction(doc: FrDoc): boolean {
  return !TITLE_DENY.test(doc.title);
}

// ── Haiku extraction ───────────────────────────────────────────────────────────

const _anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MAX_DOC_CHARS = 120_000; // ~30K tokens — bounds cost on huge multi-country annexes

interface RawLLMCountry {
  countryName: string;
  countryCode: string;
  tariffRate: number;
  effectiveDate: string;
  sectors?: Array<{ sectorName: string; tariffRate: number }>;
}

async function extractCountriesFromDoc(doc: FrDoc): Promise<OverlayCountry[]> {
  if (!_anthropic) return [];

  let text: string;
  try {
    const resp = await fetch(doc.raw_text_url, {
      headers: { "User-Agent": "finbrio-app/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      console.warn(`[tariffs] raw text ${resp.status} for ${doc.document_number}`);
      return [];
    }
    text = (await resp.text()).slice(0, MAX_DOC_CHARS);
  } catch (e) {
    console.warn(`[tariffs] raw text fetch failed for ${doc.document_number}:`, (e as Error).message);
    return [];
  }

  let raw: RawLLMCountry[];
  try {
    const stream = _anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      system:
        "You read US presidential proclamations and executive orders about import tariffs and extract the per-country ad valorem tariff rates they set. Only report a country when the document sets or changes a specific country's headline tariff rate. Ignore procedural, commemorative, or non-tariff documents (return an empty array). Never guess a rate that is not stated in the text.",
      messages: [
        {
          role: "user",
          content: `Extract every country whose US import tariff rate is set or changed by this document. For each, return the country name, its ISO 3166-1 alpha-2 code (uppercase), the headline ad valorem rate as a number (percent, e.g. 50 for 50%), the effective date (ISO YYYY-MM-DD; use the document's stated effective date), and any explicitly named sectors with their own rates. If the document does not set any country-specific tariff rate, return an empty array.\n\nDocument title: ${doc.title}\n\nText:\n${text}`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              countries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    countryName: { type: "string" },
                    countryCode: { type: "string", description: "ISO 3166-1 alpha-2, uppercase" },
                    tariffRate: { type: "number" },
                    effectiveDate: { type: "string", description: "ISO 8601 date YYYY-MM-DD" },
                    sectors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          sectorName: { type: "string" },
                          tariffRate: { type: "number" },
                        },
                        required: ["sectorName", "tariffRate"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["countryName", "countryCode", "tariffRate", "effectiveDate"],
                  additionalProperties: false,
                },
              },
            },
            required: ["countries"],
            additionalProperties: false,
          },
        },
      },
    });

    const msg = await stream.finalMessage();
    const block = msg.content[0];
    if (!block || block.type !== "text") return [];
    raw = (JSON.parse(block.text) as { countries: RawLLMCountry[] }).countries;
  } catch (e) {
    console.error(`[tariffs] LLM extraction failed for ${doc.document_number}:`, (e as Error).message);
    return [];
  }

  const out: OverlayCountry[] = [];
  for (const c of raw) {
    const code = (c.countryCode ?? "").trim().toUpperCase();
    if (code.length !== 2 || typeof c.tariffRate !== "number" || !Number.isFinite(c.tariffRate)) continue;
    if (code === "US") continue; // the US doesn't tariff itself — drop self-references
    if (c.tariffRate < 0 || c.tariffRate > 1000) continue; // guard against parse noise
    out.push({
      countryCode: code,
      countryName: c.countryName?.trim() || code,
      tariffRate: c.tariffRate,
      sectors: (c.sectors ?? []).map((s) => ({
        sectorName: s.sectorName,
        tariffRate: s.tariffRate,
        sourceURL: doc.html_url,
      })),
      effectiveDate: c.effectiveDate ?? "",
      sourceURL: doc.html_url,
      sourceDocumentNumber: doc.document_number,
    });
  }
  return out;
}

// ── Pipeline ────────────────────────────────────────────────────────────────────

async function runPipeline(): Promise<TariffOverlay> {
  const prev = (await getTariffOverlay()) ?? {
    countries: {},
    processedDocs: [],
    lastPolledAt: new Date(0).toISOString(),
    latestEffectiveDate: null,
  };

  const processed = new Set(prev.processedDocs);
  const countries: Record<string, OverlayCountry> = { ...prev.countries };
  let latest = prev.latestEffectiveDate;

  const allDocs = await fetchFederalRegisterDocs();
  // Free filtering: tariff-action titles we have never extracted before.
  const newDocs = allDocs.filter((d) => isTariffAction(d) && !processed.has(d.document_number));
  console.log(
    `[tariffs] Federal Register: ${allDocs.length} presidential docs, ${newDocs.length} new tariff actions to extract`,
  );

  // Oldest-first so that when two documents touch the same country the later
  // effective date wins the merge below.
  newDocs.sort((a, b) => a.publication_date.localeCompare(b.publication_date));

  for (const doc of newDocs) {
    const extracted = await extractCountriesFromDoc(doc);
    processed.add(doc.document_number); // mark processed even if it yielded nothing — never re-pay
    for (const c of extracted) {
      const existing = countries[c.countryCode];
      // Keep the entry with the later effective date (newest action wins).
      if (!existing || (c.effectiveDate || "") >= (existing.effectiveDate || "")) {
        countries[c.countryCode] = c;
      }
      if (!latest || (c.effectiveDate && c.effectiveDate > latest)) latest = c.effectiveDate;
    }
    if (extracted.length) {
      console.log(`[tariffs] ${doc.document_number}: ${extracted.map((c) => `${c.countryCode}=${c.tariffRate}%`).join(", ")}`);
    }
  }

  return {
    countries,
    processedDocs: [...processed],
    lastPolledAt: new Date().toISOString(),
    latestEffectiveDate: latest,
  };
}

// ── Trigger orchestration ────────────────────────────────────────────────────────

let _fetching = false;

function startRefresh() {
  if (_fetching) return;
  _fetching = true;
  void (async () => {
    const acquired = await acquireLock();
    if (!acquired) {
      console.log("[tariffs] another machine holds the refresh lock — skipping");
      _fetching = false;
      return;
    }
    console.log("[tariffs] refresh started");
    try {
      const overlay = await runPipeline();
      await setOverlay(overlay);
      const n = Object.keys(overlay.countries).length;
      console.log(`[tariffs] refresh complete — ${n} countries in overlay (asOf ${overlay.latestEffectiveDate ?? "n/a"})`);
    } catch (e) {
      console.error("[tariffs] refresh failed:", (e as Error).message);
    } finally {
      await releaseLock();
      _fetching = false;
    }
  })();
}

/**
 * Fire-and-forget staleness check called from the `/api/tariffs` handler. Kicks
 * off at most one background refresh per 7 days (leader-gated). Never blocks the
 * response. No-op without an Anthropic key — the baseline is the fallback.
 */
export function maybeRefreshTariffs(overlay: TariffOverlay | null): void {
  if (!_anthropic || !isLeader() || _fetching) return;
  const stale = !overlay || Date.now() - Date.parse(overlay.lastPolledAt) > CACHE_TTL_MS;
  if (stale) startRefresh();
}

/** Manual trigger (admin refresh endpoint) — flush the cache, then re-run. */
export async function forceRefreshTariffs(): Promise<void> {
  await bustTariffOverlay();
  startRefresh();
}
