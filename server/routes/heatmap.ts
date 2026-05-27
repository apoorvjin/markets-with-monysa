import type { Express } from "express";
import { fetchYahooPrice, fetchRangeData } from "./shared";

const HEATMAP_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
let heatmapCache: { data: unknown; timestamp: number } | null = null;
// Deduplicates concurrent fetches: if a fetch is already in flight, all concurrent
// callers await the same Promise rather than each firing 72+ Yahoo Finance requests.
let heatmapInFlight: Promise<void> | null = null;

// Representative symbols per geographic macro-region
const REGION_SYMBOLS: { name: string; flag: string; symbols: string[] }[] = [
  { name: "Americas",          flag: "🌎", symbols: ["^GSPC", "^GSPTSE", "^BVSP", "^MXX"] },
  { name: "Europe",            flag: "🌍", symbols: ["^STOXX50E", "^FTSE", "^GDAXI", "^FCHI"] },
  { name: "Asia-Pacific",      flag: "🌏", symbols: ["^N225", "^HSI", "^NSEI", "^AXJO"] },
  { name: "Middle East & Africa", flag: "🌐", symbols: ["^TASI.SR", "^J203.JO", "^CASE30"] },
];

// Representative symbols per asset class
const ASSET_CLASS_SYMBOLS: { name: string; emoji: string; symbols: string[] }[] = [
  { name: "Equities",    emoji: "📈", symbols: ["^GSPC", "^STOXX50E", "^N225"] },
  { name: "Commodities", emoji: "🛢️", symbols: ["GC=F", "CL=F", "HG=F"] },
  { name: "Crypto",      emoji: "₿",  symbols: ["BTC-USD", "ETH-USD"] },
  { name: "USD",         emoji: "💵", symbols: ["DX-Y.NYB"] },
  { name: "Bonds",       emoji: "🏦", symbols: ["TLT"] },
];

type PerSymbolData = {
  changePercent: number | null;
  perf1W: number | null;
  perf1M: number | null;
  perf3M: number | null;
  perf6M: number | null;
  perf1Y: number | null;
  perf3Y: number | null;
  perf5Y: number | null;
};

