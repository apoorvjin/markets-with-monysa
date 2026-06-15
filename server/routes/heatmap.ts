import type { Express } from "express";
import { fetchYahooPrice, fetchRangeData } from "./shared";
import { getDevicePlan, isPro } from "../plan-enforcement";
import { INDEX_SYMBOLS } from "../data/index_constituents";

// ── FX normalisation (USD primary, native secondary) ─────────────────────────

const INDEX_CURRENCY: Record<string, string> = {
  sp500: "USD", ndx: "USD", dji: "USD", russell2000: "USD",
  ftse100: "GBP", dax40: "EUR", nikkei225: "JPY", hsi: "HKD", nifty50: "INR",
};

// Yahoo symbols for non-USD currencies.
// inverse=true means Yahoo quotes "1 USD = X native", so rate to USD = 1/price.
const CURRENCY_FX_SYMBOL: Record<string, { symbol: string; inverse: boolean }> = {
  GBP: { symbol: "GBPUSD=X", inverse: false },
  EUR: { symbol: "EURUSD=X", inverse: false },
  JPY: { symbol: "USDJPY=X", inverse: true },
  HKD: { symbol: "USDHKD=X", inverse: true },
  INR: { symbol: "USDINR=X", inverse: true },
};

const FX_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const fxRateCache = new Map<string, { rateToUsd: number; timestamp: number }>();

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
      res.set("Cache-Control", "public, max-age=450, stale-while-revalidate=900"); // 7.5m / 15m SWR
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

      res.set("Cache-Control", "public, max-age=900, stale-while-revalidate=1800"); // 15m / 30m SWR
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

  // ── Movers (Pro): top gainers/losers per US index in the active session ──
  // GET /api/heatmap/movers?index=sp500|ndx|russell2000
  // Auto-resolves session from marketState: PRE → pre-market %, REGULAR → today %,
  // POST/POSTPOST → after-hours %. Reuses the treemap quote pipeline so cache hits
  // are shared across both endpoints.
  app.get("/api/heatmap/movers", async (req, res) => {
    try {
      if (!isPro(getDevicePlan(req))) {
        return res.status(403).json({
          error: "Movers requires Pro plan.",
          code: "PLAN_REQUIRED",
        });
      }

      const index = (req.query.index as string | undefined)?.toLowerCase() ?? "sp500";
      const SUPPORTED_MOVER_INDICES = new Set(["sp500", "ndx", "dji", "russell2000"]);
      if (!SUPPORTED_MOVER_INDICES.has(index)) {
        return res.status(400).json({
          error: `Unsupported index: ${index}. Supported: ${[...SUPPORTED_MOVER_INDICES].join(", ")}.`,
        });
      }

      // Plan-gated → private; quote TTL on the upstream treemap cache is 5 min.
      res.set("Cache-Control", "private, max-age=150, stale-while-revalidate=300");

      // Reuse the treemap 1d cache — the underlying stock list already carries
      // every field we need (regular changePercent, pre/postMarketChangePercent,
      // marketState). limit=500 to surface the full universe before we filter.
      const cacheKey = `${index}:1d`;
      await ensureTreemapCacheFresh(cacheKey, index, "1d", 500);
      const cached = treemapDataCache.get(cacheKey)!;
      const marketState = cached.marketState ?? "REGULAR";

      const session: "pre" | "regular" | "post" =
        marketState === "PRE"
          ? "pre"
          : (marketState === "POST" || marketState === "POSTPOST")
          ? "post"
          : "regular";

      const pickPct = (s: typeof cached.stocks[number]): number | null => {
        if (session === "pre") return s.preMarketChangePercent;
        if (session === "post") return s.postMarketChangePercent;
        return s.changePercent;
      };

      const ranked = cached.stocks
        .map((s) => ({ stock: s, pct: pickPct(s) }))
        .filter((r): r is { stock: typeof cached.stocks[number]; pct: number } =>
          r.pct != null && Number.isFinite(r.pct),
        );

      const gainers = ranked
        .filter((r) => r.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 10)
        .map((r) => r.stock);

      const losers = ranked
        .filter((r) => r.pct < 0)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 10)
        .map((r) => r.stock);

      return res.json({
        index,
        session,
        marketState,
        gainers,
        losers,
        lastUpdated: cached.lastUpdated,
      });
    } catch (e) {
      console.error("Error fetching movers data:", e);
      res.status(500).json({ error: "Failed to fetch movers data" });
    }
  });

  // ── Treemap (Pro): S&P 500 stocks weighted by market cap, colored by 1D %change ──
  // GET /api/heatmap/treemap?index=sp500&limit=100
  // Constituents from a public CSV (cached 24h), live marketCap + %change from
  // Yahoo Finance quoteSummary (cached 5min).
  app.get("/api/heatmap/treemap", async (req, res) => {
    try {
      if (!isPro(getDevicePlan(req))) {
        return res.status(403).json({
          error: "Treemap Heatmap requires Pro plan.",
          code: "PLAN_REQUIRED",
        });
      }

      const index = (req.query.index as string | undefined)?.toLowerCase() ?? "sp500";
      const SUPPORTED_INDICES = new Set([
        "sp500", "ndx", "dji", "ftse100", "nifty50",
        "dax40", "hsi", "nikkei225", "russell2000",
      ]);
      if (!SUPPORTED_INDICES.has(index)) {
        return res.status(400).json({
          error: `Unsupported index: ${index}. Supported: ${[...SUPPORTED_INDICES].join(", ")}.`,
        });
      }

      const ALLOWED_LIMITS = new Set([30, 50, 100, 150, 200, 500]);
      const rawLimit = parseInt((req.query.limit as string | undefined) ?? "100", 10);
      const limit = ALLOWED_LIMITS.has(rawLimit) ? rawLimit : 100;

      const timeframe = (req.query.timeframe as string | undefined)?.toLowerCase() ?? "1d";
      if (!SUPPORTED_TIMEFRAMES.has(timeframe)) {
        return res.status(400).json({
          error: `Unsupported timeframe: ${timeframe}. Supported: ${[...SUPPORTED_TIMEFRAMES].join(", ")}.`,
        });
      }

      // Plan-gated → use `private`; quotes refresh every 5m, constituents 24h.
      res.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600"); // 5m / 10m SWR
      const cacheKey = `${index}:${timeframe}`;
      await ensureTreemapCacheFresh(cacheKey, index, timeframe, limit);
      const cached = treemapDataCache.get(cacheKey)!;
      const top = cached.stocks.slice(0, limit);
      return res.json({
        index,
        timeframe,
        limit,
        total: cached.stocks.length,
        marketState: cached.marketState,
        stocks: top,
        lastUpdated: cached.lastUpdated,
      });
    } catch (e) {
      console.error("Error fetching treemap data:", e);
      res.status(500).json({ error: "Failed to fetch treemap data" });
    }
  });
}

