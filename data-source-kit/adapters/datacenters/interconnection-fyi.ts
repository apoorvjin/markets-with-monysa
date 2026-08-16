/**
 * interconnection-fyi — U.S./Canada data center construction pipeline, scraped
 * from interconnection.fyi (public resource by GridTracker, the firm behind
 * LBNL's "Queued Up" report). No API exists — the site server-renders each page
 * with the data embedded as Next.js `pageProps` JSON (see core/next-data.ts),
 * which this reads directly instead of parsing HTML markup. robots.txt allows
 * crawling (verified 2026-08-14). auth: none.
 *
 * Two adapters, fetched in two steps by the caller (same shape as wire.ts's
 * per-feed aggregation): `indexAdapter` lists which region codes currently have
 * tracked projects; `stateAdapter` fetches one region's project list. Batching
 * across regions is the host project's concern (see server/routes/datacenters.ts),
 * matching how adapters here stay one-fetch-per-call.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";
import { extractPageProps } from "../../core/next-data.js";

allowHosts(["www.interconnection.fyi"]);

const USER_AGENT = "FinBrioWire/1.0 (+https://finbrio.net)";

export const PIPELINE_STATUSES = ["Operational", "Construction", "Proposed", "Cancelled", "Unknown"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export interface PipelineProject {
  id: string;
  name: string;
  region: string; // 2-letter state/province code
  county: string | null;
  city: string | null;
  status: PipelineStatus;
  capacityRange: string | null;
}

function isPipelineStatus(v: unknown): v is PipelineStatus {
  return typeof v === "string" && (PIPELINE_STATUSES as readonly string[]).includes(v);
}

// ── Index page: which region codes have tracked projects ──────────────────────

interface IndexPageProps {
  statesWithProjects?: string[];
}

export const interconnectionFyiIndexAdapter: SourceAdapter<Record<string, never>, string> = {
  id: "interconnection-fyi-index",
  auth: "none",
  cacheTtlMs: 24 * 60 * 60 * 1000,
  rateLimit: { note: "One page load per 24h cache window." },

  endpoint() {
    return {
      url: "https://www.interconnection.fyi/data-center",
      headers: { "User-Agent": USER_AGENT },
    };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.text();
  },

  normalize(raw: unknown): string[] {
    const html = typeof raw === "string" ? raw : String(raw);
    const props = extractPageProps<IndexPageProps>(html);
    return props?.statesWithProjects ?? [];
  },
};

// ── Per-region page: the actual project list ───────────────────────────────────

export interface RegionParams {
  region: string;
}

interface RegionPageProps {
  projects?: Array<{
    publicId?: string;
    developmentName?: string;
    operationalName?: string;
    state?: string;
    county?: string;
    city?: string;
    status?: string;
    capacityRange?: string;
  }>;
}

export const interconnectionFyiRegionAdapter: SourceAdapter<RegionParams, PipelineProject> = {
  id: "interconnection-fyi-region",
  auth: "none",
  cacheTtlMs: 24 * 60 * 60 * 1000,
  rateLimit: { note: "~50 region pages/day (one per tracked region, 24h cache) — light, page-view-shaped traffic." },

  endpoint({ region }) {
    return {
      url: `https://www.interconnection.fyi/data-center/state/${encodeURIComponent(region)}`,
      headers: { "User-Agent": USER_AGENT },
    };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.text();
  },

  normalize(raw: unknown, { region }): PipelineProject[] {
    const html = typeof raw === "string" ? raw : String(raw);
    const props = extractPageProps<RegionPageProps>(html);
    const projects = props?.projects ?? [];
    return projects
      .filter((p) => p.publicId)
      .map((p): PipelineProject => ({
        id: String(p.publicId),
        name: (p.operationalName || p.developmentName || "Unnamed project").trim(),
        region: p.state || region,
        county: p.county || null,
        city: p.city || null,
        status: isPipelineStatus(p.status) ? p.status : "Unknown",
        capacityRange: p.capacityRange || null,
      }));
  },
};
