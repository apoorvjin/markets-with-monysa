/**
 * osm-overpass — OpenStreetMap facilities tagged `telecom=data_center`, via the
 * public Overpass API. auth: none. Global query returns ~4.5k elements (verified
 * live 2026-08-14) — well inside the public instance's ~10k req/day, <1GB/day fair
 * use budget for a 24h-cached fetch. Coverage is crowdsourced: real facilities that
 * haven't been mapped won't appear, and shell/subsidiary names in `operator` are
 * whatever the mapper entered — display as-is, don't try to resolve to a parent.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";

allowHosts(["overpass-api.de"]);

const OVERPASS_QUERY =
  '[out:json][timeout:55];(node["telecom"="data_center"];way["telecom"="data_center"];relation["telecom"="data_center"];);out center tags;';

export interface DataCenterFacility {
  id: string;
  name: string;
  operator: string | null;
  lat: number | null;
  lon: number | null;
  /** From the `data_center:tier` proposal tag, when a mapper set it. */
  tier: string | null;
  osmType: "node" | "way" | "relation";
  osmId: number;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const osmOverpassAdapter: SourceAdapter<Record<string, never>, DataCenterFacility> = {
  id: "osm-overpass-datacenters",
  auth: "none",
  cacheTtlMs: 24 * 60 * 60 * 1000,
  // Bounded so a request never hangs long on a busy Overpass. When Overpass is
  // healthy the global query returns in a few seconds; if it's not responding
  // in 35s it's overloaded and a background retry (see server route) is better
  // than blocking the caller.
  timeoutMs: 35_000,
  rateLimit: { note: "Public instance: ~10k req/day, <1GB/day. One global query per 24h is trivial." },

  endpoint() {
    return {
      url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(OVERPASS_QUERY)}`,
      headers: { "User-Agent": "FinBrioWire/1.0 (+https://finbrio.net)", Accept: "application/json" },
    };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.json();
  },

  normalize(raw: unknown): DataCenterFacility[] {
    const elements = (raw as { elements?: OverpassElement[] }).elements ?? [];
    return elements
      .map((el): DataCenterFacility => {
        const tags = el.tags ?? {};
        return {
          id: `osm-${el.type}-${el.id}`,
          name: tags.name || tags.operator || "Unnamed data center",
          operator: tags.operator || null,
          lat: el.lat ?? el.center?.lat ?? null,
          lon: el.lon ?? el.center?.lon ?? null,
          tier: tags["data_center:tier"] || null,
          osmType: el.type,
          osmId: el.id,
        };
      })
      .filter((f) => f.lat !== null && f.lon !== null);
  },
};
