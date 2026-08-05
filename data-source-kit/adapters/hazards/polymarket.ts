/**
 * polymarket — Polymarket "gamma" markets API (prediction-market signal).
 * auth: none. Filtered to geopolitics/macro so the card reflects world events,
 * not sports/crypto. See README → Provenance.
 */

import type { SourceAdapter } from "../../core/adapter.js";
import { allowHosts } from "../../core/ssrf-allowlist.js";

allowHosts(["gamma-api.polymarket.com"]);

export interface PredictionMarket {
  id: string;
  question: string;
  slug: string;
  url: string;
  yesPrice: number | null; // implied probability 0–1
  volume: number | null;
  endDate: string | null;
  icon: string | null;
}

// Surface geopolitics / macro markets only.
const RELEVANT =
  /\b(war|ceasefire|truce|invasion|missile|nuclear|sanction|troops?|military|president|election|coup|regime|Trump|Putin|Xi|Zelensk|Netanyahu|Iran|China|Russia|Ukraine|Israel|Gaza|Taiwan|Korea|Venezuela|OPEC|oil|recession|inflation|rate cut|rate hike|\bFed\b|shutdown|tariff|default|debt ceiling|GDP|jobs|unemployment|central bank)\b/i;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}
function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const polymarketAdapter: SourceAdapter<Record<string, never>, PredictionMarket> = {
  id: "polymarket",
  auth: "none",
  cacheTtlMs: 10 * 60 * 1000,
  rateLimit: { note: "Public gamma API; 10-min cache." },

  endpoint() {
    return {
      url: "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volumeNum&ascending=false&limit=150",
    };
  },

  async parse(raw: Response): Promise<unknown> {
    return raw.json();
  },

  normalize(raw: unknown): PredictionMarket[] {
    const arr = Array.isArray(raw) ? raw : [];
    const now = Date.now();
    return arr
      .map((m): PredictionMarket => {
        const mkt = m as Record<string, unknown>;
        const outcomes = jsonArray(mkt.outcomes).map((o) => String(o).toLowerCase());
        const prices = jsonArray(mkt.outcomePrices);
        const yesIdx = outcomes.indexOf("yes");
        const yesPrice = num(prices[yesIdx >= 0 ? yesIdx : 0]);
        const slug = String(mkt.slug ?? "");
        return {
          id: String(mkt.id ?? slug),
          question: String(mkt.question ?? "").trim(),
          slug,
          url: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
          yesPrice,
          volume: num(mkt.volume),
          endDate: typeof mkt.endDate === "string" ? mkt.endDate : null,
          icon: typeof mkt.icon === "string" ? mkt.icon : null,
        };
      })
      .filter(
        (m) =>
          m.question &&
          RELEVANT.test(m.question) &&
          (!m.endDate || Date.parse(m.endDate) > now), // drop expired markets
      )
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 40);
  },
};
