/**
 * faa-nas — FAA National Airspace System status (ground delays/stops, airport
 * closures, arrival/departure delays). auth: none. Response is flat XML, parsed
 * with core/xml-lite. See README → Provenance.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";
import { extractBlocks, tagText } from "../../core/xml-lite.js";

allowHosts(["nasstatus.faa.gov"]);

export type AirspaceKind = "ground-stop" | "ground-delay" | "closure" | "delay";

export interface AirspaceEvent {
  airport: string;
  kind: AirspaceKind;
  reason: string;
  detail: string;
}

function itemsFrom(block: string, tag: string, kind: AirspaceKind): AirspaceEvent[] {
  return extractBlocks(block, tag).map((it) => {
    const avg = tagText(it, "Avg");
    const max = tagText(it, "Max");
    const start = tagText(it, "Start");
    const reopen = tagText(it, "Reopen");
    const detailParts = [
      avg && `avg ${avg}`,
      max && `max ${max}`,
      start && `from ${start}`,
      reopen && `until ${reopen}`,
    ].filter(Boolean);
    return {
      airport: tagText(it, "ARPT"),
      kind,
      reason: tagText(it, "Reason"),
      detail: detailParts.join(" · "),
    };
  });
}

export const faaNasAdapter: SourceAdapter<Record<string, never>, AirspaceEvent> = {
  id: "faa-nas",
  auth: "none",
  cacheTtlMs: 3 * 60 * 1000,
  rateLimit: { note: "Airport status flips minute-to-minute; 3-min cache." },

  endpoint() {
    return { url: "https://nasstatus.faa.gov/api/airport-status-information" };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.text();
  },

  normalize(raw: unknown): AirspaceEvent[] {
    const xml = typeof raw === "string" ? raw : String(raw);
    const out: AirspaceEvent[] = [];
    for (const block of extractBlocks(xml, "Delay_type")) {
      const name = tagText(block, "Name").toLowerCase();
      if (name.includes("ground stop")) out.push(...itemsFrom(block, "Ground_Stop", "ground-stop"));
      else if (name.includes("ground delay")) out.push(...itemsFrom(block, "Ground_Delay", "ground-delay"));
      else if (name.includes("closure")) out.push(...itemsFrom(block, "Airport", "closure"));
      else if (name.includes("arrival") || name.includes("departure") || name.includes("delay"))
        out.push(...itemsFrom(block, "Delay", "delay"));
    }
    return out.filter((e) => e.airport);
  },
};
