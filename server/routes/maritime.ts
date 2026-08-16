import type { Express, Request, Response } from "express";
import { startAisFeed, getVesselSnapshot, getChokepointCounts } from "../lib/ais-feed.js";
import { VESSEL_CATEGORIES, type VesselCategory } from "../data/ais-ship-types.js";

// Snapshots come from an in-memory map fed by the AIS stream, so the effective
// freshness is the stream's, not a request-time fetch (same as /api/trading/
// quotes). Short edge cache to absorb concurrent viewers; the ETag round-trip
// handles the client. Not plan-gated — public content.
function setCacheHeaders(res: Response, maxAge: number, swr: number): void {
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}

/** Parse a "west,south,east,north" bbox query param, or undefined. */
function parseBbox(raw: unknown): [number, number, number, number] | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return [parts[0], parts[1], parts[2], parts[3]];
}

/** Parse a comma-separated list of vessel categories, filtered to valid ones. */
function parseCategories(raw: unknown): Set<VesselCategory> | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const valid = new Set<VesselCategory>(VESSEL_CATEGORIES);
  const wanted = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is VesselCategory => valid.has(s as VesselCategory));
  return wanted.length ? new Set(wanted) : undefined;
}

export function registerMaritimeRoutes(app: Express): void {
  app.get("/api/maritime/vessels", (req: Request, res: Response) => {
    const snap = getVesselSnapshot({
      bbox: parseBbox(req.query.bbox),
      categories: parseCategories(req.query.types),
      limit: 8000,
    });
    setCacheHeaders(res, 10, 30);
    res.json(snap);
  });

  app.get("/api/maritime/chokepoints", (_req: Request, res: Response) => {
    const data = getChokepointCounts();
    setCacheHeaders(res, 15, 60);
    res.json(data);
  });

  // Start the leader-gated AIS stream. Idempotent; no-ops on followers and when
  // the selected provider is unconfigured (no AISSTREAM_API_KEY) — so deploying
  // this without the secret changes nothing about the running server.
  startAisFeed();
}