async function fetchSymbolData(symbol: string): Promise<PerSymbolData> {
  const [price, week, month, quarter, halfYear, year, threeYear, fiveYear] = await Promise.all([
    fetchYahooPrice(symbol),
    fetchRangeData(symbol, "5d"),
    fetchRangeData(symbol, "1mo"),
    fetchRangeData(symbol, "3mo"),
    fetchRangeData(symbol, "6mo"),
    fetchRangeData(symbol, "1y"),
    fetchRangeData(symbol, "3y"),
    fetchRangeData(symbol, "5y"),
  ]);
  return {
    changePercent: price?.changePercent ?? null,
    perf1W: week?.changePercent ?? null,
    perf1M: month?.changePercent ?? null,
    perf3M: quarter?.changePercent ?? null,
    perf6M: halfYear?.changePercent ?? null,
    perf1Y: year?.changePercent ?? null,
    perf3Y: threeYear?.changePercent ?? null,
    perf5Y: fiveYear?.changePercent ?? null,
  };
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ── Individual Assets ─────────────────────────────────────────────────────────

const INDIVIDUAL_ASSETS: { symbol: string; name: string; emoji: string; category: string }[] = [
  // Commodities
  { symbol: "GC=F",  name: "Gold",        emoji: "🥇", category: "Commodities" },
  { symbol: "SI=F",  name: "Silver",      emoji: "⚪", category: "Commodities" },
  { symbol: "CL=F",  name: "Crude Oil",   emoji: "🛢️", category: "Commodities" },
  { symbol: "BZ=F",  name: "Brent Crude", emoji: "🛢️", category: "Commodities" },
  { symbol: "NG=F",  name: "Natural Gas", emoji: "🔥", category: "Commodities" },
  { symbol: "HG=F",  name: "Copper",      emoji: "🔶", category: "Commodities" },
  { symbol: "PL=F",  name: "Platinum",    emoji: "⬜", category: "Commodities" },
  { symbol: "PA=F",  name: "Palladium",   emoji: "🔷", category: "Commodities" },
  { symbol: "ZW=F",  name: "Wheat",       emoji: "🌾", category: "Commodities" },
  { symbol: "ZC=F",  name: "Corn",        emoji: "🌽", category: "Commodities" },
  { symbol: "ZS=F",  name: "Soybeans",    emoji: "🫘", category: "Commodities" },
  { symbol: "SB=F",  name: "Sugar",       emoji: "🍬", category: "Commodities" },
  { symbol: "KC=F",  name: "Coffee",      emoji: "☕", category: "Commodities" },
  { symbol: "CT=F",  name: "Cotton",      emoji: "🌿", category: "Commodities" },
  // Indices
  { symbol: "^GSPC",  name: "S&P 500",     emoji: "🇺🇸", category: "Indices" },
  { symbol: "^DJI",   name: "Dow Jones",   emoji: "🇺🇸", category: "Indices" },
  { symbol: "^IXIC",  name: "NASDAQ",      emoji: "🇺🇸", category: "Indices" },
  { symbol: "^RUT",   name: "Russell 2000",emoji: "🇺🇸", category: "Indices" },
  { symbol: "^FTSE",  name: "FTSE 100",    emoji: "🇬🇧", category: "Indices" },
  { symbol: "^GDAXI", name: "DAX",         emoji: "🇩🇪", category: "Indices" },
  { symbol: "^FCHI",  name: "CAC 40",      emoji: "🇫🇷", category: "Indices" },
  { symbol: "^N225",  name: "Nikkei 225",  emoji: "🇯🇵", category: "Indices" },
  { symbol: "^HSI",   name: "Hang Seng",   emoji: "🇭🇰", category: "Indices" },
  { symbol: "^AXJO",  name: "ASX 200",     emoji: "🇦🇺", category: "Indices" },
  { symbol: "^NSEI",  name: "Nifty 50",    emoji: "🇮🇳", category: "Indices" },
  { symbol: "^BVSP",  name: "Bovespa",     emoji: "🇧🇷", category: "Indices" },
  { symbol: "^MXX",   name: "IPC Mexico",  emoji: "🇲🇽", category: "Indices" },
  // Crypto
  { symbol: "BTC-USD",  name: "Bitcoin",   emoji: "₿",  category: "Crypto" },
  { symbol: "ETH-USD",  name: "Ethereum",  emoji: "Ξ",  category: "Crypto" },
  { symbol: "BNB-USD",  name: "BNB",       emoji: "🟡", category: "Crypto" },
  { symbol: "SOL-USD",  name: "Solana",    emoji: "◎",  category: "Crypto" },
  { symbol: "XRP-USD",  name: "XRP",       emoji: "✕",  category: "Crypto" },
  { symbol: "ADA-USD",  name: "Cardano",   emoji: "₳",  category: "Crypto" },
  { symbol: "AVAX-USD", name: "Avalanche", emoji: "🔺", category: "Crypto" },
  { symbol: "DOT-USD",  name: "Polkadot",  emoji: "⬤",  category: "Crypto" },
  { symbol: "LINK-USD", name: "Chainlink", emoji: "🔗", category: "Crypto" },
  { symbol: "DOGE-USD", name: "Dogecoin",  emoji: "🐕", category: "Crypto" },
];

// Resolves with null fields after timeoutMs rather than hanging indefinitely.
async function fetchSymbolDataSafe(symbol: string, timeoutMs = 6000): Promise<PerSymbolData> {
  const fallback: PerSymbolData = {
    changePercent: null, perf1W: null, perf1M: null, perf3M: null,
    perf6M: null, perf1Y: null, perf3Y: null, perf5Y: null,
  };
  try {
    return await Promise.race([
      fetchSymbolData(symbol),
      new Promise<PerSymbolData>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
  } catch {
    return fallback;
  }
}

const ASSETS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
// Per-category caches so Indices/Commodities/Crypto are fetched independently.
const assetsCacheMap = new Map<string, { data: unknown; timestamp: number }>();
const assetsInFlightMap = new Map<string, Promise<void>>();

export function registerHeatmapRoutes(app: Express): void {
  app.get("/api/heatmap", async (_req, res) => {
    try {
      if (heatmapCache && Date.now() - heatmapCache.timestamp < HEATMAP_CACHE_DURATION) {
        return res.json(heatmapCache.data);
      }

      // If a fetch is already in flight, join it rather than firing a second
      // batch of 72+ Yahoo Finance requests simultaneously.
      if (!heatmapInFlight) {
        heatmapInFlight = (async () => {
          // Collect all unique symbols to avoid duplicate fetches
          const regionSymbols = REGION_SYMBOLS.flatMap((r) => r.symbols);
          const assetSymbols = ASSET_CLASS_SYMBOLS.flatMap((a) => a.symbols);
          const allSymbols = [...new Set([...regionSymbols, ...assetSymbols])];

          // Fetch all symbols in parallel
          const symbolDataMap = new Map<string, PerSymbolData>();
          const results = await Promise.all(allSymbols.map((s) => fetchSymbolData(s)));
          allSymbols.forEach((s, i) => symbolDataMap.set(s, results[i]));

          const regions = REGION_SYMBOLS.map((r) => {
            const group = r.symbols.map((s) => symbolDataMap.get(s)!);
            return {
              name: r.name,
              emoji: r.flag,
              changePercent: avg(group.map((d) => d.changePercent)),
              perf1W: avg(group.map((d) => d.perf1W)),
              perf1M: avg(group.map((d) => d.perf1M)),
              perf3M: avg(group.map((d) => d.perf3M)),
              perf6M: avg(group.map((d) => d.perf6M)),
              perf1Y: avg(group.map((d) => d.perf1Y)),
              perf3Y: avg(group.map((d) => d.perf3Y)),
              perf5Y: avg(group.map((d) => d.perf5Y)),
            };
          });

          const assetClasses = ASSET_CLASS_SYMBOLS.map((a) => {
            const group = a.symbols.map((s) => symbolDataMap.get(s)!);
            return {
              name: a.name,
              emoji: a.emoji,
              changePercent: avg(group.map((d) => d.changePercent)),
              perf1W: avg(group.map((d) => d.perf1W)),
              perf1M: avg(group.map((d) => d.perf1M)),
              perf3M: avg(group.map((d) => d.perf3M)),
              perf6M: avg(group.map((d) => d.perf6M)),
              perf1Y: avg(group.map((d) => d.perf1Y)),
              perf3Y: avg(group.map((d) => d.perf3Y)),
              perf5Y: avg(group.map((d) => d.perf5Y)),
            };
          });

          const result = { regions, assetClasses, lastUpdated: new Date().toISOString() };
          heatmapCache = { data: result, timestamp: Date.now() };
        })().finally(() => { heatmapInFlight = null; });
      }

      await heatmapInFlight;
      return res.json(heatmapCache!.data);
    } catch (e) {
      console.error("Error fetching heatmap data:", e);
      res.status(500).json({ error: "Failed to fetch heatmap data" });
    }
  });

  // Individual assets — ?category=Indices|Commodities|Crypto fetches only that subset.
  // Each category has its own cache and in-flight deduplication.
  app.get("/api/heatmap/assets", async (req, res) => {
    try {
      const category = (req.query.category as string | undefined)?.trim() ?? "all";
      const assetsToFetch = category === "all"
        ? INDIVIDUAL_ASSETS
        : INDIVIDUAL_ASSETS.filter((a) => a.category === category);

      const cached = assetsCacheMap.get(category);
      if (cached && Date.now() - cached.timestamp < ASSETS_CACHE_DURATION) {
        return res.json(cached.data);
      }

      if (!assetsInFlightMap.has(category)) {
        const inFlight = (async () => {
          const BATCH = 10;
          const results: PerSymbolData[] = [];
          for (let i = 0; i < assetsToFetch.length; i += BATCH) {
            const batch = assetsToFetch.slice(i, i + BATCH);
            const batchResults = await Promise.all(batch.map((a) => fetchSymbolDataSafe(a.symbol)));
            results.push(...batchResults);
          }
          const assets = assetsToFetch.map((a, i) => ({
            name: a.name, emoji: a.emoji, symbol: a.symbol, category: a.category,
            ...results[i],
          }));
          assetsCacheMap.set(category, { data: { assets, lastUpdated: new Date().toISOString() }, timestamp: Date.now() });
        })().finally(() => { assetsInFlightMap.delete(category); });
        assetsInFlightMap.set(category, inFlight);
      }

      await assetsInFlightMap.get(category);
      return res.json(assetsCacheMap.get(category)!.data);
    } catch (e) {
      console.error("Error fetching individual assets heatmap:", e);
      res.status(500).json({ error: "Failed to fetch assets heatmap" });
    }
  });
}
