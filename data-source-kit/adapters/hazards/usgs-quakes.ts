/**
 * usgs-quakes — USGS earthquake summary feed (GeoJSON). auth: none.
 * See README → Provenance. The runner enforces the SSRF allowlist; this module
 * registers the USGS host on import.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";

allowHosts(["earthquake.usgs.gov"]);

export interface Quake {
  id: string;
  mag: number | null;
  place: string;
  time: string; // ISO
  lon: number | null;
  lat: number | null;
  depth: number | null;
  url: string;
  tsunami: boolean;
  alert: string | null; // USGS PAGER alert: green|yellow|orange|red
  sig: number | null; // significance 0–1000
  magType: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const usgsQuakesAdapter: SourceAdapter<Record<string, never>, Quake> = {
  id: "usgs-quakes",
  auth: "none",
  cacheTtlMs: 5 * 60 * 1000,
  rateLimit: { note: "Summary feed updates ~1/min; a 5-min cache is plenty." },

  endpoint() {
    // M2.5+ over the past day — enough to be lively without noise.
    return { url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson" };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.json();
  },

  normalize(raw: unknown): Quake[] {
    const features = (raw as { features?: unknown[] }).features ?? [];
    return features
      .map((f): Quake => {
        const feat = f as {
          id?: string;
          properties?: Record<string, unknown>;
          geometry?: { coordinates?: number[] };
        };
        const p = feat.properties ?? {};
        const c = feat.geometry?.coordinates ?? [];
        return {
          id: String(feat.id ?? p.code ?? `${p.time}`),
          mag: num(p.mag),
          place: String(p.place ?? "").trim(),
          time: typeof p.time === "number" ? new Date(p.time).toISOString() : "",
          lon: num(c[0]),
          lat: num(c[1]),
          depth: num(c[2]),
          url: String(p.url ?? ""),
          tsunami: p.tsunami === 1,
          alert: typeof p.alert === "string" ? p.alert : null,
          sig: num(p.sig),
          magType: String(p.magType ?? ""),
        };
      })
      .filter((q) => q.mag !== null)
      .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  },
};