// ── Treemap data pipeline ──────────────────────────────────────────────────────

type TreemapStock = {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;        // native-currency value — unchanged
  changePercent: number;
  price: number;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  // Sparkline closes for the active timeframe. Present when timeframe !== "1d".
  sparkline: number[] | null;
  // Pre/post market data — only meaningful when marketState is PRE/POST.
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChangePercent: number | null;
  // FX normalisation fields (US-005).
  nativeCurrency: string;        // "USD" | "GBP" | "JPY" | "HKD" | "INR"
  marketCapUsd: number | null;   // null only when non-USD index + FX fetch failed
  fxRateUsed: number | null;     // null for USD indices
};

const SUPPORTED_TIMEFRAMES = new Set(["1d", "1w", "1m", "ytd"]);
// Yahoo /v8/finance/chart range values per timeframe.
const TIMEFRAME_RANGE: Record<string, string> = {
  "1w": "5d",
  "1m": "1mo",
  "ytd": "ytd",
};

// For S&P 500 we get name+sector from the public CSV up front. For other
// indices we carry just the symbol and let Yahoo fill in name+sector at
// quote time via assetProfile.
export type Constituent = { symbol: string; name?: string; sector?: string };

const CONSTITUENT_TTL = 24 * 60 * 60 * 1000;     // 24h
const TREEMAP_TTL = 5 * 60 * 1000;               // 5m live quotes

