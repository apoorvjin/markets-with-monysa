/**
 * geocode-county — resolve a (county, region) pair to a lat/lon centroid via
 * OSM Nominatim, so interconnection-fyi's county-level pipeline data (see
 * interconnection-fyi.ts — most projects have no street address, only
 * county/city) can be plotted. Not a SourceAdapter: Nominatim's usage policy
 * caps public requests at 1/sec and asks callers to cache aggressively, which
 * needs its own throttle + a much longer TTL than the kit's generic runner
 * gives an adapter — county centroids don't move, so 90 days is safe. Negative
 * results (county not found) are cached too, so an unresolvable name isn't
 * retried every run.
 */

import { fetchWithTimeout } from "../../core/fetch-timeout.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";
import { REGION_NAMES, countryForRegion } from "./region-codes.js";

allowHosts(["nominatim.openstreetmap.org"]);

const USER_AGENT = "FinBrioWire/1.0 (+https://finbrio.net)";
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

export interface GeocodedPoint {
  lat: number;
  lon: number;
}

const cache = new Map<string, { data: GeocodedPoint | null; ts: number }>();
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function cacheKey(county: string, region: string): string {
  return `${county.toLowerCase()}|${region.toUpperCase()}`;
}

/**
 * Synchronous cache read — no network, no throttle. Returns the cached centroid,
 * `null` if a previous lookup found nothing, or `undefined` if this county has
 * never been resolved. Lets callers build a response instantly from what's
 * already known and geocode the misses in the background.
 */
export function peekCounty(county: string, region: string): GeocodedPoint | null | undefined {
  const cached = cache.get(cacheKey(county, region));
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  return undefined;
}

/** Resolve one county's centroid. Sequential calls self-throttle to 1/sec. */
export async function geocodeCounty(county: string, region: string): Promise<GeocodedPoint | null> {
  const key = cacheKey(county, region);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  await throttle();
  const params = new URLSearchParams({
    county,
    state: REGION_NAMES[region] ?? region,
    country: countryForRegion(region) === "CA" ? "Canada" : "United States",
    format: "json",
    limit: "1",
  });

  let data: GeocodedPoint | null = null;
  try {
    const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: 10_000,
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (rows[0]) data = { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
    }
  } catch {
    data = null;
  }
  cache.set(key, { data, ts: Date.now() });
  return data;
}
