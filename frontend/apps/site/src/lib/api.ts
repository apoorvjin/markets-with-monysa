// Build-time API helpers for programmatic SEO pages. These run during `astro build`
// (server-side, no CORS) against the production API. Override the base with the
// PUBLIC_API_BASE_URL env var for local/staging.

const API_BASE = (
  import.meta.env.PUBLIC_API_BASE_URL ?? "https://monysa-api.fly.dev"
).replace(/\/$/, "");

/** Fetch JSON, throwing on any non-2xx so the build FAILS rather than shipping blank pages. */
export async function fetchJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Build-time fetch failed: ${url} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** URL-safe slug from a display name (e.g. "United Kingdom" → "united-kingdom"). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- /api/tariffs shapes (mirror CLAUDE.md; only what the pages use) --------
export interface SectorTariff {
  sectorName: string;
  tariffRate: number;
  sourceURL?: string;
}
export interface DebtDetail {
  category: string;
  amountBillions: number;
  notes?: string;
}
export interface CountryTariff {
  countryName: string;
  countryCode: string;
  tariffRate: number;
  sectors: SectorTariff[];
  sourceURL?: string;
  lastUpdated?: string;
  debtToUSA?: DebtDetail[];
  laymanExplanation?: string;
  impactScore?: number;
  hasStockCoverage?: boolean;
}
export interface TariffsResponse {
  countries: CountryTariff[];
  dataAsOf: string;
  lastUpdated: string;
  source?: string;
}

export const getTariffs = () => fetchJson<TariffsResponse>("/api/tariffs");

/** Year from a "Month YYYY" (or ISO) `dataAsOf` string, for titles. */
export function yearOf(dataAsOf: string | undefined): number {
  const m = (dataAsOf ?? "").match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : new Date().getUTCFullYear();
}