const constituentCache = new Map<string, { data: Constituent[]; timestamp: number }>();
const treemapDataCache = new Map<string, {
  stocks: TreemapStock[];
  marketState: string | null;
  lastUpdated: string;
  timestamp: number;
}>();
const treemapInFlight = new Map<string, Promise<void>>();

async function getUsdRate(currency: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const cached = fxRateCache.get(currency);
  if (cached && Date.now() - cached.timestamp < FX_CACHE_TTL) return cached.rateToUsd;
  const cfg = CURRENCY_FX_SYMBOL[currency];
  if (!cfg) return null;
  try {
    const q = await fetchYahooQuoteSummary(cfg.symbol);
    if (!q?.price) return null;
    const rate = cfg.inverse ? 1 / q.price : q.price;
    fxRateCache.set(currency, { rateToUsd: rate, timestamp: Date.now() });
    return rate;
  } catch {
    return null;
  }
}

async function ensureTreemapCacheFresh(
  cacheKey: string,
  index: string,
  timeframe: string,
  limit: number,
): Promise<void> {
  const cached = treemapDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TREEMAP_TTL && cached.stocks.length >= limit) return;

  let inFlight = treemapInFlight.get(cacheKey);
  if (!inFlight) {
    inFlight = (async () => {
      const currency = INDEX_CURRENCY[index] ?? "USD";
      // Fetch FX rate concurrently with constituents — both are cached so this
      // adds no latency on warm runs; on cold runs the FX fetch is fast.
      const [constituents, fxRate] = await Promise.all([
        fetchConstituents(index),
        getUsdRate(currency),
      ]);
      const needsAssetProfile = constituents.some(c => !c.sector || !c.name);
      const symbols = constituents.map(c => c.symbol);
      const quotes = await fetchYahooQuoteSummaryBatch(
        symbols,
        { includeAssetProfile: needsAssetProfile },
      );

      // For non-1d timeframes we additionally fetch chart range data per symbol
      // — it gives both the period %change and a daily-closes sparkline.
      let rangeMap: Map<string, { changePercent: number; sparkline: number[] }> = new Map();
      if (timeframe !== "1d") {
        rangeMap = await fetchRangeBatch(symbols, TIMEFRAME_RANGE[timeframe]);
      }

      const stocks: TreemapStock[] = [];
      for (const c of constituents) {
        const q = quotes.get(c.symbol);
        if (!q || q.marketCap == null || q.price == null) continue;
        // 1d → realtime regularMarketChangePercent; otherwise the computed
        // %change between closes[0] and closes[-1] of the range.
        let changePercent: number | null;
        let sparkline: number[] | null = null;
        if (timeframe === "1d") {
          changePercent = q.changePercent;
        } else {
          const r = rangeMap.get(c.symbol);
          if (!r) continue;
          changePercent = r.changePercent;
          sparkline = r.sparkline;
        }
        if (changePercent == null) continue;
        const name = c.name ?? q.longName ?? q.shortName ?? c.symbol;
        const sector = c.sector ?? q.sector ?? "Unknown";
        const marketCapUsd = currency === "USD"
          ? q.marketCap
          : (fxRate != null ? +(q.marketCap * fxRate).toFixed(0) : null);
        stocks.push({
          symbol: c.symbol,
          name,
          sector,
          marketCap: q.marketCap,
          changePercent: +changePercent.toFixed(2),
          price: +q.price.toFixed(2),
          dayHigh: q.dayHigh,
          dayLow: q.dayLow,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          sparkline,
          preMarketPrice: q.preMarketPrice,
          preMarketChangePercent: q.preMarketChangePercent,
          postMarketPrice: q.postMarketPrice,
          postMarketChangePercent: q.postMarketChangePercent,
          nativeCurrency: currency,
          marketCapUsd,
          fxRateUsed: currency !== "USD" ? fxRate : null,
        });
      }
      stocks.sort((a, b) => b.marketCap - a.marketCap);

      let marketState: string | null = null;
      {
        const counts = new Map<string, number>();
        for (const q of quotes.values()) {
          if (q.marketState) counts.set(q.marketState, (counts.get(q.marketState) ?? 0) + 1);
        }
        let max = 0;
        for (const [state, n] of counts) {
          if (n > max) { max = n; marketState = state; }
        }
      }
      treemapDataCache.set(cacheKey, {
        stocks,
        marketState,
        lastUpdated: new Date().toISOString(),
        timestamp: Date.now(),
      });
    })().finally(() => { treemapInFlight.delete(cacheKey); });
    treemapInFlight.set(cacheKey, inFlight);
  }
  await inFlight;
}

