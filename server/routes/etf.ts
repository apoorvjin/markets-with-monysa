import type { Express, Response } from "express";
import { fetchYahooPrice } from "./shared";
import { fetchYahooFundData } from "./heatmap";
import { getEtfRotationQuadrants } from "./economy";
import { ETF_UNIVERSE, ETF_ROTATION_CATEGORIES, type EtfCategory } from "../data/etf_universe";

const LIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const listCache = new Map<string, { data: unknown; ts: number }>();

const PROFILE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const profileCache = new Map<string, { data: unknown; ts: number }>();

const ROTATION_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let rotationCache: { data: unknown; ts: number } | null = null;

function setCacheHeaders(res: Response, ttlMs: number): void {
  const maxAge = Math.floor(ttlMs / 2000);
  const swr = Math.floor(ttlMs / 1000);
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}

export function registerEtfRoutes(app: Express): void {
  app.get("/api/etf/list", async (req, res) => {
    const category = req.query.category as EtfCategory | undefined;
    if (category && !ETF_UNIVERSE.some((e) => e.category === category)) {
      return res.status(400).json({ error: "Invalid category." });
    }
    const cacheKey = category ?? "all";
    const cached = listCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < LIST_CACHE_TTL) {
      setCacheHeaders(res, LIST_CACHE_TTL);
      return res.json(cached.data);
    }

    const etfs = category ? ETF_UNIVERSE.filter((e) => e.category === category) : ETF_UNIVERSE;
    const items = await Promise.all(etfs.map(async (etf) => {
      const price = await fetchYahooPrice(etf.symbol).catch(() => null);
      return {
        symbol: etf.symbol,
        name: etf.name,
        emoji: etf.emoji,
        category: etf.category,
        risk: etf.risk ?? null,
        price: price?.price ?? null,
        changePercent: price?.changePercent ?? null,
        preMarketPrice: price?.preMarketPrice ?? null,
        preMarketChangePercent: price?.preMarketChangePercent ?? null,
      };
    }));

    const data = { category: category ?? "all", items, lastUpdated: new Date().toISOString() };
    listCache.set(cacheKey, { data, ts: Date.now() });
    setCacheHeaders(res, LIST_CACHE_TTL);
    res.json(data);
  });

  app.get("/api/etf/:symbol/profile", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    if (!ETF_UNIVERSE.some((e) => e.symbol === symbol)) {
      return res.status(404).json({ error: "Unknown ETF symbol." });
    }
    const cached = profileCache.get(symbol);
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      setCacheHeaders(res, PROFILE_CACHE_TTL);
      return res.json(cached.data);
    }

    const fund = await fetchYahooFundData(symbol);
    const data = {
      symbol,
      expenseRatio: fund?.expenseRatio ?? null,
      aum: fund?.aum ?? null,
      family: fund?.family ?? null,
      holdings: fund?.holdings ?? [],
      sectorWeightings: fund?.sectorWeightings ?? [],
      lastUpdated: new Date().toISOString(),
    };
    profileCache.set(symbol, { data, ts: Date.now() });
    setCacheHeaders(res, PROFILE_CACHE_TTL);
    res.json(data);
  });

  app.get("/api/etf/rotation", async (_req, res) => {
    if (rotationCache && Date.now() - rotationCache.ts < ROTATION_CACHE_TTL) {
      setCacheHeaders(res, ROTATION_CACHE_TTL);
      return res.json(rotationCache.data);
    }

    const eligible = ETF_UNIVERSE.filter((e) => ETF_ROTATION_CATEGORIES.includes(e.category));
    const rrg = await getEtfRotationQuadrants(eligible);
    const categoryBySymbol = new Map(eligible.map((e) => [e.symbol, e.category]));
    const items = rrg.map((r) => ({ ...r, category: categoryBySymbol.get(r.symbol) ?? null }));

    const data = { items, lastUpdated: new Date().toISOString() };
    rotationCache = { data, ts: Date.now() };
    setCacheHeaders(res, ROTATION_CACHE_TTL);
    res.json(data);
  });
}
