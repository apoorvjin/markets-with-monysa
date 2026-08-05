import { z } from "zod";

/** Wire = News/OSINT & gov-feed terminal. Each desk is a column. */
export const WIRE_DESKS = [
  "intel",
  "world",
  "middle-east",
  "europe",
  "africa",
  "latin-america",
  "asia-pacific",
  "united-states",
  "markets",
  "corporate",
] as const;
export type WireDesk = (typeof WIRE_DESKS)[number];

export const WIRE_DESK_LABELS: Record<WireDesk, string> = {
  intel: "Intel Feed",
  world: "World News",
  "middle-east": "Middle East",
  europe: "Europe",
  africa: "Africa",
  "latin-america": "Latin America",
  "asia-pacific": "Asia-Pacific",
  "united-states": "United States",
  markets: "Markets & Macro",
  corporate: "Corporate Wire",
};

export const WIRE_CATEGORIES = [
  "conflict",
  "disaster",
  "protest",
  "diplomatic",
  "economic",
  "general",
] as const;
export type WireCategory = (typeof WIRE_CATEGORIES)[number];

export const WIRE_SEVERITIES = ["breaking", "alert", "caution", "normal"] as const;
export type WireSeverity = (typeof WIRE_SEVERITIES)[number];

export const WireItem = z
  .object({
    title: z.string(),
    link: z.string(),
    /** ISO 8601 when parseable, else raw, else "". */
    pubDate: z.string(),
    summary: z.string(),
    source: z.string(),
    sourceId: z.string(),
    desk: z.enum(WIRE_DESKS),
    // Heuristic tags — kept as loose strings so a server-side taxonomy tweak
    // never fails the client parse.
    category: z.string(),
    severity: z.string(),
    // Exchange-tagged symbols named in the headline (Corporate Wire desk).
    // nullish so older cached payloads / other desks parse cleanly.
    tickers: z.array(z.string()).nullish(),
  })
  .passthrough();
export type WireItem = z.infer<typeof WireItem>;

export const WireItemsResponse = z.object({
  desk: z.enum(WIRE_DESKS),
  items: z.array(WireItem),
  lastUpdated: z.string().nullish(),
});
export type WireItemsResponse = z.infer<typeof WireItemsResponse>;

export const WireBreakingResponse = z.object({
  items: z.array(WireItem),
  lastUpdated: z.string().nullish(),
});
export type WireBreakingResponse = z.infer<typeof WireBreakingResponse>;

export const WireDesksResponse = z.object({
  desks: z.array(
    z.object({
      id: z.enum(WIRE_DESKS),
      label: z.string(),
      sources: z.array(z.string()),
    }),
  ),
  totalFeeds: z.number().nullish(),
  lastUpdated: z.string().nullish(),
});
export type WireDesksResponse = z.infer<typeof WireDesksResponse>;