// Bounded-concurrency fan-out of fetchRangeData. Mirrors the quoteSummary batch
// fetcher so non-1d treemap refreshes have predictable latency.
async function fetchRangeBatch(
  symbols: string[],
  range: string,
): Promise<Map<string, { changePercent: number; sparkline: number[] }>> {
  const out = new Map<string, { changePercent: number; sparkline: number[] }>();
  const CONCURRENCY = 10;
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const my = idx++;
      const sym = symbols[my];
      try {
        const r = await fetchRangeData(sym, range);
        if (r && typeof r.changePercent === "number" && Array.isArray(r.sparkline)) {
          out.set(sym, { changePercent: r.changePercent, sparkline: r.sparkline });
        }
      } catch { /* swallow */ }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

// Public, anonymous CSV of S&P 500 constituents with GICS sector labels.
// Refreshed on every index rebalance by the dataset maintainers.
const SP500_CSV_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";

async function fetchConstituents(index: string): Promise<Constituent[]> {
  const cached = constituentCache.get(index);
  if (cached && Date.now() - cached.timestamp < CONSTITUENT_TTL) return cached.data;

  let data: Constituent[];
  if (index === "sp500") {
    data = await fetchSp500Constituents();
  } else {
    const syms = INDEX_SYMBOLS[index];
    if (!syms) throw new Error(`No constituent list for index: ${index}`);
    data = syms.map(s => ({ symbol: s }));
  }
  constituentCache.set(index, { data, timestamp: Date.now() });
  return data;
}

export async function fetchSp500Constituents(): Promise<Constituent[]> {
  const resp = await fetch(SP500_CSV_URL, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`SP500 CSV HTTP ${resp.status}`);
  const text = await resp.text();
  const lines = text.split(/\r?\n/).slice(1).filter(l => l.trim().length > 0);
  const data: Constituent[] = [];
  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length < 3) continue;
    const [symbol, name, sector] = parts;
    if (!symbol || !name || !sector) continue;
    // Yahoo uses dashes, not dots, for class-share suffixes (BRK.B → BRK-B).
    data.push({ symbol: symbol.replace(".", "-"), name, sector });
  }
  return data;
}

// Minimal RFC-4180 CSV line parser — handles quoted fields with embedded commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ── Yahoo Finance quoteSummary with crumb auth ────────────────────────────────
// Yahoo gates /v10/finance/quoteSummary behind a session crumb. We fetch it once,
// hold it module-scope, and refresh on 401.

export type YahooQuote = {
  marketCap: number | null;
  price: number | null;
  changePercent: number | null;
  longName: string | null;
  shortName: string | null;
  sector: string | null;
  marketState: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChangePercent: number | null;
  shortPercentFloat: number | null;
  shortRatio: number | null;
};

let yahooCrumb: string | null = null;
let yahooCookies: string | null = null;
let yahooCrumbRefresh: Promise<void> | null = null;

const YF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function refreshYahooCrumb(): Promise<void> {
  if (yahooCrumbRefresh) return yahooCrumbRefresh;
  yahooCrumbRefresh = (async () => {
    await refreshYahooCrumbInner();
  })().finally(() => { yahooCrumbRefresh = null; });
  return yahooCrumbRefresh;
}

async function refreshYahooCrumbInner(): Promise<void> {
  // Step 1: hit fc.yahoo.com to get A1/A3 cookies.
  const cookieResp = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YF_UA },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  });
  const setCookie = cookieResp.headers.get("set-cookie") ?? "";
  yahooCookies = setCookie
    .split(/,(?=\s*[A-Z0-9_-]+=)/)
    .map(c => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  // Step 2: get crumb.
  const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YF_UA, "Cookie": yahooCookies },
    signal: AbortSignal.timeout(10_000),
  });
  if (!crumbResp.ok) throw new Error(`Yahoo crumb fetch HTTP ${crumbResp.status}`);
  yahooCrumb = (await crumbResp.text()).trim();
  if (!yahooCrumb) throw new Error("Yahoo returned empty crumb");
}

