import type { Express, Response } from "express";
// Reuse the portable data-source-kit adapters (keyless hazards/maritime/aviation
// sources). Ships in prod via Dockerfile `COPY . .`, run through `tsx`.
import { runAdapter } from "../../data-source-kit/core/adapter.js";
import { usgsQuakesAdapter } from "../../data-source-kit/adapters/hazards/usgs-quakes.js";
import { polymarketAdapter } from "../../data-source-kit/adapters/hazards/polymarket.js";
import { ngaMsiAdapter } from "../../data-source-kit/adapters/maritime/nga-msi.js";
import { faaNasAdapter } from "../../data-source-kit/adapters/aviation/faa-nas.js";
import type { SourceAdapter } from "../../data-source-kit/core/adapter.js";

function setCacheHeaders(res: Response, ttlMs: number): void {
  const maxAge = Math.floor(ttlMs / 2000);
  const swr = Math.floor(ttlMs / 1000);
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}

/**
 * Register a GET endpoint backed by one keyless adapter, with a light response
 * cache. The adapter's runner already circuit-breaks + caches upstream; this adds
 * a stable `lastUpdated` + Cache-Control. Empty results are a valid state (e.g.
 * FAA "no active disruptions") — the client renders per-card empty copy; we never
 * fabricate data.
 */
function registerAdapterRoute(
  app: Express,
  path: string,
  adapter: SourceAdapter<Record<string, never>, unknown>,
  ttlMs: number,
): void {
  let cache: { data: unknown; ts: number } | null = null;
  app.get(path, async (_req, res) => {
    if (cache && Date.now() - cache.ts < ttlMs) {
      setCacheHeaders(res, ttlMs);
      return res.json(cache.data);
    }
    const items = await runAdapter(adapter, {});
    const data = { items, lastUpdated: new Date().toISOString() };
    cache = { data, ts: Date.now() };
    setCacheHeaders(res, ttlMs);
    res.json(data);
  });
}

export function registerIntelRoutes(app: Express): void {
  registerAdapterRoute(app, "/api/intel/quakes", usgsQuakesAdapter, 5 * 60 * 1000);
  registerAdapterRoute(app, "/api/intel/markets", polymarketAdapter, 10 * 60 * 1000);
  registerAdapterRoute(app, "/api/intel/maritime", ngaMsiAdapter, 30 * 60 * 1000);
  registerAdapterRoute(app, "/api/intel/airspace", faaNasAdapter, 3 * 60 * 1000);
}
