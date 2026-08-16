import type { Express, Response } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Reuse the portable data-source-kit adapters — same pattern as wire.ts/intel.ts.
// Ships in prod via Dockerfile `COPY . .`, run through `tsx`.
import { runAdapter } from "../../data-source-kit/core/adapter.js";
import { osmOverpassAdapter, type DataCenterFacility } from "../../data-source-kit/adapters/datacenters/osm-overpass.js";
import {
  interconnectionFyiIndexAdapter,
  interconnectionFyiRegionAdapter,
  PIPELINE_STATUSES,
  type PipelineProject,
  type PipelineStatus,
} from "../../data-source-kit/adapters/datacenters/interconnection-fyi.js";
import { geocodeCounty, peekCounty } from "../../data-source-kit/adapters/datacenters/geocode-county.js";
import { REGION_NAMES } from "../../data-source-kit/adapters/datacenters/region-codes.js";
import { isDataCenterAnnouncement } from "../../data-source-kit/adapters/datacenters/dc-keyword.js";
import { COUNTY_CENTROIDS } from "../data/county_centroids.js";
import { aggregateDesk, type WireItem } from "./wire.js";
import { isLeader } from "../lib/leader.js";

const FACILITIES_TTL = 24 * 60 * 60 * 1000;
const PIPELINE_TTL = 24 * 60 * 60 * 1000;
const ANNOUNCEMENTS_TTL = 30 * 60 * 1000;
const REGION_BATCH_SIZE = 6; // bounded concurrency against interconnection.fyi

function setCacheHeaders(res: Response, ttlMs: number): void {
  res.set("Cache-Control", `public, max-age=${Math.floor(ttlMs / 2000)}, stale-while-revalidate=${Math.floor(ttlMs / 1000)}`);
}

/** Strip the generic suffix so "Loudoun County" and "Loudoun" key/geocode the same. */
function normalizeCounty(county: string): string {
  return county.replace(/\s+(County|Parish|Borough|Census Area)$/i, "").trim();
}

// ── Facilities (OSM) — small payload, fetched directly, no skeleton needed ────

interface FacilitiesData {
  items: DataCenterFacility[];
  lastUpdated: string | null;
  /** "live" = fetched from Overpass this cycle; "snapshot" = bundled fallback
   * (Overpass unreachable). Surfaced in the UI so it's obvious which is showing. */
  source: "live" | "snapshot";
}

// Bundled fallback so the map's primary layer NEVER blanks when Overpass fails
// (the public instance frequently 504s / rate-limits the heavy global query,
// from cloud AND residential IPs). Live Overpass overrides this whenever it's
// reachable; the snapshot is just the floor. Regenerate by saving a good
// GET /api/datacenters/facilities response's `items` array to this file.
const FACILITIES_SNAPSHOT: DataCenterFacility[] = (() => {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), "../data/facilities_snapshot.json");
    return JSON.parse(readFileSync(p, "utf8")) as DataCenterFacility[];
  } catch (e) {
    console.error("[Data Centers] failed to load facilities snapshot:", e);
    return [];
  }
})();
const FACILITIES_SNAPSHOT_DATE = "2026-08-14T00:00:00.000Z";

let facilitiesCache: { data: FacilitiesData; ts: number } | null = null;
let facilitiesInFlight: Promise<DataCenterFacility[]> | null = null;

/**
 * One Overpass fetch. The public Overpass instance rate-limits / 504s datacenter
 * IPs (Fly), returning empty — which we must NEVER cache, or one transient blip
 * blanks the map for 24h (same "don't cache empties" rule as the earnings
 * calendar). So this only replaces the cache on a NON-EMPTY result; on failure
 * the last good cache stays (served even when TTL-expired). Coalesced so
 * concurrent callers share one in-flight request.
 */
function fetchFacilitiesOnce(): Promise<DataCenterFacility[]> {
  if (facilitiesInFlight) return facilitiesInFlight;
  facilitiesInFlight = runAdapter(osmOverpassAdapter, {})
    .catch(() => [] as DataCenterFacility[])
    .then((items) => {
      if (items.length > 0) {
        facilitiesCache = {
          data: { items, lastUpdated: new Date().toISOString(), source: "live" },
          ts: Date.now(),
        };
        console.log(`[Data Centers] facilities live: ${items.length} from Overpass`);
      } else {
        console.warn("[Data Centers] Overpass returned no facilities — serving snapshot/last good cache");
      }
      return items;
    })
    .finally(() => {
      facilitiesInFlight = null;
    });
  return facilitiesInFlight;
}