export async function fetchYahooQuoteSummary(
  symbol: string,
  opts: { includeAssetProfile?: boolean; includeKeyStats?: boolean } = {},
): Promise<YahooQuote | null> {
  if (!yahooCrumb) await refreshYahooCrumb();
  // summaryDetail carries 52-week high/low; price has marketCap + dayHigh/Low
  // + pre/post-market fields; assetProfile carries sector + industry;
  // defaultKeyStatistics carries shortPercentOfFloat + shortRatio.
  let modules = opts.includeAssetProfile
      ? "price,summaryDetail,assetProfile"
      : "price,summaryDetail";
  if (opts.includeKeyStats) modules += ",defaultKeyStatistics";
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(yahooCrumb ?? "")}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { "User-Agent": YF_UA, "Cookie": yahooCookies ?? "" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return null;
    }
    if ((resp.status === 401 || resp.status === 403) && attempt < 2) {
      // Force a refresh on the next loop iteration. Concurrent callers share
      // the same refresh promise via the yahooCrumbRefresh mutex.
      yahooCrumb = null;
      await refreshYahooCrumb();
      continue;
    }
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
      continue;
    }
    if (!resp.ok) return null;
    const body = await resp.json() as any;
    const result = body?.quoteSummary?.result?.[0];
    const price = result?.price;
    const detail = result?.summaryDetail;
    const profile = result?.assetProfile;
    const keyStats = result?.defaultKeyStatistics;
    if (!price) return null;
    const rawNum = (v: any): number | null =>
      typeof v?.raw === "number" ? v.raw : null;
    return {
      marketCap: rawNum(price.marketCap),
      price: rawNum(price.regularMarketPrice),
      changePercent: rawNum(price.regularMarketChangePercent) != null
        ? rawNum(price.regularMarketChangePercent)! * 100
        : null,
      longName: typeof price.longName === "string" ? price.longName : null,
      shortName: typeof price.shortName === "string" ? price.shortName : null,
      sector: typeof profile?.sector === "string" ? profile.sector : null,
      marketState: typeof price.marketState === "string" ? price.marketState : null,
      dayHigh: rawNum(price.regularMarketDayHigh) ?? rawNum(detail?.regularMarketDayHigh) ?? rawNum(detail?.dayHigh),
      dayLow: rawNum(price.regularMarketDayLow) ?? rawNum(detail?.regularMarketDayLow) ?? rawNum(detail?.dayLow),
      fiftyTwoWeekHigh: rawNum(detail?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: rawNum(detail?.fiftyTwoWeekLow),
      preMarketPrice: rawNum(price.preMarketPrice),
      preMarketChangePercent: rawNum(price.preMarketChangePercent) != null
        ? rawNum(price.preMarketChangePercent)! * 100
        : null,
      postMarketPrice: rawNum(price.postMarketPrice),
      postMarketChangePercent: rawNum(price.postMarketChangePercent) != null
        ? rawNum(price.postMarketChangePercent)! * 100
        : null,
      shortPercentFloat: rawNum(keyStats?.shortPercentOfFloat) != null
        ? rawNum(keyStats?.shortPercentOfFloat)! * 100
        : null,
      shortRatio: rawNum(keyStats?.shortRatio),
    };
  }
  return null;
}

async function fetchYahooQuoteSummaryBatch(
  symbols: string[],
  opts: { includeAssetProfile?: boolean } = {},
): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  // Fan out with bounded concurrency. Yahoo tolerates ~10 concurrent for an
  // authenticated client; matches the existing yfLimiter convention.
  const CONCURRENCY = 10;
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const my = idx++;
      const sym = symbols[my];
      try {
        const q = await fetchYahooQuoteSummary(sym, opts);
        if (q) out.set(sym, q);
      } catch {
        // swallow — best-effort batch.
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}
