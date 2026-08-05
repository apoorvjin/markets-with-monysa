import { z } from "zod";

/** Wire → Intelligence tab: keyless hazards / maritime / aviation signal sources. */

export const Quake = z
  .object({
    id: z.string(),
    mag: z.number().nullable(),
    place: z.string(),
    time: z.string(),
    lon: z.number().nullable(),
    lat: z.number().nullable(),
    depth: z.number().nullable(),
    url: z.string(),
    tsunami: z.boolean(),
    alert: z.string().nullable(),
    sig: z.number().nullable(),
    magType: z.string(),
  })
  .passthrough();
export type Quake = z.infer<typeof Quake>;

export const PredictionMarket = z
  .object({
    id: z.string(),
    question: z.string(),
    slug: z.string(),
    url: z.string(),
    yesPrice: z.number().nullable(),
    volume: z.number().nullable(),
    endDate: z.string().nullable(),
    icon: z.string().nullable(),
  })
  .passthrough();
export type PredictionMarket = z.infer<typeof PredictionMarket>;

export const MaritimeWarning = z
  .object({
    id: z.string(),
    navArea: z.string(),
    subregion: z.string(),
    issued: z.string(),
    summary: z.string(),
  })
  .passthrough();
export type MaritimeWarning = z.infer<typeof MaritimeWarning>;

export const WIRE_AIRSPACE_KINDS = ["ground-stop", "ground-delay", "closure", "delay"] as const;
export const AirspaceEvent = z
  .object({
    airport: z.string(),
    kind: z.string(),
    reason: z.string(),
    detail: z.string(),
  })
  .passthrough();
export type AirspaceEvent = z.infer<typeof AirspaceEvent>;

function itemsResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), lastUpdated: z.string().nullish() });
}

export const IntelQuakesResponse = itemsResponse(Quake);
export type IntelQuakesResponse = z.infer<typeof IntelQuakesResponse>;
export const IntelMarketsResponse = itemsResponse(PredictionMarket);
export type IntelMarketsResponse = z.infer<typeof IntelMarketsResponse>;
export const IntelMaritimeResponse = itemsResponse(MaritimeWarning);
export type IntelMaritimeResponse = z.infer<typeof IntelMaritimeResponse>;
export const IntelAirspaceResponse = itemsResponse(AirspaceEvent);
export type IntelAirspaceResponse = z.infer<typeof IntelAirspaceResponse>;
