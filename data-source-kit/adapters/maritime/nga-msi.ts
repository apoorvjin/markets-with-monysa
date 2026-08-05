/**
 * nga-msi — US NGA Maritime Safety Information broadcast warnings (NAVAREA
 * navigational warnings). auth: none. See README → Provenance.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";

allowHosts(["msi.nga.mil"]);

export interface MaritimeWarning {
  id: string;
  navArea: string;
  subregion: string;
  issued: string; // ISO
  summary: string;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** NGA MSI issueDate is a military date group: "081653Z MAY 2024". */
function parseMsiDate(s: string): string {
  const m = /^(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{4})/.exec((s ?? "").trim());
  if (!m) return "";
  const mon = MONTHS[m[4] ?? ""];
  if (mon === undefined) return "";
  const d = new Date(Date.UTC(+m[5]!, mon, +m[1]!, +m[2]!, +m[3]!));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export const ngaMsiAdapter: SourceAdapter<Record<string, never>, MaritimeWarning> = {
  id: "nga-msi",
  auth: "none",
  cacheTtlMs: 30 * 60 * 1000,
  rateLimit: { note: "Warnings change slowly; 30-min cache." },

  endpoint() {
    return { url: "https://msi.nga.mil/api/publications/broadcast-warn?status=active&output=json" };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.json();
  },

  normalize(raw: unknown): MaritimeWarning[] {
    const list = (raw as { "broadcast-warn"?: unknown[] })["broadcast-warn"] ?? [];
    return list
      .map((w): MaritimeWarning => {
        const warn = w as Record<string, unknown>;
        return {
          id: `${warn.navArea}-${warn.msgNumber}-${warn.msgYear}`,
          navArea: String(warn.navArea ?? ""),
          subregion: String(warn.subregion ?? ""),
          issued: parseMsiDate(String(warn.issueDate ?? "")),
          summary: String(warn.text ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240),
        };
      })
      .filter((w) => w.summary)
      .sort((a, b) => (Date.parse(b.issued) || 0) - (Date.parse(a.issued) || 0))
      .slice(0, 50);
  },
};
