import type { Express, Response } from "express";
// Reuse the portable data-source-kit as the single source of truth for feed
// ingestion (registry + SSRF guard + RSS parse + circuit-breaker runner +
// classifier). Prod ships it via Dockerfile `COPY . .` and runs it through the
// same `tsx server/index.ts` process — no build step.
import { runAdapter } from "../../data-source-kit/core/adapter.js";
import { rssAdapter } from "../../data-source-kit/adapters/news/rss.js";
import { classify } from "../../data-source-kit/adapters/news/classify.js";
import { extractTickers } from "../../data-source-kit/adapters/news/extract-tickers.js";
import {
  FEEDS,
  WIRE_DESKS,
  WIRE_DESK_LABELS,
  feedsForDesk,
  type Feed,
  type WireDesk,
} from "../../data-source-kit/adapters/news/feeds-registry.js";

const ITEMS_CACHE_TTL = 8 * 60 * 1000; // 8 min — matches the adapter's own TTL
const itemsCache = new Map<WireDesk, { data: unknown; ts: number }>();

// The breaking feed is polled app-wide (~60s) by every client for the in-app
// alert banner, so it gets its own short cache to keep the fan-out cheap.
const BREAKING_CACHE_TTL = 60 * 1000; // 60s
const BREAKING_WINDOW_MS = 20 * 60 * 1000; // only items from the last 20 min
let breakingCache: { data: unknown; ts: number } | null = null;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 120;

export interface WireItem {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
  sourceId: string;
  desk: WireDesk;
  category: string;
  severity: string;
  /** Exchange-tagged symbols named in the headline (e.g. ["AMIX"]). Corporate desk only in practice. */
  tickers: string[];
}

function isWireDesk(v: unknown): v is WireDesk {
  return typeof v === "string" && (WIRE_DESKS as readonly string[]).includes(v);
}

function setCacheHeaders(res: Response, ttlMs: number): void {
  const maxAge = Math.floor(ttlMs / 2000);
  const swr = Math.floor(ttlMs / 1000);
  // Unauthenticated public content (like /api/sectors, /api/bonds) — safe for a
  // shared CDN edge cache.
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}

/**
 * Fetch + normalize + classify every feed on a desk, merged/deduped/sorted.
 * Exported so other route modules can reuse an existing desk's live feed
 * aggregation instead of re-registering the same RSS sources (see
 * server/routes/datacenters.ts, which filters the corporate desk for
 * data-center-related announcements).
 */
export async function aggregateDesk(desk: WireDesk): Promise<WireItem[]> {
  const feeds = feedsForDesk(desk);
  const perFeed = await Promise.all(
    feeds.map(async (feed: Feed) => {
      // One dead feed must not sink the desk — the runner already degrades to
      // its cached/empty fallback, and we belt-and-braces catch here too.
      const items = await runAdapter(rssAdapter, { url: feed.url }).catch(() => []);
      return items.map((it): WireItem => {
        const { category, severity } = classify({
          title: it.title,
          summary: it.summary,
          pubDate: it.pubDate,
        });
        return {
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          summary: it.summary,
          source: feed.name,
          sourceId: feed.id,
          desk: feed.desk,
          category,
          severity,
          tickers: extractTickers(it.title, it.summary),
        };
      });
    }),
  );

  const seen = new Set<string>();
  const merged: WireItem[] = [];
  for (const item of perFeed.flat()) {
    if (!item.link || seen.has(item.link)) continue;
    // The Corporate Wire desk is only useful when a PR resolves to a symbol —
    // this also drops PR Newswire's non-market noise (dentistry, etc.).
    if (desk === "corporate" && item.tickers.length === 0) continue;
    seen.add(item.link);
    merged.push(item);
  }
  // Newest first; items without a parseable date sort last.
  merged.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
  return merged;
}

/** Recent high-urgency items across every desk — feeds the in-app alert banner. */
async function collectBreaking(): Promise<WireItem[]> {
  const perDesk = await Promise.all(WIRE_DESKS.map((d) => aggregateDesk(d)));
  const cutoff = Date.now() - BREAKING_WINDOW_MS;
  const seen = new Set<string>();
  const out: WireItem[] = [];
  for (const item of perDesk.flat()) {
    if (item.severity !== "breaking" && item.severity !== "alert") continue;
    const t = Date.parse(item.pubDate);
    if (Number.isNaN(t) || t < cutoff) continue; // undated items never count as fresh
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    out.push(item);
  }
  out.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
  return out;
}

export function registerWireRoutes(app: Express): void {
  // Desk metadata for laying out the terminal columns without an upstream fetch.
  app.get("/api/wire/desks", (_req, res) => {
    setCacheHeaders(res, 60 * 60 * 1000);
    res.json({
      desks: WIRE_DESKS.map((desk) => ({
        id: desk,
        label: WIRE_DESK_LABELS[desk],
        sources: feedsForDesk(desk).map((f) => f.name),
      })),
      totalFeeds: FEEDS.length,
      lastUpdated: new Date().toISOString(),
    });
  });

  // Aggregated, deduped, newest-first, classified items for one desk.
  app.get("/api/wire/items", async (req, res) => {
    const desk = req.query.desk;
    if (!isWireDesk(desk)) {
      return res.status(400).json({ error: `Invalid desk. Use one of: ${WIRE_DESKS.join(", ")}` });
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const cached = itemsCache.get(desk);
    if (cached && Date.now() - cached.ts < ITEMS_CACHE_TTL) {
      setCacheHeaders(res, ITEMS_CACHE_TTL);
      const data = cached.data as { desk: WireDesk; items: WireItem[]; lastUpdated: string };
      return res.json({ ...data, items: data.items.slice(0, limit) });
    }

    const items = await aggregateDesk(desk);
    const data = { desk, items, lastUpdated: new Date().toISOString() };
    itemsCache.set(desk, { data, ts: Date.now() });
    setCacheHeaders(res, ITEMS_CACHE_TTL);
    res.json({ ...data, items: items.slice(0, limit) });
  });

  // Recent breaking/alert items across all desks — the client alert engine
  // applies its own eligibility/dedupe/cooldown gates on top of this.
  app.get("/api/wire/breaking", async (_req, res) => {
    if (breakingCache && Date.now() - breakingCache.ts < BREAKING_CACHE_TTL) {
      setCacheHeaders(res, BREAKING_CACHE_TTL);
      return res.json(breakingCache.data);
    }
    const items = await collectBreaking();
    const data = { items, lastUpdated: new Date().toISOString() };
    breakingCache = { data, ts: Date.now() };
    setCacheHeaders(res, BREAKING_CACHE_TTL);
    res.json(data);
  });
}
