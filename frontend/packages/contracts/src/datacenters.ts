import { z } from "zod";

/**
 * Data Centers pillar — operating facilities (OSM, precise coordinates) fused
 * with the AI construction pipeline (interconnection.fyi, county-level —
 * most projects have no street address, only a county) and hyperscaler
 * announcements (filtered from the already-shipped Corporate Wire desk).
 */

export const DataCenterFacility = z
  .object({
    id: z.string(),
    name: z.string(),
    operator: z.string().nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    tier: z.string().nullable(),
    osmType: z.string(),
    osmId: z.number(),
  })
  .passthrough();
export type DataCenterFacility = z.infer<typeof DataCenterFacility>;

export const DataCenterFacilitiesResponse = z.object({
  items: z.array(DataCenterFacility),
  lastUpdated: z.string().nullish(),
  /** "live" = fetched from Overpass; "snapshot" = bundled fallback (Overpass down). */
  source: z.enum(["live", "snapshot"]).nullish(),
});
export type DataCenterFacilitiesResponse = z.infer<typeof DataCenterFacilitiesResponse>;

export const PIPELINE_STATUSES = ["Operational", "Construction", "Proposed", "Cancelled", "Unknown"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const CountyPipelinePoint = z
  .object({
    region: z.string(),
    regionName: z.string(),
    county: z.string(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    counts: z.record(z.string(), z.number()),
    total: z.number(),
  })
  .passthrough();
export type CountyPipelinePoint = z.infer<typeof CountyPipelinePoint>;

export const DataCenterPipelineResponse = z.object({
  points: z.array(CountyPipelinePoint),
  totalProjects: z.number(),
  /** false = background scrape/geocode still running; client should poll. */
  cacheWarm: z.boolean(),
  lastUpdated: z.string().nullable(),
});
export type DataCenterPipelineResponse = z.infer<typeof DataCenterPipelineResponse>;

// Reuses the existing WireItem shape (see wire.ts) — announcements are a
// filtered view of the Corporate Wire desk, not a new item shape.
export const DataCenterAnnouncement = z
  .object({
    title: z.string(),
    link: z.string(),
    pubDate: z.string(),
    summary: z.string(),
    source: z.string(),
    sourceId: z.string(),
    tickers: z.array(z.string()).nullish(),
  })
  .passthrough();
export type DataCenterAnnouncement = z.infer<typeof DataCenterAnnouncement>;

export const DataCenterAnnouncementsResponse = z.object({
  items: z.array(DataCenterAnnouncement),
  lastUpdated: z.string().nullish(),
});
export type DataCenterAnnouncementsResponse = z.infer<typeof DataCenterAnnouncementsResponse>;