/** Background refresh with retries — used by the boot pre-warm to ride out
 * Overpass's frequent "server too busy" blips without blocking any request. */
async function refreshFacilitiesWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const items = await fetchFacilitiesOnce();
    if (items.length > 0) return;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

function getFacilities(): FacilitiesData {
  const fresh = facilitiesCache && Date.now() - facilitiesCache.ts < FACILITIES_TTL;
  // Serve instantly, always. When the cache isn't fresh, kick off a live
  // Overpass refresh in the BACKGROUND (never block the request on it — Overpass
  // can take 30s+ or fail), and meanwhile return the best we have: the live
  // cache if present (fresh or stale-good), else the bundled snapshot. So the
  // map renders immediately and is never empty; live data lands on a later hit.
  if (!fresh) void fetchFacilitiesOnce();
  return (
    facilitiesCache?.data ?? {
      items: FACILITIES_SNAPSHOT,
      lastUpdated: FACILITIES_SNAPSHOT_DATE,
      source: "snapshot",
    }
  );
}

// ── Pipeline (interconnection.fyi) — a full run scrapes ~48 pages then ────────
// geocodes every distinct county at Nominatim's 1 req/sec limit, which can take
// minutes on a cold cache. Skeleton-first, same shape as best-setups-sector:
// cold requests get cacheWarm:false instantly while a coalesced background job
// fills the real cache. See CLAUDE.md "best-setups-sector skeleton-first pattern".

export interface CountyPipelinePoint {
  region: string;
  regionName: string;
  county: string;
  lat: number | null;
  lon: number | null;
  counts: Record<PipelineStatus, number>;
  total: number;
}

interface PipelineResponse {
  points: CountyPipelinePoint[];
  totalProjects: number;
  cacheWarm: boolean;
  lastUpdated: string | null;
}

let pipelineCache: { data: PipelineResponse; ts: number } | null = null;
let pipelineInFlight: Promise<void> | null = null;

function emptyCounts(): Record<PipelineStatus, number> {
  return Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<PipelineStatus, number>;
}

interface PipelineGroup {
  region: string;
  county: string;
  counts: Record<PipelineStatus, number>;
}

/** Instant coord lookup: bundled static centroid table, then this process's
 * in-memory geocode cache (populated by the background pass for any county the
 * static table misses). Never hits the network. */
function knownCentroid(region: string, county: string): { lat: number; lon: number } | null {
  const stat = COUNTY_CENTROIDS[`${region}|${county}`];
  if (stat) return { lat: stat[0], lon: stat[1] };
  const peeked = peekCounty(county, region);
  return peeked ? { lat: peeked.lat, lon: peeked.lon } : null;
}

/** Scrape the whole pipeline into county groups. Fast (network-bound scrape,
 * no geocoding) — this is what gates cacheWarm. */
async function scrapePipeline(): Promise<{ groups: PipelineGroup[]; totalProjects: number }> {
  const regions = await runAdapter(interconnectionFyiIndexAdapter, {});
  const projects: PipelineProject[] = [];
  for (let i = 0; i < regions.length; i += REGION_BATCH_SIZE) {
    const batch = regions.slice(i, i + REGION_BATCH_SIZE);
    const perRegion = await Promise.all(
      batch.map((region) => runAdapter(interconnectionFyiRegionAdapter, { region }).catch(() => [])),
    );
    projects.push(...perRegion.flat());
  }

  const byKey = new Map<string, PipelineGroup>();
  for (const p of projects) {
    if (!p.county) continue; // can't place it on the map without a county
    const county = normalizeCounty(p.county);
    const key = `${p.region}|${county}`;
    let g = byKey.get(key);
    if (!g) {
      g = { region: p.region, county, counts: emptyCounts() };
      byKey.set(key, g);
    }
    g.counts[p.status] += 1;
  }
  return { groups: [...byKey.values()], totalProjects: projects.length };
}

function buildPoint(g: PipelineGroup): CountyPipelinePoint {
  const geo = knownCentroid(g.region, g.county);
  return {
    region: g.region,
    regionName: REGION_NAMES[g.region] ?? g.region,
    county: g.county,
    lat: geo?.lat ?? null,
    lon: geo?.lon ?? null,
    counts: g.counts,
    total: Object.values(g.counts).reduce((a, b) => a + b, 0),
  };
}

