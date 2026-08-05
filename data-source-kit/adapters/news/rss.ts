/**
 * rss — the News/OSINT SourceAdapter. One adapter serves every feed in the
 * registry; the caller passes which feed URL to fetch.
 *
 * Transliterated from the origin project's `api/rss-proxy.js` (fetch + parse), stripped
 * of the Vercel serverless wrapper. auth: none. The runner enforces the SSRF
 * allowlist before every fetch (see core/adapter.ts + core/ssrf-allowlist.ts).
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { parseRss, type RssItem } from "../../core/rss-parse.js";

export interface RssParams {
  url: string;
}

/** A polite UA — several publishers (e.g. SEC) reject the default/blank UA. */
const USER_AGENT = "FinBrioWire/1.0 (+https://finbrio.net)";

export const rssAdapter: SourceAdapter<RssParams, RssItem> = {
  id: "rss",
  auth: "none",
  enforceAllowlist: true,
  cacheTtlMs: 8 * 60 * 1000, // 8 min — feeds don't update faster than this matters
  timeoutMs: 12_000,
  rateLimit: { note: "Be a good citizen: cache 8m, one fetch per feed per window." },

  endpoint({ url }) {
    return {
      url,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    };
  },

  async parse(raw: Response): Promise<string> {
    return raw.text();
  },

  normalize(raw: unknown): RssItem[] {
    return parseRss(typeof raw === "string" ? raw : String(raw));
  },
};

export type { RssItem };
