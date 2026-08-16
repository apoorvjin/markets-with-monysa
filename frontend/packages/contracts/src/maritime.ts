import { z } from "zod";

/**
 * Tankers pillar — live AIS vessel positions (all commercial vessels,
 * color-coded by ship type, tankers/gas-carriers highlighted) plus per-strait
 * transit counts for 13 strategic chokepoints.
 *
 * Data flows from a leader-gated persistent AIS stream on the server into an
 * in-memory map; these endpoints serve snapshots of it (the stream IS the
 * cache). `source: "cold"` means the feed isn't running or hasn't received data
 * yet — the client shows a "feed cold" state, same idea as Data Centers'
 * OSM-snapshot pill.
 */

// Mirrors server/data/ais-ship-types.ts (contracts is the wire-shape source of
// truth; the two lists must stay in lockstep). NOTE: 80–89 is all "Tanker" —
// AIS type can't separate LNG/LPG gas carriers, hence the separate `gas` flag.
export const VESSEL_CATEGORIES = [
  "tanker",
  "cargo",
  "passenger",
  "highspeed",
  "tug_special",
  "fishing",
  "pleasure",
  "other",
] as const;
export type VesselCategory = (typeof VESSEL_CATEGORIES)[number];

export const MaritimeVessel = z
  .object({
    mmsi: z.number(),
    name: z.string().nullable(),
    lat: z.number(),
    lon: z.number(),
    sog: z.number().nullable(), // speed over ground, knots
    cog: z.number().nullable(), // course over ground, degrees
    heading: z.number().nullable(), // true heading, degrees
    type: z.number().nullable(), // raw AIS ship-type code
    category: z.enum(VESSEL_CATEGORIES),
    gas: z.boolean(), // soft LNG/LPG name heuristic (tankers only)
    dest: z.string().nullable(),
    draught: z.number().nullable(),
    ts: z.number(),
  })
  .passthrough();
export type MaritimeVessel = z.infer<typeof MaritimeVessel>;

export const MaritimeVesselsResponse = z.object({
  vessels: z.array(MaritimeVessel),
  total: z.number(), // mappable vessels tracked before the client cap
  source: z.enum(["live", "cold"]),
  lastUpdated: z.string().nullable(),
});
export type MaritimeVesselsResponse = z.infer<typeof MaritimeVesselsResponse>;

export const Chokepoint = z
  .object({
    id: z.string(),
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
    total: z.number(),
    byCategory: z.record(z.string(), z.number()),
    tankers: z.number(),
    gasCarriers: z.number(),
  })
  .passthrough();
export type Chokepoint = z.infer<typeof Chokepoint>;

export const MaritimeChokepointsResponse = z.object({
  chokepoints: z.array(Chokepoint),
  source: z.enum(["live", "cold"]),
  lastUpdated: z.string().nullable(),
});
export type MaritimeChokepointsResponse = z.infer<typeof MaritimeChokepointsResponse>;