/**
 * Geocode the handful of counties the static table doesn't cover, in the
 * background, one at a time (Nominatim allows ~1/sec). Mutates the cached
 * points in place so their bubbles appear on the client's next refetch. Never
 * blocks cacheWarm — a slow/blocked Nominatim only delays a few stragglers, it
 * doesn't hold up the whole pipeline (the original bug).
 */
async function geocodeMissesInBackground(groups: PipelineGroup[], points: CountyPipelinePoint[]): Promise<void> {
  const misses = groups.filter((g) => !knownCentroid(g.region, g.county));
  if (misses.length === 0) return;
  const byKey = new Map(points.map((p) => [`${p.region}|${p.county}`, p]));
  console.log(`[Data Centers] geocoding ${misses.length} counties missing from the static table…`);
  let resolved = 0;
  for (const g of misses) {
    const geo = await geocodeCounty(g.county, g.region);
    if (geo) {
      const point = byKey.get(`${g.region}|${g.county}`);
      if (point) {
        point.lat = geo.lat;
        point.lon = geo.lon;
        resolved++;
      }
    }
  }
  console.log(`[Data Centers] background geocode done: ${resolved}/${misses.length} resolved`);
}

/** Kick off (or join) the compute; concurrent callers share one job. Warms the
 * cache the instant the scrape finishes (list + static-table bubbles), then
 * fills any missing bubbles in the background. */
function ensurePipelineFresh(): Promise<void> {
  if (!pipelineInFlight) {
    pipelineInFlight = (async () => {
      const { groups, totalProjects } = await scrapePipeline();
      const points = groups.map(buildPoint).sort((a, b) => b.total - a.total);
      const withCoords = points.filter((p) => p.lat != null).length;
      console.log(
        `[Data Centers] pipeline warm: ${groups.length} counties, ${totalProjects} projects, ${withCoords}/${points.length} placed from static table`,
      );
      const data: PipelineResponse = {
        points,
        totalProjects,
        cacheWarm: true,
        lastUpdated: new Date().toISOString(),
      };
      pipelineCache = { data, ts: Date.now() };
      // Fill in any counties the static table missed, without blocking warm.
      void geocodeMissesInBackground(groups, points);
    })()
      .catch((err) => {
        console.error("[Data Centers] pipeline compute failed:", err);
      })
      .finally(() => {
        pipelineInFlight = null;
      });
  }
  return pipelineInFlight;
}

function warmingResponse(): PipelineResponse {
  return { points: [], totalProjects: 0, cacheWarm: false, lastUpdated: null };
}

// ── Announcements — filters the already-live Corporate Wire desk ─────────────

let announcementsCache: { data: unknown; ts: number } | null = null;

async function getAnnouncements(): Promise<{ items: WireItem[]; lastUpdated: string }> {
  if (announcementsCache && Date.now() - announcementsCache.ts < ANNOUNCEMENTS_TTL) {
    return announcementsCache.data as { items: WireItem[]; lastUpdated: string };
  }
  const corporate = await aggregateDesk("corporate");
  const items = corporate.filter((item) => isDataCenterAnnouncement(item));
  const data = { items, lastUpdated: new Date().toISOString() };
  announcementsCache = { data, ts: Date.now() };
  return data;
}

export function registerDatacentersRoutes(app: Express): void {
  app.get("/api/datacenters/facilities", (_req, res) => {
    const data = getFacilities();
    setCacheHeaders(res, FACILITIES_TTL);
    res.json(data);
  });

  app.get("/api/datacenters/pipeline", (_req, res) => {
    if (pipelineCache && Date.now() - pipelineCache.ts < PIPELINE_TTL) {
      setCacheHeaders(res, PIPELINE_TTL);
      return res.json(pipelineCache.data);
    }
    void ensurePipelineFresh();
    res.set("Cache-Control", "no-store");
    res.json(warmingResponse());
  });

  app.get("/api/datacenters/announcements", async (_req, res) => {
    const data = await getAnnouncements();
    setCacheHeaders(res, ANNOUNCEMENTS_TTL);
    res.json(data);
  });
}

// Pre-warm both caches on the leader shortly after boot, so the first real
// visitor doesn't hit a cold/empty response. Facilities goes early + with
// retries: it fills the cache before anyone loads the page, so a transient
// Overpass failure at request time can't blank the map. Offset from
// BacktestWarm (2m) / best-setups-sector (3m) so they don't all fire at once.
setTimeout(() => {
  if (!isLeader()) return;
  void refreshFacilitiesWithRetry();
}, 30_000);
setTimeout(() => {
  if (!isLeader()) return;
  void ensurePipelineFresh();
}, 4 * 60_000);
