/**
 * server/trading.ts
 * AI Trading Signals module — integrated into Monysa Express backend.
 *
 * Endpoints (all prefixed /api/trading/):
 *   GET  /quotes              — live prices for all 39 assets (refreshed every 20 s)
 *   GET  /signals/:symbol     — BUY/HOLD/SELL signal with confidence, Entry/SL/TP, indicators
 *   GET  /history/:symbol     — OHLCV candles for 5 timeframes
 *   GET  /backtest/:symbol    — walk-forward backtest results across 3 strategies
 *   GET  /news/:symbol        — up to 8 headlines with per-article + aggregate sentiment
 */

import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import { adminFirestore } from "./lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import pLimit from "p-limit";
import { yahooProvider } from "./providers";
import { devicePlanMap, getDevicePlan, isPro } from "./plan-enforcement";
import { fetchSp500Constituents, fetchYahooQuoteSummary, fetchYahooQuoteSummaryBatch } from "./routes/heatmap";
import { fetchInsiderClusters, KNOWN_NAMES } from "./routes/quiver";
import { fetchBatch } from "./routes/shared";
import { isLeader } from "./lib/leader";
import {
  CORRELATION_FIXED_ASSETS,
  CORRELATION_STOCK_POOLS,
  type CorrelationAsset,
} from "./data/correlation_universe";
import {
  getSectorQuadrants,
  GICS_TO_ETF_SECTOR,
  SECTOR_ETFS,
  type RrgQuadrant,
} from "./routes/economy";

// Single source of truth for symbol validation across all routes.
// Character set covers Yahoo Finance (= ^ . - _), TradingView/Polygon (:),
// and Quandl/FRED (/). Widen this regex when adding a new chart provider
// whose symbols use characters outside [A-Z0-9=^._:\/-].
const symbolSchema = z.string().regex(/^[A-Z0-9=^._:\/-]{1,20}$/i, "Invalid symbol format.");

// ─── External API Response Types ─────────────────────────────────────────────

interface YFChartMeta {
  regularMarketPrice: number;
  chartPreviousClose?: number;
  previousClose?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
}

interface YFChartQuote {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YFChartResult {
  meta: YFChartMeta;
  timestamp: number[];
  indicators: { quote: YFChartQuote[] };
}

interface YFChartResponse {
  chart: { result: YFChartResult[] | null; error: unknown };
}

interface YFNewsItem {
  title?: string;
  publisher?: string;
  providerPublishTime?: number;
  link?: string;
  summary?: string;
}

interface YFSearchResponse {
  news?: YFNewsItem[];
}

interface AVTickerSentiment {
  ticker: string;
  relevance_score: string;
  ticker_sentiment_score: string;
  ticker_sentiment_label: string;
}

interface AVArticle {
  title: string;
  url: string;
  time_published: string;
  source: string;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment: AVTickerSentiment[];
}

interface AVNewsResponse {
  feed?: AVArticle[];
  items?: string;
}

interface FinnhubTrade {
  p: number;
  s: string;
  t: number;
  v: number;
}

interface FinnhubMessage {
  type: string;
  data?: FinnhubTrade[];
}

interface WsLike {
  on(event: "open",    listener: () => void): void;
  on(event: "message", listener: (data: Buffer) => void): void;
  on(event: "error",   listener: (err: Error) => void): void;
  on(event: "close",   listener: () => void): void;
  send(data: string): void;
}

// ─── Asset Catalogue ─────────────────────────────────────────────────────────

export interface TradingAsset {
  symbol: string;
  name: string;
  category: "Commodities" | "Indices" | "Crypto" | "Forex";
  flag: string;
  currency: string;
  finnhubSymbol?: string;
}

export const TRADING_ASSETS: TradingAsset[] = [
  // Commodities (14)
  { symbol: "GC=F",    name: "Gold",            category: "Commodities", flag: "🥇", currency: "USD" },
  { symbol: "SI=F",    name: "Silver",           category: "Commodities", flag: "⚪", currency: "USD" },
  { symbol: "CL=F",    name: "Crude Oil (WTI)",  category: "Commodities", flag: "🛢️", currency: "USD" },
  { symbol: "BZ=F",    name: "Brent Crude",      category: "Commodities", flag: "🛢️", currency: "USD" },
  { symbol: "NG=F",    name: "Natural Gas",      category: "Commodities", flag: "🔥", currency: "USD" },
  { symbol: "HG=F",    name: "Copper",           category: "Commodities", flag: "🔶", currency: "USD" },
  { symbol: "PL=F",    name: "Platinum",         category: "Commodities", flag: "⬜", currency: "USD" },
  { symbol: "PA=F",    name: "Palladium",        category: "Commodities", flag: "🔷", currency: "USD" },
  { symbol: "ZW=F",    name: "Wheat",            category: "Commodities", flag: "🌾", currency: "USD" },
  { symbol: "ZC=F",    name: "Corn",             category: "Commodities", flag: "🌽", currency: "USD" },
  { symbol: "ZS=F",    name: "Soybeans",         category: "Commodities", flag: "🫘", currency: "USD" },
  { symbol: "SB=F",    name: "Sugar",            category: "Commodities", flag: "🍬", currency: "USD" },
  { symbol: "KC=F",    name: "Coffee",           category: "Commodities", flag: "☕", currency: "USD" },
  { symbol: "CT=F",    name: "Cotton",           category: "Commodities", flag: "🌿", currency: "USD" },

  // Indices (15)
  { symbol: "^GSPC",    name: "S&P 500",          category: "Indices", flag: "🇺🇸", currency: "USD" },
  { symbol: "^DJI",     name: "Dow Jones",        category: "Indices", flag: "🇺🇸", currency: "USD" },
  { symbol: "^IXIC",    name: "NASDAQ",           category: "Indices", flag: "🇺🇸", currency: "USD" },
  { symbol: "^RUT",     name: "Russell 2000",     category: "Indices", flag: "🇺🇸", currency: "USD" },
  { symbol: "^FTSE",    name: "FTSE 100",         category: "Indices", flag: "🇬🇧", currency: "GBP" },
  { symbol: "^GDAXI",   name: "DAX",              category: "Indices", flag: "🇩🇪", currency: "EUR" },
  { symbol: "^FCHI",    name: "CAC 40",           category: "Indices", flag: "🇫🇷", currency: "EUR" },
  { symbol: "^N225",    name: "Nikkei 225",       category: "Indices", flag: "🇯🇵", currency: "JPY" },
  { symbol: "^HSI",     name: "Hang Seng",        category: "Indices", flag: "🇭🇰", currency: "HKD" },
  { symbol: "^AXJO",    name: "ASX 200",          category: "Indices", flag: "🇦🇺", currency: "AUD" },
  { symbol: "^NSEI",    name: "Nifty 50",         category: "Indices", flag: "🇮🇳", currency: "INR" },
  { symbol: "^BVSP",    name: "Bovespa",          category: "Indices", flag: "🇧🇷", currency: "BRL" },
  { symbol: "^MXX",     name: "IPC Mexico",       category: "Indices", flag: "🇲🇽", currency: "MXN" },
  { symbol: "^VIX",     name: "VIX (Fear Index)", category: "Indices", flag: "😨", currency: "USD" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index",  category: "Indices", flag: "💵", currency: "USD" },

  // Crypto (10)
  { symbol: "BTC-USD",  name: "Bitcoin",    category: "Crypto", flag: "₿", currency: "USD", finnhubSymbol: "BINANCE:BTCUSDT" },
  { symbol: "ETH-USD",  name: "Ethereum",   category: "Crypto", flag: "Ξ", currency: "USD", finnhubSymbol: "BINANCE:ETHUSDT" },
  { symbol: "BNB-USD",  name: "BNB",        category: "Crypto", flag: "🟡", currency: "USD", finnhubSymbol: "BINANCE:BNBUSDT" },
  { symbol: "SOL-USD",  name: "Solana",     category: "Crypto", flag: "◎", currency: "USD", finnhubSymbol: "BINANCE:SOLUSDT" },
  { symbol: "XRP-USD",  name: "XRP",        category: "Crypto", flag: "✕", currency: "USD", finnhubSymbol: "BINANCE:XRPUSDT" },
  { symbol: "ADA-USD",  name: "Cardano",    category: "Crypto", flag: "₳", currency: "USD", finnhubSymbol: "BINANCE:ADAUSDT" },
  { symbol: "AVAX-USD", name: "Avalanche",  category: "Crypto", flag: "🔺", currency: "USD", finnhubSymbol: "BINANCE:AVAXUSDT" },
  { symbol: "DOT-USD",  name: "Polkadot",   category: "Crypto", flag: "⬤", currency: "USD", finnhubSymbol: "BINANCE:DOTUSDT" },
  { symbol: "LINK-USD", name: "Chainlink",  category: "Crypto", flag: "🔗", currency: "USD", finnhubSymbol: "BINANCE:LINKUSDT" },
  { symbol: "DOGE-USD", name: "Dogecoin",   category: "Crypto", flag: "🐕", currency: "USD", finnhubSymbol: "BINANCE:DOGEUSDT" },

  // Forex majors (10)
  { symbol: "EURUSD=X", name: "EUR/USD", category: "Forex", flag: "🇪🇺", currency: "USD" },
  { symbol: "GBPUSD=X", name: "GBP/USD", category: "Forex", flag: "🇬🇧", currency: "USD" },
  { symbol: "USDJPY=X", name: "USD/JPY", category: "Forex", flag: "🇯🇵", currency: "JPY" },
  { symbol: "USDCHF=X", name: "USD/CHF", category: "Forex", flag: "🇨🇭", currency: "CHF" },
  { symbol: "AUDUSD=X", name: "AUD/USD", category: "Forex", flag: "🇦🇺", currency: "USD" },
  { symbol: "USDCAD=X", name: "USD/CAD", category: "Forex", flag: "🇨🇦", currency: "CAD" },
  { symbol: "NZDUSD=X", name: "NZD/USD", category: "Forex", flag: "🇳🇿", currency: "USD" },
  { symbol: "EURGBP=X", name: "EUR/GBP", category: "Forex", flag: "🇪🇺", currency: "GBP" },
  { symbol: "EURJPY=X", name: "EUR/JPY", category: "Forex", flag: "🇪🇺", currency: "JPY" },
  { symbol: "GBPJPY=X", name: "GBP/JPY", category: "Forex", flag: "🇬🇧", currency: "JPY" },
];

const ASSET_MAP = new Map(TRADING_ASSETS.map(a => [a.symbol, a]));

// ─── In-Memory Price Store ────────────────────────────────────────────────────

interface PriceEntry {
  price: number;
  change: number;
  changePercent: number;
  updatedAt: number;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
}

// Bounded to TRADING_ASSETS.length (39 symbols) — no eviction needed.
export const latestPrices = new Map<string, PriceEntry>();

let _lastPollAt: number | null = null;
let _finnhubConnected = false;

export function getHealthStatus() {
  return {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    lastPollAt: _lastPollAt ? new Date(_lastPollAt).toISOString() : null,
    finnhubConnected: _finnhubConnected,
    openaiConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    alphaVantageConfigured: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
  };
}

// ─── Yahoo Finance Helpers ────────────────────────────────────────────────────

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
};

// Shared concurrency limiter — prevents burst overload of Yahoo Finance.
const _yfLimiter = pLimit(10);
const _yfInFlight = new Map<string, Promise<unknown>>();

async function yfFetch<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const existing = _yfInFlight.get(url);
  if (existing) return existing as Promise<T>;

  const promise = _yfLimiter(async () => {
    const MAX_RETRIES = 3;
    let delay = 1_000;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * 2, 30_000);
          continue;
        }
        throw new Error(`YF rate limited after ${MAX_RETRIES} retries: ${url}`);
      }
      if (!res.ok) throw new Error(`YF fetch failed: ${res.status} ${url}`);
      return res.json() as T;
    }
  }).finally(() => _yfInFlight.delete(url));

  _yfInFlight.set(url, promise as Promise<unknown>);
  return promise as Promise<T>;
}

// ─── Yahoo Finance Crumb Management (for quoteSummary) ────────────────────────

const YF_CRUMB_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const YF_CRUMB_TTL = 2 * 60 * 60_000; // 2 hours

let _yfCrumb: string | null = null;
let _yfCookie: string | null = null;
let _yfCrumbTs = 0;
let _yfCrumbPending: Promise<{ crumb: string; cookie: string } | null> | null = null;
let _yfCrumbBackoffUntil = 0;
// Track consecutive crumb failures to scale backoff. A flat 15min on the first
// 429 was too punitive post-deploy: a single transient Yahoo blip wiped out
// quote freshness for a quarter hour. Now we escalate: 60s → 5m → 15m → 30m.
let _yfCrumbConsecutiveFails = 0;
const YF_CRUMB_BACKOFFS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

// fc.yahoo.com seeds the A1/A3 auth cookies needed for the crumb endpoint without
// going through finance.yahoo.com/quote's redirect chain. That chain now terminates
// in a GDPR consent interstitial (guce.yahoo.com → consent.yahoo.com/v2/collectConsent,
// HTTP 200) that never redirects back, so the old approach collected only decorative
// cookies (dflow/GUCS/OTHD) and the crumb endpoint always 429'd. Mirrors the working
// approach in server/routes/heatmap.ts's refreshYahooCrumbInner().
async function fetchYFCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": YF_CRUMB_UA },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "")
      .split(/,(?=\s*[A-Z0-9_-]+=)/)
      .map(c => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    if (!cookie) {
      console.warn("[YFCrumb] No cookies from fc.yahoo.com, status:", cookieRes.status);
      return null;
    }

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YF_CRUMB_UA, "Cookie": cookie },
      signal: AbortSignal.timeout(10_000),
    });
    if (!crumbRes.ok) {
      console.warn("[YFCrumb] Crumb fetch failed:", crumbRes.status);
      return null;
    }
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("{") || crumb.length > 20) {
      console.warn("[YFCrumb] Unexpected crumb response:", crumb.slice(0, 60));
      return null;
    }
    console.log("[YFCrumb] OK — crumb len:", crumb.length);
    return { crumb, cookie };
  } catch (err) {
    console.warn("[YFCrumb] Exception:", err);
    return null;
  }
}

async function getYFCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_yfCrumb && _yfCookie && Date.now() - _yfCrumbTs < YF_CRUMB_TTL) {
    return { crumb: _yfCrumb, cookie: _yfCookie };
  }
  // Don't hammer Yahoo while in backoff after a failed fetch
  if (Date.now() < _yfCrumbBackoffUntil) return null;
  // Deduplicate concurrent crumb fetches — only one flight at a time
  if (_yfCrumbPending) return _yfCrumbPending;
  _yfCrumbPending = fetchYFCrumb().then(result => {
    _yfCrumbPending = null;
    if (result) {
      _yfCrumb = result.crumb;
      _yfCookie = result.cookie;
      _yfCrumbTs = Date.now();
      _yfCrumbConsecutiveFails = 0;
    } else {
      // Escalate backoff per consecutive failure: 60s → 5m → 15m → 30m. A flat
      // 15min on the first 429 was too punitive — a transient Yahoo blip would
      // wipe out quote freshness for a quarter hour post-deploy.
      const idx = Math.min(_yfCrumbConsecutiveFails, YF_CRUMB_BACKOFFS_MS.length - 1);
      const backoffMs = YF_CRUMB_BACKOFFS_MS[idx];
      _yfCrumbBackoffUntil = Date.now() + backoffMs;
      _yfCrumbConsecutiveFails++;
      console.warn(`[YFCrumb] backoff ${Math.round(backoffMs / 1000)}s (consecutive fails: ${_yfCrumbConsecutiveFails})`);
    }
    return result;
  });
  return _yfCrumbPending;
}

interface YFEarningsHistoryItem {
  epsActual?: number;
  quarter?: number;
}

interface YFQuoteSummaryResponse {
  quoteSummary: {
    result: Array<{
      earningsHistory?: { history: YFEarningsHistoryItem[] };
    }> | null;
    error: unknown;
  };
}

async function fetchYFEarningsHistory(symbol: string): Promise<number[]> {
  const auth = await getYFCrumb();
  if (!auth) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earningsHistory&formatted=false&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": YF_CRUMB_UA, "Cookie": auth.cookie, "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (res.status === 401) { _yfCrumb = null; _yfCookie = null; }
      return [];
    }
    const data = await res.json() as YFQuoteSummaryResponse;
    const history = data?.quoteSummary?.result?.[0]?.earningsHistory?.history ?? [];
    return [...history]
      .filter(h => h.epsActual != null)
      .sort((a, b) => (b.quarter ?? 0) - (a.quarter ?? 0))
      .slice(0, 4)
      .map(h => h.epsActual!);
  } catch {
    return [];
  }
}

// ─── Twelve Data EPS (international stocks) ──────────────────────────────────

// Yahoo Finance suffix → Twelve Data exchange code
const YF_TO_TWLV: Record<string, string> = {
  NS: "NSE",   BO: "BSE",   L:  "LSE",   HK: "HKEX",
  SS: "SSE",   SZ: "SZSE",  PA: "XPAR",  AS: "XAMS",
  DE: "XETR",  MI: "MIL",   BR: "XBRU",  LS: "ENXTLS",
  T:  "TSE",   KS: "KRX",   AX: "ASX",   TO: "TSX",
  SW: "SIX",   MC: "BME",
};

interface TwelveDataEarningsItem {
  date: string;
  eps_actual: number | null;
}

async function fetchTwelveDataEarnings(symbol: string): Promise<number[]> {
  if (!TWELVE_DATA_KEY) return [];
  const dot = symbol.lastIndexOf(".");
  if (dot < 0) return []; // US stocks handled by Finnhub
  const base = symbol.slice(0, dot);
  const exchange = YF_TO_TWLV[symbol.slice(dot + 1).toUpperCase()];
  if (!exchange) return [];

  try {
    const url = `https://api.twelvedata.com/earnings?symbol=${encodeURIComponent(base)}&exchange=${encodeURIComponent(exchange)}&outputsize=8&apikey=${TWELVE_DATA_KEY}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "markets-api/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    // 429 = rate-limited: don't cache so the next scan run retries
    if (!res.ok) return [];
    const data = await res.json() as { earnings?: TwelveDataEarningsItem[]; status?: string; code?: number };
    if (data.status === "error" || data.code === 429) return [];
    const earnings = data.earnings ?? [];
    return earnings
      .filter(e => e.eps_actual != null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map(e => e.eps_actual!);
  } catch {
    return [];
  }
}

async function fetchCurrentPrice(symbol: string): Promise<PriceEntry | null> {
  try {
    const d = await yahooProvider.fetchCurrentPrice(symbol);
    if (!d || d.price == null) return null;
    return {
      price: d.price,
      change: d.change ?? 0,
      changePercent: d.changePercent ?? 0,
      updatedAt: Date.now(),
      preMarketPrice: d.preMarketPrice ?? null,
      preMarketChangePercent: d.preMarketChangePercent ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Price Polling Loop ───────────────────────────────────────────────────────

async function pollAllPrices() {
  const symbols = TRADING_ASSETS.map(a => a.symbol);
  const BATCH = 10;
  let nullCount = 0;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(s => fetchCurrentPrice(s)));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value) {
        latestPrices.set(batch[idx], r.value);
      } else {
        nullCount++;
      }
    });
  }
  _lastPollAt = Date.now();
  // Back-pressure: if >20% of symbols failed (likely rate-limited), skip next cycle.
  if (nullCount / symbols.length > 0.2) {
    console.warn(`[poll] ${nullCount}/${symbols.length} price fetches failed — skipping next cycle`);
    _skipNextPoll = true;
  }
}

let _skipNextPoll = false;

// Boot: immediate poll, then every 20 s (halves Yahoo Finance polling load vs. 10 s).
pollAllPrices().catch(() => {});
setInterval(() => {
  if (_skipNextPoll) { _skipNextPoll = false; return; }
  pollAllPrices().catch(() => {});
}, 20_000);

// ─── Optional Finnhub WebSocket for Crypto ───────────────────────────────────

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? null;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY ?? null;

// Free tier supports ~5 concurrent subscriptions; limit to highest-liquidity crypto.
const FINNHUB_SYMBOLS = ["BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD"];

function startFinnhubWebSocket() {
  if (!FINNHUB_KEY) return;

  let reconnectDelay = 15_000;
  let gotTrade = false;

  const cryptoAssets = TRADING_ASSETS.filter(
    a => a.finnhubSymbol && FINNHUB_SYMBOLS.includes(a.symbol),
  );

  const connect = () => {
    gotTrade = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WsConstructor = require("ws") as new (url: string) => WsLike;
      const ws = new WsConstructor(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

      ws.on("open", () => {
        // Stagger subscribes 200 ms apart to avoid triggering Finnhub's burst limit.
        cryptoAssets.forEach((asset, i) => {
          setTimeout(
            () => ws.send(JSON.stringify({ type: "subscribe", symbol: asset.finnhubSymbol })),
            i * 200,
          );
        });
        console.log("[Finnhub WS] Connected — subscribing to", cryptoAssets.length, "crypto streams");
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as FinnhubMessage;
          if (msg.type === "trade" && Array.isArray(msg.data)) {
            if (!gotTrade) {
              gotTrade = true;
              _finnhubConnected = true;
              reconnectDelay = 15_000; // reset backoff only after confirmed data
            }
            for (const trade of msg.data) {
              const asset = TRADING_ASSETS.find(a => a.finnhubSymbol === trade.s);
              if (asset && trade.p) {
                const existing = latestPrices.get(asset.symbol);
                const prevPrice = existing?.price ?? trade.p;
                const change = trade.p - prevPrice;
                const changePercent = prevPrice !== 0 ? (change / prevPrice) * 100 : 0;
                latestPrices.set(asset.symbol, {
                  price: trade.p,
                  change,
                  changePercent,
                  updatedAt: Date.now(),
                  preMarketPrice: existing?.preMarketPrice ?? null,
                  preMarketChangePercent: existing?.preMarketChangePercent ?? null,
                });
              }
            }
          }
        } catch {}
      });

      ws.on("error", (err: Error) => {
        console.warn("[Finnhub WS] Error:", err.message);
      });

      ws.on("close", () => {
        _finnhubConnected = false;
        console.warn(`[Finnhub WS] Disconnected — reconnecting in ${reconnectDelay}ms`);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 120_000);
      });
    } catch (err) {
      console.warn("[Finnhub WS] Could not start:", err);
    }
  };

  connect();
}

// Defer Finnhub WS startup until leader election settles (5s gives the Redis
// lease acquisition time to resolve). Free-tier Finnhub rejects the 2nd
// concurrent connection with a 429, so only the leader should hold it; the
// quote poll in `pollAllPrices` keeps crypto reasonably fresh for followers.
setTimeout(() => {
  if (!isLeader()) {
    console.log("[Finnhub WS] skipping connect — follower");
    return;
  }
  startFinnhubWebSocket();
}, 5_000);

// ─── Technical Indicator Pipeline ────────────────────────────────────────────

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  ema9: number | null;
  ema12: number | null;
  ema26: number | null;
  ema50: number | null;
  ema200: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  atr: number | null;
  roc: number | null;
  adx: number | null;
  bbWidth: number | null;
}

function calcEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = new Array(values.length - period + 1);

  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[0] = sum / period;

  for (let i = period; i < values.length; i++) {
    result[i - period + 1] = values[i] * k + result[i - period] * (1 - k);
  }
  return result;
}

function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map(d => (d > 0 ? d : 0));
  const losses = changes.map(d => (d < 0 ? -d : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function calcBollinger(closes: number[], period = 20): { upper: number; mid: number; lower: number } | null {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const mid = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  return { upper: mid + 2 * stddev, mid, lower: mid - 2 * stddev };
}

function calcAtr(ohlcvs: OHLCV[], period = 14): number | null {
  if (ohlcvs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < ohlcvs.length; i++) {
    const { high, low } = ohlcvs[i];
    const prevClose = ohlcvs[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const emas = calcEma(trs, period);
  return emas.length > 0 ? Math.round(emas[emas.length - 1] * 10000) / 10000 : null;
}

function calcRoc(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  return past !== 0 ? Math.round(((current - past) / past) * 10000) / 100 : null;
}

function calcAdx(ohlcvs: OHLCV[], period = 14): number | null {
  if (ohlcvs.length < 2 * period + 1) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < ohlcvs.length; i++) {
    const curr = ohlcvs[i];
    const prev = ohlcvs[i - 1];
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
  }
  const smoothTR = calcEma(trs, period);
  const smoothPlusDM = calcEma(plusDM, period);
  const smoothMinusDM = calcEma(minusDM, period);
  const len = Math.min(smoothTR.length, smoothPlusDM.length, smoothMinusDM.length);
  if (len === 0) return null;
  const dxValues: number[] = [];
  for (let i = 0; i < len; i++) {
    const tr = smoothTR[i];
    if (tr === 0) { dxValues.push(0); continue; }
    const plusDI = (smoothPlusDM[i] / tr) * 100;
    const minusDI = (smoothMinusDM[i] / tr) * 100;
    const sum = plusDI + minusDI;
    dxValues.push(sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0);
  }
  const adxArr = calcEma(dxValues, period);
  return adxArr.length > 0 ? Math.round(adxArr[adxArr.length - 1] * 100) / 100 : null;
}

// Evicts the oldest entry (insertion order) when the cap is reached.
class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) { super(); }
  override set(k: K, v: V): this {
    if (this.size >= this.max) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) this.delete(oldest);
    }
    return super.set(k, v);
  }
}

// Keyed by a per-series fingerprint. The timestamp alone is NOT unique:
// every US stock shares the same last daily-candle timestamp, so a
// timestamp-only key serves symbol A's OBV array to symbol B.
const _obvCache = new BoundedMap<string, number[]>(200);

function _buildObvArr(candles: OHLCV[]): number[] {
  const last = candles[candles.length - 1];
  const key = `${last.time}:${candles.length}:${last.close}:${last.volume}`;
  const hit = _obvCache.get(key);
  if (hit) return hit;
  let obv = 0;
  const arr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    arr.push(obv);
  }
  _obvCache.set(key, arr);
  return arr;
}

function calcObvSlope(candles: OHLCV[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const obvArr = _buildObvArr(candles);
  if (obvArr.length < period) return null;
  return obvArr[obvArr.length - 1] - obvArr[obvArr.length - period];
}

function calcVolumeSma(candles: OHLCV[], period = 20): number | null {
  if (candles.length < period) return null;
  const vols = candles.slice(-period).map(c => c.volume);
  return vols.reduce((a, b) => a + b, 0) / period;
}

function calculateIndicators(candles: OHLCV[]): Indicators {
  const closes = candles.map(c => c.close);

  const ema9Arr  = calcEma(closes, 9);
  const ema12Arr = calcEma(closes, 12);
  const ema26Arr = calcEma(closes, 26);
  const ema50Arr = calcEma(closes, 50);
  const ema200Arr = calcEma(closes, 200);

  const ema9  = ema9Arr.length  > 0 ? ema9Arr[ema9Arr.length   - 1] : null;
  const ema12 = ema12Arr.length > 0 ? ema12Arr[ema12Arr.length - 1] : null;
  const ema26 = ema26Arr.length > 0 ? ema26Arr[ema26Arr.length - 1] : null;
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : null;
  const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : null;

  // MACD: EMA12 - EMA26 series aligned
  let macd: number | null = null;
  let macdSignal: number | null = null;
  let macdHistogram: number | null = null;
  if (ema12Arr.length > 0 && ema26Arr.length > 0) {
    const macdOffset = ema12Arr.length - ema26Arr.length;
    const macdSeries = ema26Arr.map((v, i) => ema12Arr[i + macdOffset] - v);
    macd = macdSeries[macdSeries.length - 1];
    const signalArr = calcEma(macdSeries, 9);
    macdSignal = signalArr.length > 0 ? signalArr[signalArr.length - 1] : null;
    macdHistogram = macd !== null && macdSignal !== null ? macd - macdSignal : null;
  }

  const bb = calcBollinger(closes);
  const rsi = calcRsi(closes);
  const atr = calcAtr(candles);
  const roc = calcRoc(closes);
  const adx = calcAdx(candles);
  const bbWidth = bb && bb.mid !== 0 ? Math.round(((bb.upper - bb.lower) / bb.mid) * 10000) / 10000 : null;

  return {
    rsi,
    macd: macd !== null ? Math.round(macd * 10000) / 10000 : null,
    macdSignal: macdSignal !== null ? Math.round(macdSignal * 10000) / 10000 : null,
    macdHistogram: macdHistogram !== null ? Math.round(macdHistogram * 10000) / 10000 : null,
    ema9:  ema9  !== null ? Math.round(ema9  * 10000) / 10000 : null,
    ema12: ema12 !== null ? Math.round(ema12 * 100) / 100 : null,
    ema26: ema26 !== null ? Math.round(ema26 * 100) / 100 : null,
    ema50: ema50 !== null ? Math.round(ema50 * 100) / 100 : null,
    ema200: ema200 !== null ? Math.round(ema200 * 100) / 100 : null,
    bbUpper: bb ? Math.round(bb.upper * 100) / 100 : null,
    bbMid: bb ? Math.round(bb.mid * 100) / 100 : null,
    bbLower: bb ? Math.round(bb.lower * 100) / 100 : null,
    atr,
    roc,
    adx,
    bbWidth,
  };
}

// ─── History Fetching ─────────────────────────────────────────────────────────

type Timeframe = "1m" | "5m" | "1h" | "4h" | "1d" | "1w";

const TF_PARAMS: Record<Timeframe, { interval: string; range: string }> = {
  "1m": { interval: "1m",  range: "1d"  },
  "5m": { interval: "5m",  range: "5d"  },
  "1h": { interval: "60m", range: "1mo" },
  "4h": { interval: "60m", range: "3mo" },
  "1d": { interval: "1d",  range: "1y"  },
  "1w": { interval: "1wk", range: "5y"  },
};

const historyCache = new Map<string, { data: OHLCV[]; ts: number }>();
const HISTORY_TTL = 5 * 60_000;

// Backtest-specific fetch params: extended ranges give 3–5× more candles than signal fetches.
// Separate cache so signal latency is unaffected.
const BACKTEST_TF_PARAMS: Record<Timeframe, { interval: string; range: string }> = {
  "1m": { interval: "1m",  range: "5d"  },
  "5m": { interval: "5m",  range: "1mo" },
  "1h": { interval: "60m", range: "6mo" },
  "4h": { interval: "60m", range: "6mo" },
  "1d": { interval: "1d",  range: "2y"  },
  "1w": { interval: "1wk", range: "5y"  },
};
const historyBtCache = new Map<string, { data: OHLCV[]; ts: number }>();
const HISTORY_BT_TTL = 30 * 60_000;

async function fetchHistoryBt(symbol: string, tf: Timeframe): Promise<OHLCV[]> {
  const cacheKey = `bt|${symbol}|${tf}`;
  const cached = historyBtCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_BT_TTL) return cached.data;

  const params = BACKTEST_TF_PARAMS[tf];
  try {
    let candles: OHLCV[] = (await yahooProvider.fetchHistoryCandles(symbol, params.interval, params.range)) as OHLCV[];
    if (tf === "4h") {
      const aggregated: OHLCV[] = [];
      for (let i = 0; i < candles.length; i += 4) {
        const group = candles.slice(i, i + 4);
        if (group.length === 0) continue;
        aggregated.push({
          time: group[0].time as number,
          open: group[0].open,
          high: Math.max(...group.map(c => c.high)),
          low: Math.min(...group.map(c => c.low)),
          close: group[group.length - 1].close,
          volume: group.reduce((s, c) => s + c.volume, 0),
        });
      }
      candles = aggregated;
    }
    historyBtCache.set(cacheKey, { data: candles, ts: Date.now() });
    return candles;
  } catch {
    return [];
  }
}

async function fetchHistory(symbol: string, tf: Timeframe): Promise<OHLCV[]> {
  const cacheKey = `${symbol}|${tf}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_TTL) return cached.data;

  const params = TF_PARAMS[tf];

  try {
    let candles: OHLCV[] = (await yahooProvider.fetchHistoryCandles(symbol, params.interval, params.range)) as OHLCV[];

    // Aggregate 1h bars into 4h bars
    if (tf === "4h") {
      const aggregated: OHLCV[] = [];
      for (let i = 0; i < candles.length; i += 4) {
        const group = candles.slice(i, i + 4);
        if (group.length === 0) continue;
        aggregated.push({
          time: group[0].time as number,
          open: group[0].open,
          high: Math.max(...group.map(c => c.high)),
          low: Math.min(...group.map(c => c.low)),
          close: group[group.length - 1].close,
          volume: group.reduce((s, c) => s + c.volume, 0),
        });
      }
      candles = aggregated;
    }

    historyCache.set(cacheKey, { data: candles, ts: Date.now() });
    return candles;
  } catch {
    return [];
  }
}

// ─── Signal Generation ────────────────────────────────────────────────────────

type SignalDirection = "BUY" | "HOLD" | "SELL";
type BaseStrategyId = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type EnhancedStrategyId = "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18";
type StrategyId = BaseStrategyId | EnhancedStrategyId;
type Regime5 = "quiet_trend" | "quiet_range" | "volatile_trend" | "chaotic";

export interface SignalResult {
  symbol: string;
  name: string;
  direction: SignalDirection;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  reasoning: string[];
  indicators: Indicators;
  strategy: StrategyId;
  timeframe: Timeframe;
  timestamp: string;
  quality?: number;
  apexRegime?: string;
  positionRiskPct?: number;
  htfAlignment?: string;
  tradeable?: boolean;
  ivPercentile?: number;
  vwap?: number | null;
  vwapDeviation?: number | null;
  vixAtSignal?: number | null;
  dynamicThreshold?: number | null;
}

const signalCache = new Map<string, { data: SignalResult; ts: number }>();
const SIGNAL_TTL = 30_000;

interface FundamentalsResult {
  symbol: string;
  sector: string | null;
  industry: string | null;
  quoteType: string | null;
  currency: string | null;
  week52High: number | null;
  week52Low: number | null;
  epsHistory: number[];
  epsApplicable: boolean;
}
const _fundCache = new Map<string, { data: FundamentalsResult; ts: number }>();
const FUND_TTL = 4 * 60 * 60 * 1000;

/**
 * Returns a composite score in [-1, +1].
 * Positive → bullish, negative → bearish.
 */
function scoreIndicators(ind: Indicators, currentPrice: number): { score: number; bullets: string[] } {
  let score = 0;
  const bullets: string[] = [];
  let factors = 0;

  if (ind.rsi !== null) {
    factors++;
    if (ind.rsi < 30) {
      score += 1;
      bullets.push(`RSI is oversold at ${ind.rsi.toFixed(1)} — potential reversal to the upside`);
    } else if (ind.rsi > 70) {
      score -= 1;
      bullets.push(`RSI is overbought at ${ind.rsi.toFixed(1)} — watch for a pullback`);
    } else if (ind.rsi < 45) {
      score -= 0.3;
      bullets.push(`RSI at ${ind.rsi.toFixed(1)} leans slightly bearish`);
    } else if (ind.rsi > 55) {
      score += 0.3;
      bullets.push(`RSI at ${ind.rsi.toFixed(1)} leans slightly bullish`);
    } else {
      bullets.push(`RSI at ${ind.rsi.toFixed(1)} is neutral`);
    }
  }

  if (ind.macdHistogram !== null) {
    factors++;
    if (ind.macdHistogram > 0) {
      score += 0.6;
      bullets.push("MACD histogram is positive — bullish momentum building");
    } else {
      score -= 0.6;
      bullets.push("MACD histogram is negative — bearish momentum present");
    }
  }

  if (ind.ema50 !== null) {
    factors++;
    if (currentPrice > ind.ema50) {
      score += 0.5;
      bullets.push(`Price (${currentPrice.toFixed(2)}) is above the 50-period EMA — uptrend intact`);
    } else {
      score -= 0.5;
      bullets.push(`Price (${currentPrice.toFixed(2)}) is below the 50-period EMA — downtrend pressure`);
    }
  }

  if (ind.ema200 !== null) {
    factors++;
    if (currentPrice > ind.ema200) {
      score += 0.8;
      bullets.push("Price is above the 200-period EMA — long-term trend is bullish");
    } else {
      score -= 0.8;
      bullets.push("Price is below the 200-period EMA — long-term trend is bearish");
    }
  }

  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
    factors++;
    const bbRange = ind.bbUpper - ind.bbLower;
    const posInBand = bbRange > 0 ? (currentPrice - ind.bbLower) / bbRange : 0.5;
    if (posInBand < 0.2) {
      score += 0.7;
      bullets.push("Price is near the lower Bollinger Band — oversold zone, rebound possible");
    } else if (posInBand > 0.8) {
      score -= 0.7;
      bullets.push("Price is near the upper Bollinger Band — overbought zone, resistance likely");
    } else {
      bullets.push(`Price is at ${(posInBand * 100).toFixed(0)}% of the Bollinger range`);
    }
  }

  if (ind.roc !== null) {
    factors++;
    if (ind.roc > 5) {
      score += 0.4;
      bullets.push(`Rate of Change is +${ind.roc.toFixed(1)}% — strong upward momentum`);
    } else if (ind.roc < -5) {
      score -= 0.4;
      bullets.push(`Rate of Change is ${ind.roc.toFixed(1)}% — strong downward momentum`);
    } else if (ind.roc > 0) {
      score += 0.1;
    } else {
      score -= 0.1;
    }
  }

  // Normalise by number of factors
  const normalised = factors > 0 ? Math.max(-1, Math.min(1, score / (factors * 0.7))) : 0;
  return { score: normalised, bullets };
}

/** S1: Pure technical score */
function strategyS1(ind: Indicators, price: number): { score: number; bullets: string[] } {
  return scoreIndicators(ind, price);
}

/** S2: Multi-factor — same as S1 but with volatility-adjusted weighting */
function strategyS2(ind: Indicators, price: number, atrPct: number): { score: number; bullets: string[] } {
  const { score, bullets } = scoreIndicators(ind, price);
  // High volatility dampens confidence; low volatility amplifies it
  const volAdj = atrPct > 3 ? 0.75 : atrPct > 1.5 ? 0.9 : 1.1;
  const extra = atrPct > 3
    ? ["High volatility detected — position sizing should be reduced"]
    : atrPct < 0.8
    ? ["Low volatility environment — signals are more reliable"]
    : [];
  return { score: score * volAdj, bullets: [...bullets, ...extra] };
}

/** S3: Hybrid — blends technical + news sentiment */
function strategyS3(
  techScore: number,
  newsSentiment: number,
  bullets: string[],
): { score: number; bullets: string[] } {
  const sentimentNorm = newsSentiment / 100; // -1..+1
  const blended = techScore * 0.65 + sentimentNorm * 0.35;
  const sentimentLabel =
    newsSentiment > 30
      ? "positive"
      : newsSentiment < -30
      ? "negative"
      : "neutral";
  // Always put the news bullet first so it survives truncation in generateSignal
  return {
    score: Math.max(-1, Math.min(1, blended)),
    bullets: [
      `News sentiment is ${sentimentLabel} (${newsSentiment > 0 ? "+" : ""}${newsSentiment}) — weighted into signal`,
      ...bullets,
    ],
  };
}

/** S4: Regime-Adaptive — detects Trending vs Ranging, then activates the appropriate engine */
function strategyS4(ind: Indicators, price: number, candles: OHLCV[]): { score: number; bullets: string[] } {
  const bullets: string[] = [];
  const adx = ind.adx;
  const bbWidth = ind.bbWidth;

  // ADX is the definitive regime signal. BB width is used as amplifier inside engines.
  const isTrending = adx !== null && adx > 25;
  const isRanging = adx !== null && adx < 18;

  if (isTrending) {
    const bbCtx = bbWidth !== null ? (bbWidth > 0.05 ? ", BB expanding" : bbWidth < 0.03 ? ", BB tight" : "") : "";
    bullets.push(`Trending regime (ADX ${adx!.toFixed(1)}${bbCtx}) — Trend Engine active`);
  } else if (isRanging) {
    const bbCtx = bbWidth !== null ? (bbWidth < 0.04 ? ", BB contracting" : "") : "";
    bullets.push(`Ranging regime (ADX ${adx!.toFixed(1)}${bbCtx}) — Mean Reversion Engine active`);
  } else {
    const adxStr = adx !== null ? adx.toFixed(1) : "N/A";
    bullets.push(`Neutral regime (ADX ${adxStr}) — balanced weighting applied`);
  }

  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volSma = calcVolumeSma(candles);
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  const obvSlope = calcObvSlope(candles);

  let score = 0;
  let totalWeight = 0;

  if (isTrending) {
    // ── TREND ENGINE (EMA200 1.2x · EMA50 0.8x · MACD 0.8x · Volume 1.0x · RSI 0.2x) ──
    if (ind.ema200 !== null) {
      totalWeight += 1.2;
      if (price > ind.ema200) { score += 1.2; bullets.push("Price above EMA200 — long-term uptrend intact"); }
      else { score -= 1.2; bullets.push("Price below EMA200 — long-term downtrend"); }
    }
    if (ind.ema50 !== null) {
      totalWeight += 0.8;
      if (price > ind.ema50) { score += 0.8; bullets.push("Price above EMA50 — medium-term uptrend"); }
      else { score -= 0.8; bullets.push("Price below EMA50 — medium-term downtrend"); }
    }
    if (ind.macdHistogram !== null) {
      totalWeight += 0.8;
      if (ind.macdHistogram > 0) { score += 0.8; bullets.push("MACD histogram positive — bullish momentum building"); }
      else { score -= 0.8; bullets.push("MACD histogram negative — bearish momentum present"); }
    }
    // RSI > 60 = bullish continuation in a trend (not overbought)
    if (ind.rsi !== null) {
      totalWeight += 0.2;
      if (ind.rsi > 60) { score += 0.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — bullish momentum zone (trend continuation)`); }
      else if (ind.rsi < 40) { score -= 0.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — momentum weakening`); }
    }
    // Volume confirmation
    if (volSma !== null) {
      totalWeight += 1.0;
      if (volRatio > 1.2) {
        const volDir = score >= 0 ? 1.0 : -1.0;
        score += volDir;
        bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — strong participation confirms trend`);
      } else if (volRatio < 0.7) {
        score *= 0.7;
        totalWeight *= 0.7;
        bullets.push(`Low volume (${(volRatio * 100).toFixed(0)}% of avg) — weak participation, signal dampened`);
      } else if (obvSlope !== null && obvSlope > 0) {
        score += 0.3;
        bullets.push("OBV rising — smart money confirming trend direction");
      } else if (obvSlope !== null && obvSlope < 0) {
        score -= 0.3;
        bullets.push("OBV falling — divergence warning in trend");
      }
    }
  } else if (isRanging) {
    // ── MEAN REVERSION ENGINE (RSI 1.0x · BB 1.0x · ATR 0.8x · EMA200 0.3x · MACD 0.2x) ──
    if (ind.rsi !== null) {
      totalWeight += 1.0;
      if (ind.rsi < 30) { score += 1.0; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply oversold in range, rebound expected`); }
      else if (ind.rsi > 70) { score -= 1.0; bullets.push(`RSI ${ind.rsi.toFixed(1)} — overbought in range, reversal likely`); }
      else if (ind.rsi < 40) { score += 0.4; bullets.push(`RSI ${ind.rsi.toFixed(1)} — mildly oversold`); }
      else if (ind.rsi > 60) { score -= 0.4; bullets.push(`RSI ${ind.rsi.toFixed(1)} — mildly overbought`); }
    }
    if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
      totalWeight += 1.0;
      const bbRange = ind.bbUpper - ind.bbLower;
      const posInBand = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
      if (posInBand < 0.15) { score += 1.0; bullets.push("Price at lower Bollinger Band — strong rebound signal in range"); }
      else if (posInBand > 0.85) { score -= 1.0; bullets.push("Price at upper Bollinger Band — strong reversal signal in range"); }
      else if (posInBand < 0.3) { score += 0.4; bullets.push("Price near lower BB — mild oversold zone"); }
      else if (posInBand > 0.7) { score -= 0.4; bullets.push("Price near upper BB — mild overbought zone"); }
    }
    if (ind.atr !== null) {
      const atrPct = (ind.atr / price) * 100;
      if (atrPct < 0.8) {
        score *= 1.2;
        bullets.push(`ATR compression (${atrPct.toFixed(2)}%) — tight range, mean reversion signals reliable`);
      } else if (atrPct > 3) {
        score *= 0.6;
        bullets.push(`High ATR (${atrPct.toFixed(2)}%) — volatility spike, ranging signals weakened`);
      }
    }
    if (ind.ema200 !== null) { totalWeight += 0.3; score += price > ind.ema200 ? 0.3 : -0.3; }
    if (ind.macdHistogram !== null) { totalWeight += 0.2; score += ind.macdHistogram > 0 ? 0.2 : -0.2; }
  } else {
    // NEUTRAL — fall back to standard scoring with slight dampening
    const { score: baseScore, bullets: baseBullets } = scoreIndicators(ind, price);
    return { score: baseScore * 0.8, bullets: baseBullets };
  }

  const normalised = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;
  return { score: normalised, bullets: bullets.slice(0, 6) };
}

function scoreToSignal(score: number): SignalDirection {
  if (score > 0.25) return "BUY";
  if (score < -0.25) return "SELL";
  return "HOLD";
}

/** S4 uses a higher conviction threshold — fewer but higher-quality signals */
function scoreToSignalS4(score: number): SignalDirection {
  if (score > 0.55) return "BUY";
  if (score < -0.55) return "SELL";
  return "HOLD";
}

// ─── S5: Professional Systematic ─────────────────────────────────────────────

interface RegimeWeights5 {
  ema200: number; ema50: number; macd: number;
  rsi: number; bollinger: number; volume: number;
}

const REGIME_WEIGHTS_S5: Record<Regime5, RegimeWeights5> = {
  quiet_trend:    { ema200: 1.2, ema50: 0.8, macd: 0.8, rsi: 0.2, bollinger: 0.1, volume: 0.8 },
  quiet_range:    { ema200: 0.3, ema50: 0.2, macd: 0.2, rsi: 1.0, bollinger: 1.0, volume: 0.5 },
  volatile_trend: { ema200: 1.0, ema50: 0.8, macd: 0.5, rsi: 0.1, bollinger: 0.3, volume: 1.2 },
  chaotic:        { ema200: 0,   ema50: 0,   macd: 0,   rsi: 0,   bollinger: 0,   volume: 0   },
};

const REGIME_THRESHOLDS_S5: Record<Regime5, number> = {
  quiet_trend:    0.45,
  quiet_range:    0.60,
  volatile_trend: 0.65,
  chaotic:        999,  // always HOLD
};

function classifyRegimeS5(atrPct: number, adx: number | null): Regime5 {
  const trending = adx !== null && adx > 25;
  const ranging  = adx !== null && adx < 18;
  if (atrPct >= 2.5) return trending ? "volatile_trend" : "chaotic";
  // Low or mid volatility
  if (trending) return "quiet_trend";
  if (ranging)  return "quiet_range";
  return "quiet_range"; // default low-vol undefined to range
}

function calibrateConfidenceS5(absScore: number): number {
  if (absScore >= 0.8) return 85;
  if (absScore >= 0.65) return 78;
  if (absScore >= 0.5)  return 70;
  if (absScore >= 0.3)  return 60;
  return 52;
}

interface S5Result { score: number; bullets: string[]; threshold: number; regime: Regime5 }

function strategyS5(ind: Indicators, price: number, candles: OHLCV[]): S5Result {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const regime = classifyRegimeS5(atrPct, ind.adx);
  const threshold = REGIME_THRESHOLDS_S5[regime];
  const w = REGIME_WEIGHTS_S5[regime];
  const bullets: string[] = [];

  const regimeLabel: Record<Regime5, string> = {
    quiet_trend:    "Quiet Trend",
    quiet_range:    "Quiet Range",
    volatile_trend: "Volatile Trend",
    chaotic:        "Chaotic",
  };

  if (regime === "chaotic") {
    bullets.push(`Chaotic regime (ATR ${atrPct.toFixed(1)}%, ADX ${ind.adx?.toFixed(1) ?? "N/A"}) — no trade conditions`);
    return { score: 0, bullets, threshold, regime };
  }

  bullets.push(`${regimeLabel[regime]} (ATR ${atrPct.toFixed(1)}%, ADX ${ind.adx?.toFixed(1) ?? "N/A"}) — dynamic weights active`);

  let score = 0;
  let totalWeight = 0;
  let bullFactors = 0;
  let bearFactors = 0;
  let countedFactors = 0;

  // EMA200
  if (ind.ema200 !== null && w.ema200 > 0) {
    totalWeight += w.ema200; countedFactors++;
    if (price > ind.ema200) { score += w.ema200; bullFactors++; bullets.push("Price above EMA200 — long-term bullish bias"); }
    else                    { score -= w.ema200; bearFactors++; bullets.push("Price below EMA200 — long-term bearish bias"); }
  }

  // EMA50
  if (ind.ema50 !== null && w.ema50 > 0) {
    totalWeight += w.ema50; countedFactors++;
    if (price > ind.ema50) { score += w.ema50; bullFactors++; }
    else                   { score -= w.ema50; bearFactors++; }
  }

  // MACD
  if (ind.macdHistogram !== null && w.macd > 0) {
    totalWeight += w.macd; countedFactors++;
    if (ind.macdHistogram > 0) { score += w.macd; bullFactors++; bullets.push("MACD positive — bullish momentum confirmed"); }
    else                       { score -= w.macd; bearFactors++; bullets.push("MACD negative — bearish momentum confirmed"); }
  }

  // RSI — interpreted differently per regime
  if (ind.rsi !== null && w.rsi > 0) {
    totalWeight += w.rsi; countedFactors++;
    if (regime === "quiet_range") {
      if      (ind.rsi < 30) { score += w.rsi;       bullFactors++; bullets.push(`RSI ${ind.rsi.toFixed(1)} — oversold, range rebound signal`); }
      else if (ind.rsi > 70) { score -= w.rsi;       bearFactors++; bullets.push(`RSI ${ind.rsi.toFixed(1)} — overbought, range reversal signal`); }
      else if (ind.rsi < 45) { score += w.rsi * 0.3; }
      else if (ind.rsi > 55) { score -= w.rsi * 0.3; }
    } else {
      // Trend/breakout: momentum continuation
      if      (ind.rsi > 55) { score += w.rsi; bullFactors++; bullets.push(`RSI ${ind.rsi.toFixed(1)} — bullish momentum zone`); }
      else if (ind.rsi < 45) { score -= w.rsi; bearFactors++; bullets.push(`RSI ${ind.rsi.toFixed(1)} — bearish momentum zone`); }
    }
  }

  // Bollinger — position in band weighted by regime
  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null && w.bollinger > 0) {
    totalWeight += w.bollinger; countedFactors++;
    const bbRange = ind.bbUpper - ind.bbLower;
    const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
    if (regime === "quiet_range") {
      if      (pos < 0.15) { score += w.bollinger;       bullFactors++; bullets.push("At lower BB — oversold in range"); }
      else if (pos > 0.85) { score -= w.bollinger;       bearFactors++; bullets.push("At upper BB — overbought in range"); }
      else if (pos < 0.3)  { score += w.bollinger * 0.4; }
      else if (pos > 0.7)  { score -= w.bollinger * 0.4; }
    } else {
      // Trend: upper = bullish momentum, lower = pullback to buy
      if      (pos > 0.7)  { score += w.bollinger * 0.5; }
      else if (pos < 0.3)  { score -= w.bollinger * 0.5; }
    }
  }

  // Volume + OBV confirmation
  const volSma     = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio   = volSma && volSma > 0 ? currentVol / volSma : 1;
  const obvSlope   = calcObvSlope(candles);

  if (volSma !== null && w.volume > 0) {
    totalWeight += w.volume; countedFactors++;
    if (volRatio > 1.3) {
      const dir = score >= 0 ? w.volume : -w.volume;
      score += dir;
      if (dir > 0) bullFactors++; else bearFactors++;
      bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — strong participation confirms move`);
    } else if (regime === "volatile_trend" && volRatio < 1.3) {
      // Breakout without volume — penalise hard
      score *= 0.5;
      bullets.push("Breakout without volume — elevated failure risk, signal dampened");
    } else if (obvSlope !== null && obvSlope > 0) {
      score += w.volume * 0.4; bullFactors++;
      bullets.push("OBV rising — institutional accumulation detected");
    } else if (obvSlope !== null && obvSlope < 0) {
      score -= w.volume * 0.4; bearFactors++;
      bullets.push("OBV falling — institutional distribution detected");
    }
  }

  // ── Signal Consensus Gate ─────────────────────────────────────────────────
  // Require ≥60% of factors to agree; otherwise dampen the signal
  const consensusRatio = countedFactors > 0
    ? Math.max(bullFactors, bearFactors) / countedFactors
    : 0;
  const consensusMult = consensusRatio >= 0.6 ? 1.0 : consensusRatio >= 0.4 ? 0.55 : 0.25;
  if (consensusRatio < 0.6) {
    bullets.push(`Mixed signals (${(consensusRatio * 100).toFixed(0)}% consensus) — conviction reduced`);
  }

  // ── Quality Penalties ─────────────────────────────────────────────────────
  let qualityPenalty = 0;
  if (ind.ema200 !== null) {
    const stretch = Math.abs(price - ind.ema200) / ind.ema200 * 100;
    if (stretch > 8) {
      qualityPenalty += 0.15;
      bullets.push(`Price ${stretch.toFixed(1)}% from EMA200 — extended, exhaustion risk`);
    }
  }

  const raw = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;
  const adjusted = raw * consensusMult * (1 - qualityPenalty);

  return { score: adjusted, bullets: bullets.slice(0, 6), threshold, regime };
}

// ─── S6: Adaptive Hybrid ──────────────────────────────────────────────────────

const NEGATION_WORDS = new Set([
  "not", "no", "never", "neither", "nor", "barely", "hardly", "scarcely",
  "doesn't", "don't", "didn't", "won't", "wouldn't", "isn't", "aren't",
  "wasn't", "weren't", "hasn't", "haven't", "hadn't", "cannot", "can't",
]);

const SOURCE_CREDIBILITY: Record<string, number> = {
  "reuters":             1.00,
  "bloomberg":           1.00,
  "financial times":     0.95,
  "wall street journal": 0.95,
  "wsj":                 0.95,
  "cnbc":                0.85,
  "marketwatch":         0.85,
  "barrons":             0.85,
  "seeking alpha":       0.75,
  "benzinga":            0.70,
  "motley fool":         0.65,
  "yahoo finance":       0.65,
};

function getSourceCredibility(publisher: string): number {
  const lower = publisher.toLowerCase();
  for (const [key, score] of Object.entries(SOURCE_CREDIBILITY)) {
    if (lower.includes(key)) return score;
  }
  return 0.55;
}

interface EnhancedArticleScore { score: number; relevance: number }

function scoreArticleEnhanced(title: string, publisher: string, publishedAt: string): EnhancedArticleScore {
  const words = title.toLowerCase().split(/\s+/);
  let bullCount = 0;
  let bearCount = 0;
  let relevance = 0;

  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const negated = idx > 0 && NEGATION_WORDS.has(words[idx - 1]);

    for (const bw of BULLISH_WORDS) {
      if (word.startsWith(bw.split(" ")[0])) {
        relevance += 0.3;
        if (negated) bearCount += 0.7; else bullCount += 1;
        break;
      }
    }
    for (const bw of BEARISH_WORDS) {
      if (word.startsWith(bw.split(" ")[0])) {
        relevance += 0.3;
        if (negated) bullCount += 0.7; else bearCount += 1;
        break;
      }
    }
  }

  const net = bullCount - bearCount;
  const total = bullCount + bearCount;
  const rawScore = total > 0 ? net / total : 0;

  const hoursOld = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  const freshness = Math.exp(-hoursOld / 24);
  const credibility = getSourceCredibility(publisher);

  return { score: rawScore * freshness * credibility, relevance: Math.min(1, relevance) };
}

function aggregateSentimentV2(articles: NewsArticle[]): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const article of articles) {
    const { score, relevance } = scoreArticleEnhanced(article.title, article.publisher, article.publishedAt);
    if (relevance < 0.2) continue;
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000;
    const freshness = Math.exp(-hoursOld / 24);
    const credibility = getSourceCredibility(article.publisher);
    const weight = freshness * credibility * relevance;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0;
}

function calcRegimeWeightsS6(atrPct: number, adx: number | null): { techW: number; newsW: number } {
  if (atrPct > 5)                     return { techW: 0.90, newsW: 0.10 };
  if (adx !== null && adx > 30)       return { techW: 0.85, newsW: 0.15 };
  if (atrPct < 1)                     return { techW: 0.60, newsW: 0.40 };
  return                                     { techW: 0.70, newsW: 0.30 };
}

interface S6Result { score: number; bullets: string[] }

function strategyS6(ind: Indicators, price: number, candles: OHLCV[], articles: NewsArticle[]): S6Result {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const { techW, newsW } = calcRegimeWeightsS6(atrPct, ind.adx);

  const { score: techScore, bullets: techBullets } = strategyS2(ind, price, atrPct);

  const sentimentScore = aggregateSentimentV2(articles);

  const blended = Math.max(-1, Math.min(1, techW * techScore + newsW * sentimentScore));

  const bullets: string[] = [];

  const regimeDesc =
    atrPct > 5 ? "High-vol" :
    atrPct < 1 ? "Low-vol" :
    ind.adx !== null && ind.adx > 30 ? "Strong-trend" : "Neutral";

  bullets.push(`${regimeDesc} regime — tech ${(techW * 100).toFixed(0)}% / sentiment ${(newsW * 100).toFixed(0)}%`);
  for (const b of techBullets.slice(0, 3)) bullets.push(b);

  if (articles.length > 0) {
    const sentLabel = sentimentScore > 0.05 ? "bullish" : sentimentScore < -0.05 ? "bearish" : "neutral";
    bullets.push(`News sentiment ${sentLabel} (${articles.length} articles — freshness & credibility weighted)`);
  } else {
    bullets.push("No news data available — tech-only signal");
  }

  return { score: blended, bullets: bullets.slice(0, 6) };
}

// ─── S7: APEX — Adaptive Probabilistic EXecution ─────────────────────────────

type DivergenceType = "regular_bullish" | "regular_bearish" | "hidden_bullish" | "hidden_bearish" | "none";
type ApexRegime = "strong_trend" | "weak_trend" | "ranging" | "volatile_break" | "chaotic";

function calcVwap(candles: OHLCV[], period = 20): number | null {
  if (candles.length < period) return null;
  const window = candles.slice(-period);
  const sumTPV = window.reduce((s, c) => s + ((c.high + c.low + c.close) / 3) * c.volume, 0);
  const sumVol = window.reduce((s, c) => s + c.volume, 0);
  return sumVol > 0 ? Math.round((sumTPV / sumVol) * 10000) / 10000 : null;
}

// Intraday VWAP over all supplied bars (used for signal enrichment with 5m session bars).
function calcVwapIntraday(candles: OHLCV[]): number | null {
  const sumTPV = candles.reduce((s, c) => s + ((c.high + c.low + c.close) / 3) * (c.volume ?? 0), 0);
  const sumVol = candles.reduce((s, c) => s + (c.volume ?? 0), 0);
  return sumVol > 0 ? Math.round(sumTPV / sumVol * 10000) / 10000 : null;
}

function calcRsiSeries(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return [];
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = changes.slice(0, period).reduce((s, d) => s + (d > 0 ? d : 0), 0) / period;
  let avgLoss = changes.slice(0, period).reduce((s, d) => s + (d < 0 ? -d : 0), 0) / period;
  const rsiVal = (ag: number, al: number) => al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  const result = [rsiVal(avgGain, avgLoss)];
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (changes[i] < 0 ? -changes[i] : 0)) / period;
    result.push(rsiVal(avgGain, avgLoss));
  }
  return result;
}

function detectDivergence(candles: OHLCV[], rsiSeries: number[], lookback = 14): DivergenceType {
  if (candles.length < lookback || rsiSeries.length < lookback) return "none";
  const pCandles = candles.slice(-lookback);
  const pRsi = rsiSeries.slice(-lookback);
  const n = pCandles.length;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (pCandles[i].high > pCandles[i-1].high && pCandles[i].high > pCandles[i-2].high &&
        pCandles[i].high > pCandles[i+1].high && pCandles[i].high > pCandles[i+2].high) swingHighs.push(i);
    if (pCandles[i].low < pCandles[i-1].low && pCandles[i].low < pCandles[i-2].low &&
        pCandles[i].low < pCandles[i+1].low && pCandles[i].low < pCandles[i+2].low) swingLows.push(i);
  }
  if (swingHighs.length >= 2) {
    const p = swingHighs[swingHighs.length - 2], c = swingHighs[swingHighs.length - 1];
    if (pCandles[c].high > pCandles[p].high && pRsi[c] < pRsi[p] - 2) return "regular_bearish";
    if (pCandles[c].high < pCandles[p].high && pRsi[c] > pRsi[p] + 2) return "hidden_bearish";
  }
  if (swingLows.length >= 2) {
    const p = swingLows[swingLows.length - 2], c = swingLows[swingLows.length - 1];
    if (pCandles[c].low < pCandles[p].low && pRsi[c] > pRsi[p] + 2) return "regular_bullish";
    if (pCandles[c].low > pCandles[p].low && pRsi[c] < pRsi[p] - 2) return "hidden_bullish";
  }
  return "none";
}

function classifyRegimeAPEX(adx: number | null, atrPct: number, bbWidth: number | null): ApexRegime {
  if (atrPct > 5 || (bbWidth !== null && bbWidth > 0.08)) return "chaotic";
  if (atrPct > 3.5) return "volatile_break";
  if (adx !== null && adx > 28 && atrPct >= 1.0) return "strong_trend";
  if (adx !== null && adx >= 18) return "weak_trend";
  if (adx !== null && adx < 18 && atrPct < 1.5) return "ranging";
  return atrPct < 1.5 ? "ranging" : "weak_trend";
}

function estimateRegimePersistence(adx: number | null, atrPct: number, regime: ApexRegime): number {
  if (regime === "strong_trend" && adx !== null) return adx > 35 ? 3 : adx > 30 ? 2 : 1;
  if (regime === "ranging" && adx !== null) return adx < 12 ? 3 : adx < 15 ? 2 : 1;
  if (regime === "volatile_break") return atrPct > 4 ? 2 : 1;
  return 1;
}

interface ApexDirectionResult { score: number; bullets: string[]; engineActive: boolean; }

function apexTrendEngine(ind: Indicators, price: number, candles: OHLCV[], vwap: number | null, strict: boolean): ApexDirectionResult {
  const bullets: string[] = [];
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  const obvSlope = calcObvSlope(candles);
  let score = 0, totalWeight = 0;
  if (strict && ind.ema50 !== null && ind.ema200 !== null) {
    const bothAbove = price > ind.ema50 && price > ind.ema200;
    const bothBelow = price < ind.ema50 && price < ind.ema200;
    if (!bothAbove && !bothBelow) {
      bullets.push("EMA50/EMA200 disagree — trend not confirmed, no signal");
      return { score: 0, bullets, engineActive: false };
    }
  }
  const w = strict ? 1.0 : 0.7;
  if (ind.ema200 !== null) {
    totalWeight += 1.5 * w;
    if (price > ind.ema200) { score += 1.5 * w; bullets.push("Price above EMA200 — long-term uptrend"); }
    else { score -= 1.5 * w; bullets.push("Price below EMA200 — long-term downtrend"); }
  }
  if (ind.ema50 !== null) { totalWeight += 1.0 * w; score += (price > ind.ema50 ? 1.0 : -1.0) * w; }
  if (ind.macdHistogram !== null) {
    totalWeight += 0.8 * w;
    if (ind.macdHistogram > 0) { score += 0.8 * w; bullets.push("MACD positive — bullish momentum confirmed"); }
    else { score -= 0.8 * w; bullets.push("MACD negative — bearish momentum confirmed"); }
  }
  if (vwap !== null) {
    totalWeight += 0.7 * w;
    if (price > vwap) { score += 0.7 * w; bullets.push(`Price above VWAP (${vwap.toFixed(2)}) — institutional buying zone`); }
    else { score -= 0.7 * w; bullets.push(`Price below VWAP (${vwap.toFixed(2)}) — institutional selling pressure`); }
  }
  if (volSma !== null) {
    totalWeight += 1.0 * w;
    if (volRatio > 1.5) {
      score += (score >= 0 ? 1.0 : -1.0) * w;
      bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — strong participation confirms trend`);
    } else if (volRatio < 0.7) {
      score *= 0.8; totalWeight *= 0.8;
      bullets.push(`Low volume (${(volRatio * 100).toFixed(0)}% of avg) — weak participation`);
    } else if (obvSlope !== null) {
      score += (obvSlope > 0 ? 0.5 : -0.5) * w;
      bullets.push(obvSlope > 0 ? "OBV rising — smart money accumulating" : "OBV falling — smart money distributing");
    }
  }
  if (ind.rsi !== null) {
    totalWeight += 0.2 * w;
    if (ind.rsi > 55) score += 0.2 * w;
    else if (ind.rsi < 45) score -= 0.2 * w;
  }
  return { score: totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0, bullets, engineActive: true };
}

function apexRangeEngine(ind: Indicators, price: number, candles: OHLCV[]): ApexDirectionResult {
  const bullets: string[] = [];
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  let score = 0, totalWeight = 0;
  if (ind.bbMid !== null) bullets.push(`Ranging — mean reversion around BB midline ${ind.bbMid.toFixed(2)}`);
  if (ind.rsi !== null) {
    totalWeight += 1.2;
    if (ind.rsi < 30) { score += 1.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply oversold, rebound expected`); }
    else if (ind.rsi > 70) { score -= 1.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply overbought, reversal likely`); }
    else if (ind.rsi < 40) { score += 0.5; bullets.push(`RSI ${ind.rsi.toFixed(1)} — mildly oversold`); }
    else if (ind.rsi > 60) { score -= 0.5; bullets.push(`RSI ${ind.rsi.toFixed(1)} — mildly overbought`); }
  }
  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
    totalWeight += 1.2;
    const bbRange = ind.bbUpper - ind.bbLower;
    const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
    if (pos < 0.15) { score += 1.2; bullets.push("Price at lower BB — strong reversal zone in range"); }
    else if (pos > 0.85) { score -= 1.2; bullets.push("Price at upper BB — strong reversal zone in range"); }
    else if (pos < 0.3) score += 0.4;
    else if (pos > 0.7) score -= 0.4;
  }
  if (ind.ema200 !== null) { totalWeight += 0.3; score += price > ind.ema200 ? 0.3 : -0.3; }
  if (ind.macdHistogram !== null) { totalWeight += 0.2; score += ind.macdHistogram > 0 ? 0.2 : -0.2; }
  if (volSma !== null && volRatio < 0.8 && Math.abs(score) > 0.3) score *= 1.1;
  return { score: totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0, bullets, engineActive: true };
}

function apexBreakoutEngine(ind: Indicators, price: number, candles: OHLCV[]): ApexDirectionResult {
  const bullets: string[] = [];
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  const obvSlope = calcObvSlope(candles);
  let score = 0, totalWeight = 0;
  if (volSma === null || volRatio < 1.8) {
    bullets.push(`Volatile breakout regime but volume insufficient (${(volRatio * 100).toFixed(0)}% of avg) — no signal`);
    return { score: 0, bullets, engineActive: false };
  }
  const breakoutBullish = (ind.macdHistogram !== null && ind.macdHistogram > 0) && (ind.ema50 === null || price > ind.ema50);
  totalWeight += 1.5; score += breakoutBullish ? 1.5 : -1.5;
  bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — breakout with strong participation`);
  if (obvSlope !== null) {
    totalWeight += 1.0;
    if (obvSlope > 0) { score += 1.0; bullets.push("OBV rising — smart money leading breakout"); }
    else { score -= 1.0; bullets.push("OBV falling — divergence warning, breakout may fail"); }
  }
  if (ind.bbWidth !== null) {
    totalWeight += 0.8;
    if (ind.bbWidth > 0.04) { score += breakoutBullish ? 0.8 : -0.8; bullets.push("BB width expanding — breakout momentum confirmed"); }
  }
  if (ind.macdHistogram !== null) { totalWeight += 0.6; score += ind.macdHistogram > 0 ? 0.6 : -0.6; }
  if (ind.ema50 !== null) { totalWeight += 0.5; score += price > ind.ema50 ? 0.5 : -0.5; }
  return { score: totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0, bullets, engineActive: true };
}

function apexDirectionEngine(ind: Indicators, price: number, candles: OHLCV[], regime: ApexRegime, vwap: number | null): ApexDirectionResult {
  switch (regime) {
    case "strong_trend":   return apexTrendEngine(ind, price, candles, vwap, true);
    case "weak_trend":     return apexTrendEngine(ind, price, candles, vwap, false);
    case "ranging":        return apexRangeEngine(ind, price, candles);
    case "volatile_break": return apexBreakoutEngine(ind, price, candles);
    default:               return { score: 0, bullets: ["Chaotic market — no trade conditions"], engineActive: false };
  }
}

function buildQualityScore(
  regime: ApexRegime,
  persistence: number,
  htfAlignment: "confirmed" | "neutral" | "blocked",
  divergence: DivergenceType,
  volRatio: number,
  crossAssetMatch: "confirms" | "contradicts" | "na",
): { score: number; bullets: string[] } {
  let quality = 0;
  const bullets: string[] = [];
  // Regime clarity (25 pts)
  if (persistence >= 3) quality += 25;
  else if (persistence >= 2) quality += 15;
  else { quality += 5; bullets.push("Regime recently shifted — uncertainty elevated"); }
  // HTF alignment (20 pts)
  if (htfAlignment === "confirmed") { quality += 20; bullets.push("Higher timeframe confirms direction — trade with the tide"); }
  else if (htfAlignment === "neutral") quality += 10;
  else quality -= 30;
  // Divergence (20 pts base)
  if (divergence === "none") {
    quality += 20;
  } else if (divergence === "regular_bearish" || divergence === "regular_bullish") {
    quality -= 35;
    bullets.push(`Regular ${divergence === "regular_bearish" ? "bearish" : "bullish"} divergence — momentum exhaustion, signal vetoed`);
  } else {
    quality += 20;
    bullets.push(`Hidden ${divergence === "hidden_bullish" ? "bullish" : "bearish"} divergence — trend continuation confirmed`);
  }
  // Volume quality (20 pts)
  if (volRatio > 1.8) quality += 20;
  else if (volRatio > 1.2) quality += 12;
  else if (volRatio >= 0.7) quality += 5;
  else { quality -= 10; bullets.push(`Thin volume (${(volRatio * 100).toFixed(0)}% of avg) — signal less reliable`); }
  // Cross-asset (15 pts)
  if (crossAssetMatch === "confirms") { quality += 15; bullets.push("Correlated asset confirms — cross-market consensus"); }
  else if (crossAssetMatch === "contradicts") { quality -= 10; bullets.push("Correlated asset diverging — cross-market warning"); }
  return { score: Math.max(0, Math.min(100, quality)), bullets };
}

function buildRiskLevelsAPEX(
  direction: SignalDirection,
  price: number,
  atr: number | null,
  regime: ApexRegime,
): { stopLoss: number; takeProfit: number; riskReward: number } {
  const base = atr ?? price * 0.02;
  const [slMult, tpMult] =
    regime === "ranging"        ? [1.0, 1.8] :
    regime === "weak_trend"     ? [1.5, 2.5] :
    regime === "strong_trend"   ? [2.0, 4.5] :
    regime === "volatile_break" ? [2.5, 3.5] : [1.5, 2.5];
  const risk = base * slMult, reward = base * tpMult;
  const sl = direction === "BUY" ? price - risk : price + risk;
  const tp = direction === "BUY" ? price + reward : price - reward;
  return {
    stopLoss: Math.round(sl * 10000) / 10000,
    takeProfit: Math.round(tp * 10000) / 10000,
    riskReward: Math.round((reward / risk) * 100) / 100,
  };
}

const CROSS_ASSET_PAIRS: Record<string, { symbol: string; inverse: boolean }> = {
  "GC=F":    { symbol: "DX-Y.NYB", inverse: true  },
  "SI=F":    { symbol: "GC=F",     inverse: false },
  "CL=F":    { symbol: "XLE",      inverse: false },
  "BZ=F":    { symbol: "XLE",      inverse: false },
  "BTC-USD": { symbol: "ETH-USD",  inverse: false },
  "ETH-USD": { symbol: "BTC-USD",  inverse: false },
  "^GSPC":   { symbol: "^VIX",     inverse: true  },
  "^DJI":    { symbol: "^VIX",     inverse: true  },
  "^IXIC":   { symbol: "^VIX",     inverse: true  },
  "GDX":     { symbol: "GC=F",     inverse: false },
  "XLE":     { symbol: "CL=F",     inverse: false },
};

interface ApexResult {
  score: number;
  bullets: string[];
  quality: number;
  regime: ApexRegime;
  htfAlignment: "confirmed" | "neutral" | "blocked";
  positionRiskPct: number;
  tradeable: boolean;
  threshold: number;
}

function strategyAPEX(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
  htfCandles: OHLCV[],
  crossAssetCandles: OHLCV[] | null,
  crossAssetInverse: boolean,
): ApexResult {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const regime = classifyRegimeAPEX(ind.adx, atrPct, ind.bbWidth);
  const persistence = estimateRegimePersistence(ind.adx, atrPct, regime);
  const vwap = calcVwap(candles);
  const { score: dirScore, bullets: dirBullets, engineActive } = apexDirectionEngine(ind, price, candles, regime, vwap);

  const closes = candles.map(c => c.close);
  const rsiSeries = calcRsiSeries(closes);
  const divergence = detectDivergence(candles, rsiSeries);

  let htfAlignment: "confirmed" | "neutral" | "blocked" = "neutral";
  if (htfCandles.length >= 30) {
    const htfInd = calculateIndicators(htfCandles);
    const htfPrice = htfCandles[htfCandles.length - 1].close;
    const htfAtrPct = htfInd.atr ? (htfInd.atr / htfPrice) * 100 : 2;
    const htfRegime = classifyRegimeAPEX(htfInd.adx, htfAtrPct, htfInd.bbWidth);
    const { score: htfScore } = apexDirectionEngine(htfInd, htfPrice, htfCandles, htfRegime, calcVwap(htfCandles));
    if (htfScore > 0.3 && dirScore > 0.1) htfAlignment = "confirmed";
    else if (htfScore < -0.3 && dirScore < -0.1) htfAlignment = "confirmed";
    else if ((htfScore > 0.3 && dirScore < -0.2) || (htfScore < -0.3 && dirScore > 0.2)) htfAlignment = "blocked";
  }

  let crossAssetMatch: "confirms" | "contradicts" | "na" = "na";
  if (crossAssetCandles && crossAssetCandles.length >= 30) {
    const xInd = calculateIndicators(crossAssetCandles);
    const xPrice = crossAssetCandles[crossAssetCandles.length - 1].close;
    const xAtrPct = xInd.atr ? (xInd.atr / xPrice) * 100 : 2;
    const xRegime = classifyRegimeAPEX(xInd.adx, xAtrPct, xInd.bbWidth);
    const { score: xRaw } = apexDirectionEngine(xInd, xPrice, crossAssetCandles, xRegime, null);
    const xScore = crossAssetInverse ? -xRaw : xRaw;
    if ((xScore > 0.2 && dirScore > 0) || (xScore < -0.2 && dirScore < 0)) crossAssetMatch = "confirms";
    else if ((xScore > 0.2 && dirScore < 0) || (xScore < -0.2 && dirScore > 0)) crossAssetMatch = "contradicts";
  }

  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;

  const { score: quality, bullets: qualBullets } = buildQualityScore(regime, persistence, htfAlignment, divergence, volRatio, crossAssetMatch);

  const thresholds: Record<ApexRegime, number> = {
    strong_trend: 0.45, weak_trend: 0.65, ranging: 0.55, volatile_break: 0.60, chaotic: 999,
  };
  const threshold = thresholds[regime];
  const tradeable = quality >= 60 && htfAlignment !== "blocked" && engineActive && regime !== "chaotic";
  const qualityMult = quality >= 90 ? 1.0 : quality >= 75 ? 0.85 : quality >= 60 ? 0.65 : 0;
  const regimeMults: Record<ApexRegime, number> = {
    strong_trend: 1.0, volatile_break: 0.6, ranging: 0.75, weak_trend: 0.5, chaotic: 0,
  };
  const positionRiskPct = Math.round(qualityMult * regimeMults[regime] * 100) / 100;

  const bullets = [
    `APEX ${regime} (ADX ${ind.adx?.toFixed(1) ?? "N/A"}, ATR ${atrPct.toFixed(1)}%) — quality ${quality}/100${tradeable ? "" : " ⚠ below threshold"}`,
    ...dirBullets.slice(0, 3),
    ...qualBullets.slice(0, 2),
  ].slice(0, 6);

  return { score: dirScore, bullets, quality, regime, htfAlignment, positionRiskPct, tradeable, threshold };
}

// ─── S8: Ensemble Meta-Strategy ───────────────────────────────────────────────

interface EnsembleVote {
  strategy: string;
  direction: SignalDirection;
  weight: number;
}

interface EnsembleResult {
  score: number;
  bullets: string[];
  regime: ApexRegime;
  apexResult: ApexResult;
  agreementCount: number;
}

// Per-regime weights (s4/s5/s7) reflect each engine's known strengths
const REGIME_WEIGHTS: Record<ApexRegime, { s4: number; s5: number; s7: number }> = {
  strong_trend:   { s4: 0.35, s5: 0.15, s7: 0.50 },
  weak_trend:     { s4: 0.25, s5: 0.35, s7: 0.40 },
  ranging:        { s4: 0.20, s5: 0.45, s7: 0.35 },
  volatile_break: { s4: 0.35, s5: 0.10, s7: 0.55 },
  chaotic:        { s4: 0.33, s5: 0.34, s7: 0.33 },
};

function strategyEnsemble(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
  htfCandles: OHLCV[],
  crossAssetCandles: OHLCV[] | null,
  crossAssetInverse: boolean,
): EnsembleResult {
  // Always run S7 first — it provides regime + quality + HTF context
  const r7 = strategyAPEX(ind, price, candles, htfCandles, crossAssetCandles, crossAssetInverse);
  const regime = r7.regime;

  if (regime === "chaotic") {
    return {
      score: 0,
      bullets: ["Chaotic market — ensemble suspended, all engines agree: no trade"],
      regime, apexResult: r7, agreementCount: 0,
    };
  }

  const weights = REGIME_WEIGHTS[regime];

  // S4 vote
  const { score: s4score } = strategyS4(ind, price, candles);
  const s4dir = scoreToSignalS4(s4score);

  // S5 vote
  const r5 = strategyS5(ind, price, candles);
  const s5dir: SignalDirection = r5.score > r5.threshold ? "BUY" : r5.score < -r5.threshold ? "SELL" : "HOLD";

  // S7 vote (HOLD if quality gate failed)
  const s7dir: SignalDirection = r7.tradeable
    ? (r7.score > r7.threshold ? "BUY" : r7.score < -r7.threshold ? "SELL" : "HOLD")
    : "HOLD";

  const votes: EnsembleVote[] = [
    { strategy: "S4", direction: s4dir, weight: weights.s4 },
    { strategy: "S5", direction: s5dir, weight: weights.s5 },
    { strategy: "S7", direction: s7dir, weight: weights.s7 },
  ];

  // Weighted consensus score in [-1, +1]
  let buyWeight = 0, sellWeight = 0;
  const buys: string[] = [], sells: string[] = [];
  for (const v of votes) {
    if (v.direction === "BUY")  { buyWeight  += v.weight; buys.push(v.strategy); }
    if (v.direction === "SELL") { sellWeight += v.weight; sells.push(v.strategy); }
  }
  const consensus = buyWeight - sellWeight;

  const buyCount  = buys.length;
  const sellCount = sells.length;
  const agreementCount = Math.max(buyCount, sellCount);
  const consensusLabel = consensus > 0 ? "bullish" : consensus < 0 ? "bearish" : "mixed";

  const bullets = [
    `Ensemble ${regime} — ${buys.length ? buys.join("+") : "none"} buy · ${sells.length ? sells.join("+") : "none"} sell · weighted consensus ${consensus >= 0 ? "+" : ""}${(consensus * 100).toFixed(0)}%`,
    ...r7.bullets.slice(1, 3),
    agreementCount === 3
      ? "All three engines agree — maximum conviction, full position"
      : agreementCount === 2
        ? `2/3 engines ${consensusLabel} — moderate conviction, reduced position`
        : "No consensus — engines disagree, standing aside",
  ].filter(Boolean).slice(0, 6);

  return { score: consensus, bullets, regime, apexResult: r7, agreementCount };
}

// ─── S9: Silver Liquidity Sweep Strategy ─────────────────────────────────────
// Mirrors the Pine Script "SLS" indicator:
// London/NY kill-zone session gate + liquidity sweep (stop hunt wick) +
// 9 EMA power candle + Fibonacci 0.618/0.786 (long) or 0.236/0.382 (short).

function isLondonKZ(unixSec: number): boolean {
  // 03:00–06:00 ET → 07:00–11:00 UTC (covers both EDT and EST)
  const h = new Date(unixSec * 1000).getUTCHours();
  return h >= 7 && h < 11;
}

function isNYKZ(unixSec: number): boolean {
  // 08:30–10:00 ET → 12:30–15:00 UTC (covers both EDT and EST)
  const d = new Date(unixSec * 1000);
  const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  return totalMin >= 12 * 60 + 30 && totalMin < 15 * 60;
}

function isPostNewsCZ(unixSec: number): boolean {
  // 10:00–11:00 ET trend continuation → 14:00–16:00 UTC (covers both EDT and EST)
  const h = new Date(unixSec * 1000).getUTCHours();
  return h >= 14 && h < 16;
}

interface S9Result { score: number; bullets: string[]; swingHigh: number; swingLow: number; }

function strategyS9(
  candles: OHLCV[],
  ind: Indicators,
  price: number,
  tf: string,
): S9Result {
  const bullets: string[] = [];
  const n = candles.length;
  const SWEEP_LB = 10;
  const FIB_LB   = 20;
  if (n < FIB_LB + SWEEP_LB + 2) {
    return { score: 0, bullets: ["Insufficient candle data for S9"], swingHigh: price, swingLow: price };
  }

  const cur = candles[n - 1];

  // Session gate — bypass on daily/4h or when running backtest simulation
  const bypassSession  = tf === "1w" || tf === "1d" || tf === "4h" || tf === "backtest";
  const londonActive   = !bypassSession && isLondonKZ(cur.time);
  const nyActive       = !bypassSession && isNYKZ(cur.time);
  const postNewsActive = !bypassSession && isPostNewsCZ(cur.time);
  const inSession      = bypassSession || londonActive || nyActive || postNewsActive;
  const sessionLabel   = londonActive   ? "London Kill Zone (03:00–06:00 ET)"
                       : nyActive       ? "New York Kill Zone (08:30–10:00 ET)"
                       : postNewsActive ? "Post-News Continuation Window (10:00–11:00 ET)"
                       : bypassSession  ? "session gate bypassed on daily/4h"
                       : "off-session";

  // Liquidity sweep — compare to prior SWEEP_LB bars (excluding current)
  const lookSlice = candles.slice(n - SWEEP_LB - 1, n - 1);
  const prevLow  = Math.min(...lookSlice.map(c => c.low));
  const prevHigh = Math.max(...lookSlice.map(c => c.high));

  const bullSweep = cur.low < prevLow  && cur.close > prevLow;
  const bearSweep = cur.high > prevHigh && cur.close < prevHigh;

  // 9 EMA power candle (0.5 body threshold in backtest — 1h candles have less wick definition)
  const ema9 = ind.ema9;
  const range   = cur.high - cur.low;
  const body    = Math.abs(cur.close - cur.open);
  const bodyPct = range > 0 ? body / range : 0;
  const bodyThreshold = tf === "backtest" ? 0.5 : 0.6;
  const bullPower = bodyPct > bodyThreshold && cur.close > cur.open && ema9 !== null && cur.close > ema9;
  const bearPower = bodyPct > bodyThreshold && cur.close < cur.open && ema9 !== null && cur.close < ema9;

  // Fibonacci 44–61.8% POI zone over last FIB_LB candles
  const fibSlice = candles.slice(n - FIB_LB, n);
  const swingHigh = Math.max(...fibSlice.map(c => c.high));
  const swingLow  = Math.min(...fibSlice.map(c => c.low));
  const fibRange  = swingHigh - swingLow;

  // Long POI: 44–61.8% measured from swing low upward
  const poiLongLow  = swingLow  + fibRange * 0.44;
  const poiLongHigh = swingLow  + fibRange * 0.618;
  // Short POI: 44–61.8% measured from swing high downward (mirror)
  const poiShortLow  = swingHigh - fibRange * 0.618;
  const poiShortHigh = swingHigh - fibRange * 0.44;

  const nearFibLong  = price >= poiLongLow  * 0.998 && price <= poiLongHigh  * 1.002;
  const nearFibShort = price >= poiShortLow * 0.998 && price <= poiShortHigh * 1.002;

  // In backtest mode (1h candles), skip the POI zone — Fib precision requires
  // 1m charts. Sweep + power candle is the core signal; POI adds entry precision.
  const backtestMode = tf === "backtest";
  const longSignal  = bullSweep && inSession && bullPower && (backtestMode || nearFibLong);
  const shortSignal = bearSweep && inSession && bearPower && (backtestMode || nearFibShort);

  if (longSignal) {
    bullets.push(`Bullish liquidity sweep — wick below ${prevLow.toFixed(3)}, close recovered above (stop hunt)`);
    bullets.push(`${sessionLabel} active`);
    bullets.push(`Power candle: body ${(bodyPct * 100).toFixed(0)}% of range, closing above 9 EMA (${ema9!.toFixed(3)})`);
    bullets.push(`Price in 44–61.8% POI zone (${poiLongLow.toFixed(3)}–${poiLongHigh.toFixed(3)})`);
    bullets.push(`Risk 3–5% per setup — silver is moderate volatility vs. gold`);
    return { score: 1.0, bullets, swingHigh, swingLow };
  }

  if (shortSignal) {
    bullets.push(`Bearish liquidity sweep — wick above ${prevHigh.toFixed(3)}, close rejected below (stop hunt)`);
    bullets.push(`${sessionLabel} active`);
    bullets.push(`Power candle: body ${(bodyPct * 100).toFixed(0)}% of range, closing below 9 EMA (${ema9!.toFixed(3)})`);
    bullets.push(`Price in 44–61.8% POI zone from top (${poiShortLow.toFixed(3)}–${poiShortHigh.toFixed(3)})`);
    bullets.push(`Risk 3–5% per setup — silver is moderate volatility vs. gold`);
    return { score: -1.0, bullets, swingHigh, swingLow };
  }

  // Partial condition diagnostics
  if (bullSweep)       bullets.push(`Bullish sweep detected below ${prevLow.toFixed(3)} — awaiting ${!inSession ? "session + " : ""}${!bullPower ? "power candle + " : ""}${!nearFibLong ? "44–61.8% POI zone" : "confirmation"}`);
  else if (bearSweep)  bullets.push(`Bearish sweep detected above ${prevHigh.toFixed(3)} — awaiting ${!inSession ? "session + " : ""}${!bearPower ? "power candle + " : ""}${!nearFibShort ? "44–61.8% POI zone" : "confirmation"}`);
  else                 bullets.push(`No liquidity sweep on current bar (range: ${prevLow.toFixed(3)}–${prevHigh.toFixed(3)})`);

  if (!inSession && !bypassSession) bullets.push(`Outside kill zones — ${sessionLabel}`);
  if (!nearFibLong && !nearFibShort) bullets.push(`Price outside POI zone — long: ${poiLongLow.toFixed(3)}–${poiLongHigh.toFixed(3)}, short: ${poiShortLow.toFixed(3)}–${poiShortHigh.toFixed(3)}`);
  if (ema9 !== null) bullets.push(`9 EMA: ${ema9.toFixed(3)} — price ${price > ema9 ? "above" : "below"}`);

  return { score: 0, bullets, swingHigh, swingLow };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── S1+–S9+: Enhanced Strategy Suite ────────────────────────────────────────
// Each S*+ strategy applies the win-rate improvements identified in the audit.
// Server params: S1+=10, S2+=11, S3+=12, S4+=13, S5+=14, S6+=15, S7+=16, S8+=17, S9+=18
// ─────────────────────────────────────────────────────────────────────────────

// ── S1+ helpers ──────────────────────────────────────────────────────────────

function scoreIndicatorsPlus(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
): { score: number; bullets: string[] } {
  let score = 0;
  let totalWeight = 0;
  const bullets: string[] = [];

  // Volume participation gate — thin vol dampens all signals
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  const volMult = volSma !== null ? (volRatio < 0.5 ? 0.55 : volRatio < 0.8 ? 0.82 : 1.0) : 1.0;
  if (volSma !== null && volRatio < 0.5) {
    bullets.push(`Very thin volume (${(volRatio * 100).toFixed(0)}% of avg) — signal confidence reduced`);
  }

  // RSI
  if (ind.rsi !== null) {
    totalWeight += 1.0;
    if (ind.rsi < 30) { score += 1.0; bullets.push(`RSI oversold at ${ind.rsi.toFixed(1)} — reversal potential`); }
    else if (ind.rsi > 70) { score -= 1.0; bullets.push(`RSI overbought at ${ind.rsi.toFixed(1)} — pullback watch`); }
    else if (ind.rsi < 45) { score -= 0.3; bullets.push(`RSI at ${ind.rsi.toFixed(1)} leans slightly bearish`); }
    else if (ind.rsi > 55) { score += 0.3; bullets.push(`RSI at ${ind.rsi.toFixed(1)} leans slightly bullish`); }
    else { bullets.push(`RSI at ${ind.rsi.toFixed(1)} is neutral`); }
  }

  // MACD histogram sign + near-crossover bonus
  if (ind.macdHistogram !== null) {
    totalWeight += 1.0;
    const histPos = ind.macdHistogram > 0;
    score += histPos ? 0.6 : -0.6;
    bullets.push(histPos ? "MACD histogram positive — bullish momentum" : "MACD histogram negative — bearish momentum");
    // Near-crossover: histogram ≤ 8% of |macd line| → fresh momentum shift
    if (ind.macd !== null && Math.abs(ind.macdHistogram) <= Math.abs(ind.macd) * 0.08 + 0.0001) {
      score += histPos ? 0.2 : -0.2;
      bullets.push("MACD near signal-line crossover — fresh momentum shift");
    }
  }

  // EMA50
  if (ind.ema50 !== null) {
    totalWeight += 0.8;
    if (price > ind.ema50) { score += 0.5; bullets.push(`Above EMA50 — medium-term uptrend`); }
    else { score -= 0.5; bullets.push(`Below EMA50 — medium-term downtrend`); }
  }

  // EMA200
  if (ind.ema200 !== null) {
    totalWeight += 1.0;
    if (price > ind.ema200) { score += 0.8; bullets.push("Above EMA200 — long-term bullish"); }
    else { score -= 0.8; bullets.push("Below EMA200 — long-term bearish"); }
  }

  // Bollinger Bands
  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
    totalWeight += 0.8;
    const bbRange = ind.bbUpper - ind.bbLower;
    const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
    if (pos < 0.2) { score += 0.7; bullets.push("Near lower Bollinger Band — oversold zone"); }
    else if (pos > 0.8) { score -= 0.7; bullets.push("Near upper Bollinger Band — overbought zone"); }
    else { bullets.push(`BB position: ${(pos * 100).toFixed(0)}% of range`); }
  }

  // ROC
  if (ind.roc !== null) {
    totalWeight += 0.5;
    if (ind.roc > 5) { score += 0.4; bullets.push(`ROC +${ind.roc.toFixed(1)}% — strong upward momentum`); }
    else if (ind.roc < -5) { score -= 0.4; bullets.push(`ROC ${ind.roc.toFixed(1)}% — strong downward momentum`); }
    else { score += ind.roc > 0 ? 0.1 : -0.1; }
  }

  // OBV slope — S1+ addition
  const obvSlope = calcObvSlope(candles);
  if (obvSlope !== null) {
    totalWeight += 0.5;
    if (obvSlope > 0) { score += 0.4; bullets.push("OBV rising — institutional accumulation confirms direction"); }
    else { score -= 0.4; bullets.push("OBV falling — institutional distribution, divergence risk"); }
  }

  const normalised = totalWeight > 0
    ? Math.max(-1, Math.min(1, (score * volMult) / (totalWeight * 0.75)))
    : 0;
  return { score: normalised, bullets };
}

function strategyS1Plus(ind: Indicators, price: number, candles: OHLCV[]): { score: number; bullets: string[] } {
  return scoreIndicatorsPlus(ind, price, candles);
}

// ── S2+ ───────────────────────────────────────────────────────────────────────

function strategyS2Plus(ind: Indicators, price: number, candles: OHLCV[]): { score: number; bullets: string[] } {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const { score: baseScore, bullets } = scoreIndicatorsPlus(ind, price, candles);

  // Regime-aware weight adjustment instead of blanket vol multiplier
  let regimeAdj = 1.0;
  const rExtra: string[] = [];
  if (ind.adx !== null && ind.adx > 25) {
    regimeAdj = atrPct > 2 ? 0.88 : 1.05;
    rExtra.push(`Trending (ADX ${ind.adx.toFixed(1)}) — trend weight applied`);
  } else if (ind.adx !== null && ind.adx < 18) {
    regimeAdj = 0.80;
    rExtra.push(`Ranging (ADX ${ind.adx.toFixed(1)}) — momentum signals dampened`);
  } else if (atrPct > 3) {
    regimeAdj = 0.70;
    rExtra.push(`High volatility (ATR ${atrPct.toFixed(1)}%) — reduce position size`);
  } else if (atrPct < 0.8) {
    regimeAdj = 1.10;
    rExtra.push(`Low volatility (ATR ${atrPct.toFixed(1)}%) — signals more reliable`);
  }

  // Candle direction lock — penalise signals that contradict candle body direction
  const n = candles.length;
  let dirMult = 1.0;
  const dExtra: string[] = [];
  if (n > 0) {
    const c = candles[n - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyPct = range > 0 ? body / range : 0;
    const bullCandle = c.close > c.open;
    if (bodyPct > 0.3) {
      if (baseScore > 0.1 && !bullCandle) { dirMult = 0.72; dExtra.push("Bullish signal but red candle body — entry timing suboptimal"); }
      else if (baseScore < -0.1 && bullCandle) { dirMult = 0.72; dExtra.push("Bearish signal but green candle body — entry timing suboptimal"); }
      else { dExtra.push(`Candle body (${(bodyPct * 100).toFixed(0)}%) confirms signal direction`); }
    }
  }

  const finalScore = Math.max(-1, Math.min(1, baseScore * regimeAdj * dirMult));
  return { score: finalScore, bullets: [...rExtra, ...dExtra, ...bullets].slice(0, 6) };
}

// ── S3+ ───────────────────────────────────────────────────────────────────────

function aggregateSentimentPlus(articles: NewsArticle[]): { score: number; count: number; freshHours: number } {
  let totalWeight = 0;
  let weightedSum = 0;
  let relevantCount = 0;
  let freshestHours = 999;

  for (const article of articles) {
    const { score, relevance } = scoreArticleEnhanced(article.title, article.publisher, article.publishedAt);
    if (relevance < 0.5) continue; // stricter gate vs S3's 0.2
    relevantCount++;
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000;
    if (hoursOld < freshestHours) freshestHours = hoursOld;
    const freshness = Math.exp(-hoursOld / 24);
    const credibility = getSourceCredibility(article.publisher);
    const weight = freshness * credibility * relevance;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return {
    score: totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0,
    count: relevantCount,
    freshHours: freshestHours,
  };
}

function strategyS3Plus(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
  articles: NewsArticle[],
): { score: number; bullets: string[] } {
  const { score: techScore, bullets: techBullets } = scoreIndicatorsPlus(ind, price, candles);
  const { score: sentScore, count, freshHours } = aggregateSentimentPlus(articles);

  let techW = 0.65;
  let newsW = 0.35;
  const nb: string[] = [];

  if (count < 3) {
    techW = 1.0; newsW = 0.0;
    nb.push(`Only ${count} high-relevance article(s) found — falling back to pure technical signal`);
  } else if (freshHours > 6) {
    techW = 0.80; newsW = 0.20;
    nb.push(`Latest article ${freshHours.toFixed(0)}h old — blend shifted 80/20 tech/news`);
  } else {
    const label = sentScore > 0.05 ? "positive" : sentScore < -0.05 ? "negative" : "neutral";
    nb.push(`${count} high-relevance articles (${freshHours.toFixed(1)}h fresh) — sentiment ${label}, weighted 65/35`);
  }

  const blended = Math.max(-1, Math.min(1, techW * techScore + newsW * sentScore));
  return { score: blended, bullets: [...nb, ...techBullets].slice(0, 6) };
}

// ── S4+ ───────────────────────────────────────────────────────────────────────

type S4PlusRegime = "trend" | "weak_trend" | "mr" | "other";
interface S4PlusResult { score: number; bullets: string[]; regimeType: S4PlusRegime }

function strategyS4Plus(ind: Indicators, price: number, candles: OHLCV[]): S4PlusResult {
  const bullets: string[] = [];
  const adx = ind.adx;
  const isTrending  = adx !== null && adx > 25;
  const isWeakTrend = adx !== null && adx >= 18 && adx <= 25;
  const isRanging   = adx !== null && adx < 18;

  if (isTrending)  bullets.push(`Strong trend (ADX ${adx!.toFixed(1)}) — Trend Engine, threshold 0.45`);
  else if (isWeakTrend) bullets.push(`Weak trend (ADX ${adx!.toFixed(1)}) — Trend Engine at 70% weight, threshold 0.45`);
  else if (isRanging)   bullets.push(`Ranging (ADX ${adx!.toFixed(1)}) — Mean Reversion Engine, threshold 0.65`);
  else                  bullets.push("Undefined regime — balanced weighting");

  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volSma  = calcVolumeSma(candles);
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  const obvSlope = calcObvSlope(candles);

  let score = 0;
  let totalWeight = 0;
  const trendW = isTrending ? 1.0 : isWeakTrend ? 0.70 : 0;
  const mrActive = isRanging;
  const regimeType: S4PlusRegime = isTrending || isWeakTrend ? (isWeakTrend ? "weak_trend" : "trend") : isRanging ? "mr" : "other";

  if (trendW > 0) {
    if (ind.ema200 !== null) {
      totalWeight += 1.2 * trendW;
      if (price > ind.ema200) { score += 1.2 * trendW; bullets.push("Above EMA200 — long-term uptrend"); }
      else { score -= 1.2 * trendW; bullets.push("Below EMA200 — long-term downtrend"); }
    }
    if (ind.ema50 !== null) { totalWeight += 0.8 * trendW; score += (price > ind.ema50 ? 0.8 : -0.8) * trendW; }
    if (ind.macdHistogram !== null) {
      totalWeight += 0.8 * trendW;
      if (ind.macdHistogram > 0) { score += 0.8 * trendW; bullets.push("MACD positive — bullish momentum"); }
      else { score -= 0.8 * trendW; bullets.push("MACD negative — bearish momentum"); }
    }
    if (ind.rsi !== null) {
      totalWeight += 0.2 * trendW;
      if (ind.rsi > 60) score += 0.2 * trendW;
      else if (ind.rsi < 40) score -= 0.2 * trendW;
    }
    if (volSma !== null) {
      totalWeight += 1.0 * trendW;
      if (volRatio > 1.2) {
        score += (score >= 0 ? 1.0 : -1.0) * trendW;
        bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — participation confirms trend`);
      } else if (volRatio < 0.7) {
        score *= 0.7; totalWeight *= 0.7;
      } else if (obvSlope !== null && obvSlope > 0) { score += 0.3 * trendW; bullets.push("OBV rising — smart money accumulating"); }
      else if (obvSlope !== null && obvSlope < 0) { score -= 0.3 * trendW; }
    }
  } else if (mrActive) {
    if (ind.rsi !== null) {
      totalWeight += 1.0;
      if (ind.rsi < 30) { score += 1.0; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply oversold in range`); }
      else if (ind.rsi > 70) { score -= 1.0; bullets.push(`RSI ${ind.rsi.toFixed(1)} — overbought in range`); }
      else if (ind.rsi < 40) { score += 0.4; }
      else if (ind.rsi > 60) { score -= 0.4; }
    }
    if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
      totalWeight += 1.0;
      const bbRange = ind.bbUpper - ind.bbLower;
      const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
      if (pos < 0.15) { score += 1.0; bullets.push("At lower BB — strong rebound signal in range"); }
      else if (pos > 0.85) { score -= 1.0; bullets.push("At upper BB — strong reversal in range"); }
      else if (pos < 0.3) score += 0.4;
      else if (pos > 0.7) score -= 0.4;
    }
    // S4+: BB width as scoring multiplier in MR engine
    if (ind.bbWidth !== null) {
      const bbMult = ind.bbWidth < 0.02 ? 1.30 : ind.bbWidth < 0.04 ? 1.10 : ind.bbWidth > 0.08 ? 0.70 : 1.0;
      score *= bbMult;
      if (bbMult > 1.1) bullets.push(`BB compression (${(ind.bbWidth * 100).toFixed(1)}%) — MR signal amplified`);
      else if (bbMult < 0.9) bullets.push(`BB expanding (${(ind.bbWidth * 100).toFixed(1)}%) — MR signal weakened`);
    }
    if (ind.atr !== null) {
      const atrPct = (ind.atr / price) * 100;
      if (atrPct < 0.8) score *= 1.2;
      else if (atrPct > 3) score *= 0.6;
    }
    if (ind.ema200 !== null) { totalWeight += 0.3; score += price > ind.ema200 ? 0.3 : -0.3; }
    if (ind.macdHistogram !== null) { totalWeight += 0.2; score += ind.macdHistogram > 0 ? 0.2 : -0.2; }
  } else {
    // Undefined regime: use S1+ base
    const { score: s, bullets: b } = scoreIndicatorsPlus(ind, price, candles);
    return { score: s, bullets: [...bullets, ...b].slice(0, 6), regimeType: "other" };
  }

  const normalised = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;
  return { score: normalised, bullets: bullets.slice(0, 6), regimeType };
}

function scoreToSignalS4Plus(score: number, regime: S4PlusRegime): SignalDirection {
  const threshold = (regime === "mr") ? 0.65 : (regime === "trend") ? 0.45 : (regime === "weak_trend") ? 0.45 : 0.35;
  if (score > threshold) return "BUY";
  if (score < -threshold) return "SELL";
  return "HOLD";
}

// ── S5+ ───────────────────────────────────────────────────────────────────────

function strategyS5Plus(ind: Indicators, price: number, candles: OHLCV[]): S5Result {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  let regime = classifyRegimeS5(atrPct, ind.adx);

  // S5+: volume spike gate — volatile_trend without 1.5× volume → reclassify as quiet_range
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  if (regime === "volatile_trend" && volRatio < 1.5) regime = "quiet_range";

  const threshold = REGIME_THRESHOLDS_S5[regime];
  const w = REGIME_WEIGHTS_S5[regime];
  const bullets: string[] = [];

  const regimeLabel: Record<Regime5, string> = {
    quiet_trend: "Quiet Trend", quiet_range: "Quiet Range", volatile_trend: "Volatile Trend", chaotic: "Chaotic",
  };

  if (regime === "chaotic") {
    bullets.push(`Chaotic regime — no trade`);
    return { score: 0, bullets, threshold, regime };
  }

  bullets.push(`${regimeLabel[regime]} (ATR ${atrPct.toFixed(1)}%, ADX ${ind.adx?.toFixed(1) ?? "N/A"}) — dynamic weights active`);

  let score = 0, totalWeight = 0;
  // S5+: track weights per bull/bear for weighted consensus gate
  let weightedBull = 0, weightedBear = 0;

  function factor(contribution: number, factorWeight: number) {
    score += contribution;
    totalWeight += factorWeight;
    if (contribution > 0) weightedBull += factorWeight;
    else if (contribution < 0) weightedBear += factorWeight;
  }

  if (ind.ema200 !== null && w.ema200 > 0) {
    const c = price > ind.ema200 ? w.ema200 : -w.ema200;
    factor(c, w.ema200);
    bullets.push(price > ind.ema200 ? "Above EMA200 — long-term bullish bias" : "Below EMA200 — long-term bearish bias");
  }
  if (ind.ema50 !== null && w.ema50 > 0) {
    factor(price > ind.ema50 ? w.ema50 : -w.ema50, w.ema50);
  }
  if (ind.macdHistogram !== null && w.macd > 0) {
    const c = ind.macdHistogram > 0 ? w.macd : -w.macd;
    factor(c, w.macd);
    bullets.push(ind.macdHistogram > 0 ? "MACD positive — bullish momentum" : "MACD negative — bearish momentum");
  }
  if (ind.rsi !== null && w.rsi > 0) {
    let c = 0;
    if (regime === "quiet_range") {
      if (ind.rsi < 30) { c = w.rsi; bullets.push(`RSI ${ind.rsi.toFixed(1)} — oversold, range rebound`); }
      else if (ind.rsi > 70) { c = -w.rsi; bullets.push(`RSI ${ind.rsi.toFixed(1)} — overbought, range reversal`); }
      else if (ind.rsi < 45) c = w.rsi * 0.3;
      else if (ind.rsi > 55) c = -w.rsi * 0.3;
    } else {
      if (ind.rsi > 55) { c = w.rsi; bullets.push(`RSI ${ind.rsi.toFixed(1)} — bullish momentum zone`); }
      else if (ind.rsi < 45) { c = -w.rsi; bullets.push(`RSI ${ind.rsi.toFixed(1)} — bearish momentum zone`); }
    }
    factor(c, w.rsi);
  }
  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null && w.bollinger > 0) {
    const bbRange = ind.bbUpper - ind.bbLower;
    const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
    let c = 0;
    if (regime === "quiet_range") {
      if (pos < 0.15) { c = w.bollinger; bullets.push("At lower BB — oversold in range"); }
      else if (pos > 0.85) { c = -w.bollinger; bullets.push("At upper BB — overbought in range"); }
      else if (pos < 0.3) c = w.bollinger * 0.4;
      else if (pos > 0.7) c = -w.bollinger * 0.4;
    } else {
      if (pos > 0.7) c = w.bollinger * 0.5;
      else if (pos < 0.3) c = -w.bollinger * 0.5;
    }
    factor(c, w.bollinger);
  }
  if (volSma !== null && w.volume > 0) {
    if (volRatio > 1.3) {
      const d = score >= 0 ? w.volume : -w.volume;
      factor(d, w.volume);
      bullets.push(`Volume ${(volRatio * 100).toFixed(0)}% of avg — confirms move`);
    } else if (regime === "volatile_trend" && volRatio < 1.3) {
      score *= 0.5; bullets.push("Breakout without volume — signal dampened");
    } else {
      const obvSlope = calcObvSlope(candles);
      if (obvSlope !== null && obvSlope > 0) { factor(w.volume * 0.4, w.volume); bullets.push("OBV rising — institutional accumulation"); }
      else if (obvSlope !== null && obvSlope < 0) { factor(-w.volume * 0.4, w.volume); bullets.push("OBV falling — institutional distribution"); }
    }
  }

  // S5+: weighted consensus gate (not raw count)
  const weightedConsensus = totalWeight > 0 ? Math.max(weightedBull, weightedBear) / totalWeight : 0;
  const consensusMult = weightedConsensus >= 0.6 ? 1.0 : weightedConsensus >= 0.4 ? 0.55 : 0.25;
  if (weightedConsensus < 0.6) bullets.push(`Weighted consensus ${(weightedConsensus * 100).toFixed(0)}% — conviction reduced`);

  // S5+: regime-aware EMA200 stretch penalty (4% in ranging, 8% in trend)
  let qualityPenalty = 0;
  if (ind.ema200 !== null) {
    const stretch = Math.abs(price - ind.ema200) / ind.ema200 * 100;
    const stretchLimit = regime === "quiet_range" ? 4 : 8;
    if (stretch > stretchLimit) {
      qualityPenalty += 0.15;
      bullets.push(`Price ${stretch.toFixed(1)}% from EMA200 — extended, exhaustion risk`);
    }
  }

  const raw = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;
  const adjusted = raw * consensusMult * (1 - qualityPenalty);
  return { score: adjusted, bullets: bullets.slice(0, 6), threshold, regime };
}

// ── S6+ ───────────────────────────────────────────────────────────────────────

// Stricter source credibility — unknown publishers default to 0.35 not 0.55
function getSourceCredibilityPlus(publisher: string): number {
  const lower = publisher.toLowerCase();
  for (const [key, score] of Object.entries(SOURCE_CREDIBILITY)) {
    if (lower.includes(key)) return score;
  }
  return 0.35;
}

function aggregateSentimentS6Plus(articles: NewsArticle[]): { score: number; count: number; freshHours: number } {
  let totalWeight = 0;
  let weightedSum = 0;
  let relevantCount = 0;
  let freshestHours = 999;

  for (const article of articles) {
    const words = article.title.toLowerCase().split(/\s+/);
    let bullCount = 0, bearCount = 0, relevance = 0;
    for (let idx = 0; idx < words.length; idx++) {
      const word = words[idx];
      const negated = idx > 0 && NEGATION_WORDS.has(words[idx - 1]);
      for (const bw of BULLISH_WORDS) {
        if (word.startsWith(bw.split(" ")[0])) { relevance += 0.3; if (negated) bearCount += 0.7; else bullCount += 1; break; }
      }
      for (const bw of BEARISH_WORDS) {
        if (word.startsWith(bw.split(" ")[0])) { relevance += 0.3; if (negated) bullCount += 0.7; else bearCount += 1; break; }
      }
    }
    const rel = Math.min(1, relevance);
    if (rel < 0.2) continue;
    relevantCount++;
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000;
    if (hoursOld < freshestHours) freshestHours = hoursOld;
    const freshness = Math.exp(-hoursOld / 24);
    const credibility = getSourceCredibilityPlus(article.publisher);
    const net = bullCount - bearCount;
    const total = bullCount + bearCount;
    const rawScore = total > 0 ? net / total : 0;
    const weight = freshness * credibility * rel;
    weightedSum += rawScore * weight;
    totalWeight += weight;
  }

  return {
    score: totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0,
    count: relevantCount,
    freshHours: freshestHours,
  };
}

function strategyS6Plus(ind: Indicators, price: number, candles: OHLCV[], articles: NewsArticle[]): S6Result {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const { techW: rawTechW, newsW: rawNewsW } = calcRegimeWeightsS6(atrPct, ind.adx);

  const { score: techScore, bullets: techBullets } = strategyS2Plus(ind, price, candles);
  const { score: sentScore, count, freshHours } = aggregateSentimentS6Plus(articles);

  // S6+: stale news penalty — if ATR < 1% and news > 6h, revert to 80/20 not 60/40
  let techW = rawTechW;
  let newsW = rawNewsW;
  if (atrPct < 1 && freshHours > 6) { techW = 0.80; newsW = 0.20; }
  // S6+: min 3 articles before news weight lifts above 15%
  if (count < 3 && newsW > 0.15) { newsW = 0.10; techW = 0.90; }

  const blended = Math.max(-1, Math.min(1, techW * techScore + newsW * sentScore));

  const regimeDesc =
    atrPct > 5 ? "High-vol" :
    atrPct < 1 ? "Low-vol" :
    ind.adx !== null && ind.adx > 30 ? "Strong-trend" : "Neutral";

  const bullets: string[] = [];
  bullets.push(`${regimeDesc} — tech ${(techW * 100).toFixed(0)}% / news ${(newsW * 100).toFixed(0)}%`);
  if (count < 3) bullets.push(`Only ${count} article(s) — news weight capped at 10%`);
  else if (freshHours > 6 && atrPct < 1) bullets.push(`News ${freshHours.toFixed(0)}h old in low-vol — blend shifted 80/20`);
  for (const b of techBullets.slice(0, 3)) bullets.push(b);
  if (articles.length > 0) {
    const label = sentScore > 0.05 ? "bullish" : sentScore < -0.05 ? "bearish" : "neutral";
    bullets.push(`News ${label} (${count} relevant, credibility-weighted)`);
  }

  return { score: blended, bullets: bullets.slice(0, 6) };
}

// ── S7+ (APEX Plus) ───────────────────────────────────────────────────────────

// Expanded cross-asset map for more assets
const CROSS_ASSET_PAIRS_PLUS: Record<string, { symbol: string; inverse: boolean }> = {
  ...CROSS_ASSET_PAIRS,
  "EURUSD=X": { symbol: "GBPUSD=X",  inverse: false },
  "GBPUSD=X": { symbol: "EURUSD=X",  inverse: false },
  "GBPJPY=X": { symbol: "USDJPY=X",  inverse: false },
  "EURJPY=X": { symbol: "EURUSD=X",  inverse: false },
  "AUDUSD=X": { symbol: "NZDUSD=X",  inverse: false },
  "NZDUSD=X": { symbol: "AUDUSD=X",  inverse: false },
  "ZW=F":     { symbol: "ZC=F",      inverse: false },
  "ZC=F":     { symbol: "ZS=F",      inverse: false },
  "PA=F":     { symbol: "PL=F",      inverse: false },
  "PL=F":     { symbol: "PA=F",      inverse: false },
  "NG=F":     { symbol: "CL=F",      inverse: false },
  "^FTSE":    { symbol: "^GDAXI",    inverse: false },
  "^NSEI":    { symbol: "^HSI",      inverse: false },
  "^AXJO":    { symbol: "^NSEI",     inverse: false },
  "^FCHI":    { symbol: "^GDAXI",    inverse: false },
  "^N225":    { symbol: "^HSI",      inverse: false },
};

// Range engine with VWAP — S7+ addition
function apexRangeEnginePlus(ind: Indicators, price: number, candles: OHLCV[], vwap: number | null): ApexDirectionResult {
  const bullets: string[] = [];
  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;
  let score = 0, totalWeight = 0;

  if (ind.bbMid !== null) bullets.push(`Ranging — mean reversion around BB midline ${ind.bbMid.toFixed(2)}`);

  if (ind.rsi !== null) {
    totalWeight += 1.2;
    if (ind.rsi < 30) { score += 1.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply oversold, rebound expected`); }
    else if (ind.rsi > 70) { score -= 1.2; bullets.push(`RSI ${ind.rsi.toFixed(1)} — deeply overbought, reversal likely`); }
    else if (ind.rsi < 40) { score += 0.5; }
    else if (ind.rsi > 60) { score -= 0.5; }
  }
  if (ind.bbUpper !== null && ind.bbLower !== null && ind.bbMid !== null) {
    totalWeight += 1.2;
    const bbRange = ind.bbUpper - ind.bbLower;
    const pos = bbRange > 0 ? (price - ind.bbLower) / bbRange : 0.5;
    if (pos < 0.15) { score += 1.2; bullets.push("At lower BB — strong reversal zone in range"); }
    else if (pos > 0.85) { score -= 1.2; bullets.push("At upper BB — strong reversal zone in range"); }
    else if (pos < 0.3) score += 0.4;
    else if (pos > 0.7) score -= 0.4;
  }
  // VWAP in range engine — key S7+ addition
  if (vwap !== null) {
    totalWeight += 0.8;
    if (price > vwap) { score += 0.8; bullets.push(`Above VWAP (${vwap.toFixed(2)}) — bullish bias in range`); }
    else { score -= 0.8; bullets.push(`Below VWAP (${vwap.toFixed(2)}) — bearish bias in range`); }
  }
  if (ind.ema200 !== null) { totalWeight += 0.3; score += price > ind.ema200 ? 0.3 : -0.3; }
  if (ind.macdHistogram !== null) { totalWeight += 0.2; score += ind.macdHistogram > 0 ? 0.2 : -0.2; }
  if (volSma !== null && volRatio < 0.8 && Math.abs(score) > 0.3) score *= 1.1;

  return { score: totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0, bullets, engineActive: true };
}

// Breakout engine with EMA50 direction lock — S7+ addition
function apexBreakoutEnginePlus(ind: Indicators, price: number, candles: OHLCV[]): ApexDirectionResult {
  const base = apexBreakoutEngine(ind, price, candles);
  if (!base.engineActive) return base;
  // EMA50 direction lock: reject breakout signals that conflict with EMA50 bias
  if (ind.ema50 !== null) {
    if (base.score > 0 && price < ind.ema50) {
      return { score: 0, bullets: [`Bullish breakout but price below EMA50 (${ind.ema50.toFixed(2)}) — direction lock blocked`], engineActive: false };
    }
    if (base.score < 0 && price > ind.ema50) {
      return { score: 0, bullets: [`Bearish breakout but price above EMA50 (${ind.ema50.toFixed(2)}) — direction lock blocked`], engineActive: false };
    }
  }
  return base;
}

function apexDirectionEnginePlus(ind: Indicators, price: number, candles: OHLCV[], regime: ApexRegime, vwap: number | null): ApexDirectionResult {
  switch (regime) {
    case "strong_trend":   return apexTrendEngine(ind, price, candles, vwap, true);
    case "weak_trend":     return apexTrendEngine(ind, price, candles, vwap, false);
    case "ranging":        return apexRangeEnginePlus(ind, price, candles, vwap);
    case "volatile_break": return apexBreakoutEnginePlus(ind, price, candles);
    default:               return { score: 0, bullets: ["Chaotic market — no trade conditions"], engineActive: false };
  }
}

function strategyAPEXPlus(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
  htfCandles: OHLCV[],
  crossAssetCandles: OHLCV[] | null,
  crossAssetInverse: boolean,
): ApexResult {
  const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
  const regime = classifyRegimeAPEX(ind.adx, atrPct, ind.bbWidth);
  const persistence = estimateRegimePersistence(ind.adx, atrPct, regime);
  const vwap = calcVwap(candles);
  const { score: dirScore, bullets: dirBullets, engineActive } = apexDirectionEnginePlus(ind, price, candles, regime, vwap);

  const closes = candles.map(c => c.close);
  const rsiSeries = calcRsiSeries(closes);
  const divergence = detectDivergence(candles, rsiSeries);

  // S7+: HTF 2-bar persistence — both bars must confirm direction
  let htfAlignment: "confirmed" | "neutral" | "blocked" = "neutral";
  if (htfCandles.length >= 32) {
    const htfInd1 = calculateIndicators(htfCandles);
    const htfPrice1 = htfCandles[htfCandles.length - 1].close;
    const htfAtrPct1 = htfInd1.atr ? (htfInd1.atr / htfPrice1) * 100 : 2;
    const htfRegime1 = classifyRegimeAPEX(htfInd1.adx, htfAtrPct1, htfInd1.bbWidth);
    const { score: htfScore1 } = apexDirectionEngine(htfInd1, htfPrice1, htfCandles, htfRegime1, calcVwap(htfCandles));

    const htfSlice2 = htfCandles.slice(0, -1);
    const htfInd2 = calculateIndicators(htfSlice2);
    const htfPrice2 = htfSlice2[htfSlice2.length - 1].close;
    const htfAtrPct2 = htfInd2.atr ? (htfInd2.atr / htfPrice2) * 100 : 2;
    const htfRegime2 = classifyRegimeAPEX(htfInd2.adx, htfAtrPct2, htfInd2.bbWidth);
    const { score: htfScore2 } = apexDirectionEngine(htfInd2, htfPrice2, htfSlice2, htfRegime2, null);

    const bothBull = htfScore1 > 0.3 && htfScore2 > 0.3 && dirScore > 0.1;
    const bothBear = htfScore1 < -0.3 && htfScore2 < -0.3 && dirScore < -0.1;
    const conflictUp = (htfScore1 > 0.3 || htfScore2 > 0.3) && dirScore < -0.2;
    const conflictDn = (htfScore1 < -0.3 || htfScore2 < -0.3) && dirScore > 0.2;

    if (bothBull || bothBear) htfAlignment = "confirmed";
    else if (conflictUp || conflictDn) htfAlignment = "blocked";
  }

  // Cross-asset with expanded pairs map
  let crossAssetMatch: "confirms" | "contradicts" | "na" = "na";
  if (crossAssetCandles && crossAssetCandles.length >= 30) {
    const xInd = calculateIndicators(crossAssetCandles);
    const xPrice = crossAssetCandles[crossAssetCandles.length - 1].close;
    const xAtrPct = xInd.atr ? (xInd.atr / xPrice) * 100 : 2;
    const xRegime = classifyRegimeAPEX(xInd.adx, xAtrPct, xInd.bbWidth);
    const { score: xRaw } = apexDirectionEngine(xInd, xPrice, crossAssetCandles, xRegime, null);
    const xScore = crossAssetInverse ? -xRaw : xRaw;
    if ((xScore > 0.2 && dirScore > 0) || (xScore < -0.2 && dirScore < 0)) crossAssetMatch = "confirms";
    else if ((xScore > 0.2 && dirScore < 0) || (xScore < -0.2 && dirScore > 0)) crossAssetMatch = "contradicts";
  }

  const volSma = calcVolumeSma(candles);
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const volRatio = volSma && volSma > 0 ? currentVol / volSma : 1;

  const { score: quality, bullets: qualBullets } = buildQualityScore(regime, persistence, htfAlignment, divergence, volRatio, crossAssetMatch);

  const thresholds: Record<ApexRegime, number> = {
    strong_trend: 0.45, weak_trend: 0.65, ranging: 0.55, volatile_break: 0.60, chaotic: 999,
  };
  const threshold = thresholds[regime];
  const tradeable = quality >= 60 && htfAlignment !== "blocked" && engineActive && regime !== "chaotic";
  const qualityMult = quality >= 90 ? 1.0 : quality >= 75 ? 0.85 : quality >= 60 ? 0.65 : 0;
  const regimeMults: Record<ApexRegime, number> = {
    strong_trend: 1.0, volatile_break: 0.6, ranging: 0.75, weak_trend: 0.5, chaotic: 0,
  };
  const positionRiskPct = Math.round(qualityMult * regimeMults[regime] * 100) / 100;

  const bullets = [
    `APEX+ ${regime} (ADX ${ind.adx?.toFixed(1) ?? "N/A"}, ATR ${atrPct.toFixed(1)}%) — quality ${quality}/100${tradeable ? "" : " ⚠ below threshold"}`,
    ...dirBullets.slice(0, 3),
    ...qualBullets.slice(0, 2),
  ].slice(0, 6);

  return { score: tradeable ? dirScore : 0, bullets, quality, regime, htfAlignment, positionRiskPct, tradeable, threshold };
}

// ── S8+ (Ensemble Plus) ───────────────────────────────────────────────────────

function strategyEnsemblePlus(
  ind: Indicators,
  price: number,
  candles: OHLCV[],
  htfCandles: OHLCV[],
  crossAssetCandles: OHLCV[] | null,
  crossAssetInverse: boolean,
): EnsembleResult {
  const r7 = strategyAPEXPlus(ind, price, candles, htfCandles, crossAssetCandles, crossAssetInverse);
  const regime = r7.regime;

  if (regime === "chaotic") {
    return { score: 0, bullets: ["Chaotic market — ensemble+ suspended"], regime, apexResult: r7, agreementCount: 0 };
  }

  const weights = REGIME_WEIGHTS[regime];

  // S4 vote
  const r4 = strategyS4Plus(ind, price, candles);
  const s4dir = scoreToSignalS4Plus(r4.score, r4.regimeType);

  // S5 vote — share S7+'s regime to reduce artificial disagreement
  const r5raw = strategyS5Plus(ind, price, candles);
  const s5dir: SignalDirection = r5raw.score > r5raw.threshold ? "BUY" : r5raw.score < -r5raw.threshold ? "SELL" : "HOLD";

  // S7+ vote — abstain (don't vote) when quality gate fails instead of voting HOLD
  const s7dir: SignalDirection | null = r7.tradeable
    ? (r7.score > r7.threshold ? "BUY" : r7.score < -r7.threshold ? "SELL" : "HOLD")
    : null; // null = abstain

  // Build vote list — S7 only participates when tradeable
  const votes: EnsembleVote[] = [
    { strategy: "S4", direction: s4dir, weight: weights.s4 },
    { strategy: "S5", direction: s5dir, weight: weights.s5 },
    ...(s7dir !== null ? [{ strategy: "S7", direction: s7dir, weight: weights.s7 } as EnsembleVote] : []),
  ];

  const totalVoteWeight = votes.reduce((s, v) => s + v.weight, 0);
  let buyWeight = 0, sellWeight = 0;
  const buys: string[] = [], sells: string[] = [];
  for (const v of votes) {
    if (v.direction === "BUY")  { buyWeight  += v.weight; buys.push(v.strategy); }
    if (v.direction === "SELL") { sellWeight += v.weight; sells.push(v.strategy); }
  }
  const consensus = totalVoteWeight > 0 ? (buyWeight - sellWeight) / totalVoteWeight : 0;

  const buyCount  = buys.length;
  const sellCount = sells.length;
  const totalActive = votes.length;
  const agreementCount = Math.max(buyCount, sellCount);
  const minRequired = s7dir !== null ? 2 : 2; // need 2 of however many are voting

  // S8+: differentiate position sizing — S7+any = stronger than S4+S5 only
  const s7InBuys  = buys.includes("S7");
  const s7InSells = sells.includes("S7");
  const s7Agrees  = s7InBuys || s7InSells;

  const consensusLabel = consensus > 0 ? "bullish" : consensus < 0 ? "bearish" : "mixed";

  const bullets = [
    `Ensemble+ ${regime} — ${s7dir === null ? "S7+ abstained (quality gate)" : "S7+ voted"} · ${buys.length ? buys.join("+") : "none"} buy · ${sells.length ? sells.join("+") : "none"} sell`,
    ...r7.bullets.slice(1, 3),
    agreementCount >= totalActive
      ? `All ${totalActive} active engines agree — maximum conviction`
      : agreementCount >= minRequired
        ? `${agreementCount}/${totalActive} engines ${consensusLabel}${s7Agrees ? " (includes S7+)" : " (S4+S5 only)"}`
        : "No consensus — engines disagree, standing aside",
  ].filter(Boolean).slice(0, 6) as string[];

  return { score: consensus, bullets, regime, apexResult: r7, agreementCount };
}

// S8+ position risk — weighted by which engines agree
function ensemblePlusPositionRisk(r: EnsembleResult, s7Agrees: boolean): number {
  if (r.agreementCount === 0) return 0;
  const baseRisk = r.apexResult.positionRiskPct;
  if (r.agreementCount >= 3) return baseRisk;
  if (r.agreementCount === 2 && s7Agrees) return Math.round(baseRisk * 0.70 * 100) / 100;
  if (r.agreementCount === 2) return Math.round(baseRisk * 0.50 * 100) / 100;
  return 0;
}

// ── S9+ ───────────────────────────────────────────────────────────────────────

function strategyS9Plus(candles: OHLCV[], ind: Indicators, price: number, tf: string): S9Result {
  // S9+: extended lookbacks — sweep 20 bars (was 10), Fib over 50 bars (was 20)
  const bullets: string[] = [];
  const n = candles.length;
  const SWEEP_LB_PLUS = 20;
  const FIB_LB_PLUS   = 50;
  if (n < FIB_LB_PLUS + SWEEP_LB_PLUS + 2) {
    return { score: 0, bullets: ["Insufficient candle data for S9+"], swingHigh: price, swingLow: price };
  }

  const cur = candles[n - 1];

  const bypassSession  = tf === "1w" || tf === "1d" || tf === "4h" || tf === "backtest";
  const londonActive   = !bypassSession && isLondonKZ(cur.time);
  const nyActive       = !bypassSession && isNYKZ(cur.time);
  const postNewsActive = !bypassSession && isPostNewsCZ(cur.time);
  const inSession      = bypassSession || londonActive || nyActive || postNewsActive;
  const sessionLabel   = londonActive ? "London Kill Zone" : nyActive ? "New York Kill Zone"
    : postNewsActive ? "Post-News Continuation" : bypassSession ? "session gate bypassed" : "off-session";

  // Liquidity sweep over extended 20-bar lookback
  const lookSlice = candles.slice(n - SWEEP_LB_PLUS - 1, n - 1);
  const prevLow  = Math.min(...lookSlice.map(c => c.low));
  const prevHigh = Math.max(...lookSlice.map(c => c.high));

  const bullSweep = cur.low < prevLow  && cur.close > prevLow;
  const bearSweep = cur.high > prevHigh && cur.close < prevHigh;

  const ema9 = ind.ema9;
  const range   = cur.high - cur.low;
  const body    = Math.abs(cur.close - cur.open);
  const bodyPct = range > 0 ? body / range : 0;
  const bodyThreshold = tf === "backtest" ? 0.5 : 0.6;
  const bullPower = bodyPct > bodyThreshold && cur.close > cur.open && ema9 !== null && cur.close > ema9;
  const bearPower = bodyPct > bodyThreshold && cur.close < cur.open && ema9 !== null && cur.close < ema9;

  // Fibonacci POI over extended 50-bar lookback
  const fibSlice = candles.slice(n - FIB_LB_PLUS, n);
  const swingHigh = Math.max(...fibSlice.map(c => c.high));
  const swingLow  = Math.min(...fibSlice.map(c => c.low));
  const fibRange  = swingHigh - swingLow;

  const poiLongLow   = swingLow  + fibRange * 0.44;
  const poiLongHigh  = swingLow  + fibRange * 0.618;
  const poiShortLow  = swingHigh - fibRange * 0.618;
  const poiShortHigh = swingHigh - fibRange * 0.44;

  const nearFibLong  = price >= poiLongLow  * 0.998 && price <= poiLongHigh  * 1.002;
  const nearFibShort = price >= poiShortLow * 0.998 && price <= poiShortHigh * 1.002;

  const backtestMode = tf === "backtest";
  const longSignal  = bullSweep && inSession && bullPower && (backtestMode || nearFibLong);
  const shortSignal = bearSweep && inSession && bearPower && (backtestMode || nearFibShort);

  if (longSignal) {
    bullets.push(`Bullish sweep below ${prevLow.toFixed(3)} (${SWEEP_LB_PLUS}-bar range) — stop hunt confirmed`);
    bullets.push(`${sessionLabel} active`);
    bullets.push(`Power candle: body ${(bodyPct * 100).toFixed(0)}% of range, above 9 EMA (${ema9!.toFixed(3)})`);
    bullets.push(`In 44–61.8% POI zone (${FIB_LB_PLUS}-bar Fib: ${poiLongLow.toFixed(3)}–${poiLongHigh.toFixed(3)})`);
    bullets.push("S9+: deeper liquidity levels, wider Fib structure — more significant sweep");
    return { score: 1.0, bullets, swingHigh, swingLow };
  }

  if (shortSignal) {
    bullets.push(`Bearish sweep above ${prevHigh.toFixed(3)} (${SWEEP_LB_PLUS}-bar range) — stop hunt confirmed`);
    bullets.push(`${sessionLabel} active`);
    bullets.push(`Power candle: body ${(bodyPct * 100).toFixed(0)}% of range, below 9 EMA (${ema9!.toFixed(3)})`);
    bullets.push(`In 44–61.8% POI zone from top (${FIB_LB_PLUS}-bar Fib: ${poiShortLow.toFixed(3)}–${poiShortHigh.toFixed(3)})`);
    bullets.push("S9+: deeper liquidity levels, wider Fib structure — more significant sweep");
    return { score: -1.0, bullets, swingHigh, swingLow };
  }

  if (bullSweep) bullets.push(`Bullish sweep (${SWEEP_LB_PLUS}-bar) below ${prevLow.toFixed(3)} — awaiting ${!inSession ? "session + " : ""}${!bullPower ? "power candle + " : ""}${!nearFibLong ? "POI zone" : "entry"}`);
  else if (bearSweep) bullets.push(`Bearish sweep (${SWEEP_LB_PLUS}-bar) above ${prevHigh.toFixed(3)} — awaiting ${!inSession ? "session + " : ""}${!bearPower ? "power candle + " : ""}${!nearFibShort ? "POI zone" : "entry"}`);
  else bullets.push(`No sweep on current bar (${SWEEP_LB_PLUS}-bar range: ${prevLow.toFixed(3)}–${prevHigh.toFixed(3)})`);
  if (!inSession && !bypassSession) bullets.push(`Outside kill zones — ${sessionLabel}`);
  if (ema9 !== null) bullets.push(`9 EMA: ${ema9.toFixed(3)} — price ${price > ema9 ? "above" : "below"}`);

  return { score: 0, bullets, swingHigh, swingLow };
}

// ─────────────────────────────────────────────────────────────────────────────

function scoreToConfidence(score: number): number {
  const abs = Math.abs(score);
  // Maps 0..1 → 50..95
  return Math.round(50 + abs * 45);
}

function atrPercentile(candles: OHLCV[], currentAtr: number): number {
  const atrs = candles.slice(1).map((c, i) => {
    const hl = c.high - c.low;
    const hpc = Math.abs(c.high - candles[i].close);
    const lpc = Math.abs(c.low - candles[i].close);
    return Math.max(hl, hpc, lpc);
  });
  const below = atrs.filter(a => a <= currentAtr).length;
  return below / atrs.length;
}

function buildRiskLevels(
  direction: SignalDirection,
  price: number,
  atr: number | null,
  ivPct = 0.5,
): { stopLoss: number; takeProfit: number; riskReward: number; ivFlag: string | null } {
  const base = atr ?? price * 0.02;
  const slMult = ivPct > 0.75 ? 2.0 : ivPct < 0.25 ? 1.1 : 1.5;
  const tpMult = slMult * 2.5;
  const risk = base * slMult;
  const reward = base * tpMult;
  const sl = direction === "BUY" ? price - risk : price + risk;
  const tp = direction === "BUY" ? price + reward : price - reward;
  const ivFlag = ivPct > 0.75
    ? `High volatility (${Math.round(ivPct * 100)}th pct) — SL widened to reduce noise stops`
    : ivPct < 0.25
      ? `Low volatility (${Math.round(ivPct * 100)}th pct) — tight SL, watch for expansion`
      : null;
  return {
    stopLoss: Math.round(sl * 10000) / 10000,
    takeProfit: Math.round(tp * 10000) / 10000,
    riskReward: Math.round((tpMult / slMult) * 100) / 100,
    ivFlag,
  };
}

function buildRiskLevelsS9(
  direction: SignalDirection,
  price: number,
  swingHigh: number,
  swingLow: number,
  atr: number | null,
): { stopLoss: number; takeProfit: number; riskReward: number; tp2: number } {
  const fibRange = swingHigh - swingLow;
  const atrBuf   = atr ?? fibRange * 0.05;

  // SL just beyond the sweep extreme (0.5 ATR buffer)
  const sl = direction === "BUY"
    ? Math.round((swingLow  - atrBuf * 0.5) * 10000) / 10000
    : Math.round((swingHigh + atrBuf * 0.5) * 10000) / 10000;

  // TP1 = 0.272 extension (first scalp target), TP2 = 0.618 extension (runner)
  const tp1 = direction === "BUY"
    ? Math.round((swingHigh + fibRange * 0.272) * 10000) / 10000
    : Math.round((swingLow  - fibRange * 0.272) * 10000) / 10000;
  const tp2 = direction === "BUY"
    ? Math.round((swingHigh + fibRange * 0.618) * 10000) / 10000
    : Math.round((swingLow  - fibRange * 0.618) * 10000) / 10000;

  const risk   = Math.abs(price - sl);
  const reward = Math.abs(tp1  - price);
  return {
    stopLoss:   sl,
    takeProfit: tp1,
    riskReward: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
    tp2,
  };
}

async function generateSignal(
  symbol: string,
  tf: Timeframe,
  strategy: StrategyId,
  newsSentiment = 0,
  bypassCache = false,
  newsArticles: NewsArticle[] = [],
  htfCandles: OHLCV[] = [],
  crossAssetCandles: OHLCV[] | null = null,
  crossAssetInverse = false,
): Promise<SignalResult | null> {
  const cacheKey = `${symbol}|${tf}|${strategy}`;
  const cached = signalCache.get(cacheKey);
  if (!bypassCache && cached && Date.now() - cached.ts < SIGNAL_TTL) return cached.data;

  const candles = await fetchHistory(symbol, tf);
  if (candles.length < 30) return null;

  const ind = calculateIndicators(candles);
  const currentPrice = latestPrices.get(symbol)?.price ?? candles[candles.length - 1].close;
  const atrPct = ind.atr ? (ind.atr / currentPrice) * 100 : 2;

  let score: number;
  let bullets: string[];
  let s5threshold = 0.25;
  let apexQuality = 0;
  let apexRegime: ApexRegime = "weak_trend";
  let apexHtfAlignment: "confirmed" | "neutral" | "blocked" = "neutral";
  let apexPositionRisk = 0;
  let apexTradeable = false;
  let apexThreshold = 0.25;
  let s9SwingHigh = currentPrice;
  let s9SwingLow  = currentPrice;

  if (strategy === "1") {
    ({ score, bullets } = strategyS1(ind, currentPrice));
  } else if (strategy === "2") {
    ({ score, bullets } = strategyS2(ind, currentPrice, atrPct));
  } else if (strategy === "4") {
    ({ score, bullets } = strategyS4(ind, currentPrice, candles));
  } else if (strategy === "5") {
    const r = strategyS5(ind, currentPrice, candles);
    score = r.score; bullets = r.bullets; s5threshold = r.threshold;
  } else if (strategy === "6") {
    ({ score, bullets } = strategyS6(ind, currentPrice, candles, newsArticles));
  } else if (strategy === "7") {
    const r = strategyAPEX(ind, currentPrice, candles, htfCandles, crossAssetCandles, crossAssetInverse);
    score = r.tradeable ? r.score : 0;
    bullets = r.bullets;
    apexQuality = r.quality; apexRegime = r.regime; apexHtfAlignment = r.htfAlignment;
    apexPositionRisk = r.positionRiskPct; apexTradeable = r.tradeable; apexThreshold = r.threshold;
  } else if (strategy === "8") {
    const r = strategyEnsemble(ind, currentPrice, candles, htfCandles, crossAssetCandles, crossAssetInverse);
    score = r.agreementCount >= 2 ? r.score : 0;
    bullets = r.bullets;
    apexQuality = r.apexResult.quality; apexRegime = r.regime; apexHtfAlignment = r.apexResult.htfAlignment;
    apexPositionRisk = Math.round(r.apexResult.positionRiskPct * (r.agreementCount === 3 ? 1.0 : 0.6) * 100) / 100;
    apexTradeable = r.agreementCount >= 2;
    apexThreshold = 0.40;
  } else if (strategy === "9") {
    const r9 = strategyS9(candles, ind, currentPrice, tf);
    score = r9.score; bullets = r9.bullets;
    s9SwingHigh = r9.swingHigh; s9SwingLow = r9.swingLow;
  // ── Enhanced strategies S1+–S9+ ──────────────────────────────────────────
  } else if (strategy === "10") {
    ({ score, bullets } = strategyS1Plus(ind, currentPrice, candles));
  } else if (strategy === "11") {
    ({ score, bullets } = strategyS2Plus(ind, currentPrice, candles));
  } else if (strategy === "12") {
    ({ score, bullets } = strategyS3Plus(ind, currentPrice, candles, newsArticles));
  } else if (strategy === "13") {
    const r = strategyS4Plus(ind, currentPrice, candles);
    score = r.score; bullets = r.bullets;
    // Store regime so direction dispatch can pick the right threshold
    apexRegime = r.regimeType === "trend" || r.regimeType === "weak_trend" ? "strong_trend"
      : r.regimeType === "mr" ? "ranging" : "weak_trend";
  } else if (strategy === "14") {
    const r = strategyS5Plus(ind, currentPrice, candles);
    score = r.score; bullets = r.bullets; s5threshold = r.threshold;
  } else if (strategy === "15") {
    ({ score, bullets } = strategyS6Plus(ind, currentPrice, candles, newsArticles));
  } else if (strategy === "16") {
    const r = strategyAPEXPlus(ind, currentPrice, candles, htfCandles, crossAssetCandles, crossAssetInverse);
    score = r.tradeable ? r.score : 0;
    bullets = r.bullets;
    apexQuality = r.quality; apexRegime = r.regime; apexHtfAlignment = r.htfAlignment;
    apexPositionRisk = r.positionRiskPct; apexTradeable = r.tradeable; apexThreshold = r.threshold;
  } else if (strategy === "17") {
    const r = strategyEnsemblePlus(ind, currentPrice, candles, htfCandles, crossAssetCandles, crossAssetInverse);
    const s7Agrees = r.apexResult.tradeable;
    score = r.agreementCount >= 2 ? r.score : 0;
    bullets = r.bullets;
    apexQuality = r.apexResult.quality; apexRegime = r.regime; apexHtfAlignment = r.apexResult.htfAlignment;
    apexPositionRisk = ensemblePlusPositionRisk(r, s7Agrees);
    apexTradeable = r.agreementCount >= 2;
    apexThreshold = 0.38;
  } else if (strategy === "18") {
    const r9 = strategyS9Plus(candles, ind, currentPrice, tf);
    score = r9.score; bullets = r9.bullets;
    s9SwingHigh = r9.swingHigh; s9SwingLow = r9.swingLow;
  } else {
    const { score: s1, bullets: b1 } = strategyS1(ind, currentPrice);
    ({ score, bullets } = strategyS3(s1, newsSentiment, b1));
  }

  // S4+ uses its own regime-aware threshold dispatch
  const isS4Plus = strategy === "13";
  const s4PlusRegime: S4PlusRegime =
    apexRegime === "ranging" ? "mr" : apexRegime === "strong_trend" ? "trend" : isS4Plus ? "weak_trend" : "trend";

  // VIX-adaptive threshold for S5/S14: calm markets → lower bar; stress → higher conviction required
  const vixNow = latestPrices.get("^VIX")?.price ?? null;
  if (vixNow !== null && (strategy === "5" || strategy === "14")) {
    const adj = vixNow < 15 ? -0.05 : vixNow > 30 ? 0.10 : 0;
    s5threshold = Math.max(0.05, Math.min(0.95, s5threshold + adj));
  }

  const direction =
    isS4Plus ? scoreToSignalS4Plus(score, s4PlusRegime) :
    strategy === "4" ? scoreToSignalS4(score) :
    strategy === "5" || strategy === "14" ? (score > s5threshold ? "BUY" : score < -s5threshold ? "SELL" : "HOLD") :
    strategy === "6"  ? (score > 0.45 ? "BUY" : score < -0.35 ? "SELL" : "HOLD") :
    strategy === "15" ? (score > 0.45 ? "BUY" : score < -0.35 ? "SELL" : "HOLD") :
    (strategy === "7" || strategy === "8" || strategy === "16" || strategy === "17") ? (score > apexThreshold ? "BUY" : score < -apexThreshold ? "SELL" : "HOLD") :
    strategy === "9" || strategy === "18" ? (score > 0.5 ? "BUY" : score < -0.5 ? "SELL" : "HOLD") :
    scoreToSignal(score);

  const isApexFamily = strategy === "5" || strategy === "6" || strategy === "7" || strategy === "8" || strategy === "14" || strategy === "15" || strategy === "16" || strategy === "17";
  const confidence = isApexFamily ? calibrateConfidenceS5(Math.abs(score)) : scoreToConfidence(score);
  const ivPct = ind.atr ? atrPercentile(candles.slice(-20), ind.atr) : 0.5;
  let stopLoss: number, takeProfit: number, riskReward: number;
  let ivFlag: string | null = null;
  if (strategy === "7" || strategy === "8" || strategy === "16" || strategy === "17") {
    ({ stopLoss, takeProfit, riskReward } = buildRiskLevelsAPEX(direction, currentPrice, ind.atr, apexRegime));
  } else if (strategy === "9" || strategy === "18") {
    const r9Risk = buildRiskLevelsS9(direction, currentPrice, s9SwingHigh, s9SwingLow, ind.atr);
    ({ stopLoss, takeProfit, riskReward } = r9Risk);
    if (direction !== "HOLD") {
      bullets.push(`TP2 runner: ${r9Risk.tp2.toFixed(3)} (0.618 extension)`);
    }
  } else {
    ({ stopLoss, takeProfit, riskReward, ivFlag } = buildRiskLevels(direction, currentPrice, ind.atr, ivPct));
  }
  if (ivFlag) bullets.push(ivFlag);

  const isLongForm = ["3","5","6","7","8","9","12","14","15","16","17","18"].includes(strategy);
  const isApexMeta = strategy === "7" || strategy === "8" || strategy === "16" || strategy === "17";

  const result: SignalResult = {
    symbol,
    name: ASSET_MAP.get(symbol)?.name ?? symbol,
    direction,
    confidence,
    entry: Math.round(currentPrice * 10000) / 10000,
    stopLoss,
    takeProfit,
    riskReward,
    reasoning: bullets.slice(0, isLongForm ? 6 : 5),
    indicators: ind,
    strategy,
    timeframe: tf,
    timestamp: new Date().toISOString(),
    ivPercentile: Math.round(ivPct * 1000) / 1000,
    ...(isApexMeta ? { quality: apexQuality, apexRegime, positionRiskPct: apexPositionRisk, htfAlignment: apexHtfAlignment, tradeable: apexTradeable } : {}),
    vixAtSignal: vixNow,
    ...(strategy === "5" || strategy === "14" ? { dynamicThreshold: Math.round(s5threshold * 1000) / 1000 } : {}),
  };

  signalCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ─── Backtest Engine ──────────────────────────────────────────────────────────

interface TradeRecord {
  n: number;
  date: string;                      // YYYY-MM-DD of entry bar
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number;
  exitReason: "SL" | "TP" | "TIMEOUT";
  holdBars: number;
  returnPct: number;
  win: boolean;
}

interface StrategyPerf {
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  trades: number;
  tradeLog: TradeRecord[];
}

type AllBacktestId = BaseStrategyId | EnhancedStrategyId;

interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  strategies: Record<AllBacktestId, StrategyPerf>;
  backtestNotes: Partial<Record<AllBacktestId, string>>;
  timestamp: string;
}

const backtestCache = new Map<string, { data: BacktestResult; ts: number }>();
const BACKTEST_TTL = 10 * 60_000;

// ── Old fixed-hold engine — kept for any scanner backtest callers ─────────────
function runBacktestOnSeries(closes: number[], strategyFn: (i: number) => SignalDirection, splitRatio = 0.7): StrategyPerf {
  const splitIdx = Math.floor(closes.length * splitRatio);
  const testCloses = closes.slice(splitIdx);
  if (testCloses.length < 10) {
    return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  }
  let wins = 0, totalTrades = 0;
  const returns: number[] = [];
  let peak = 1, equity = 1, maxDrawdown = 0;
  const tradeLog: TradeRecord[] = [];
  const HOLD_BARS = 5;
  for (let i = 0; i < testCloses.length - HOLD_BARS; i++) {
    const sig = strategyFn(splitIdx + i);
    if (sig === "HOLD") continue;
    const entry = testCloses[i];
    const exit = testCloses[i + HOLD_BARS];
    const ret = sig === "BUY" ? (exit - entry) / entry : (entry - exit) / entry;
    returns.push(ret); totalTrades++; if (ret > 0) wins++;
    equity *= 1 + ret;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
    tradeLog.push({ n: totalTrades, date: "", direction: sig, entryPrice: Math.round(entry * 10000) / 10000, stopLoss: 0, takeProfit: 0, exitPrice: Math.round(exit * 10000) / 10000, exitReason: ret > 0 ? "TP" : "SL", holdBars: HOLD_BARS, returnPct: Math.round(ret * 10000) / 100, win: ret > 0 });
  }
  if (totalTrades === 0) return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdRet = returns.length > 1 ? Math.sqrt(returns.reduce((a, b) => a + (b - avgRet) ** 2, 0) / (returns.length - 1)) : 0;
  const sharpe = stdRet > 0 ? (avgRet / stdRet) * Math.sqrt(252) : 0;
  return { winRate: Math.round((wins / totalTrades) * 1000) / 10, totalReturn: Math.round((equity - 1) * 10000) / 100, maxDrawdown: Math.round(maxDrawdown * 10000) / 100, sharpe: Math.round(sharpe * 100) / 100, trades: totalTrades, tradeLog };
}

// ── SL/TP-aware backtest engine ───────────────────────────────────────────────
// Each strategy supplies the same SL/TP it would use in production.
// Exits are triggered bar-by-bar using candle highs and lows — not a fixed hold.
// Sharpe is annualised correctly per timeframe.

interface BacktestEntry {
  direction: "BUY" | "SELL";
  stopLoss: number;
  takeProfit: number;
}

function btAnnFactor(tf: Timeframe): number {
  switch (tf) {
    case "1w": return 52;
    case "1d": return 252;
    case "4h": return 252 * 6;
    case "1h": return Math.round(252 * 6.5);
    case "5m": return 252 * 78;
    case "1m": return 252 * 390;
    default:   return 252;
  }
}

function btMaxHold(tf: Timeframe): number {
  switch (tf) {
    case "1w": return 8;    // ~2 months
    case "1d": return 20;   // ~4 trading weeks
    case "4h": return 30;   // ~5 trading days
    case "1h": return 48;   // ~2 trading days
    case "5m": return 60;   // ~5 hours
    case "1m": return 60;   // ~1 hour
    default:   return 20;
  }
}

function runBacktestWithSLTP(
  candles: OHLCV[],
  getEntry: (i: number) => BacktestEntry | null,
  splitRatio: number,
  tf: Timeframe,
): StrategyPerf {
  const splitIdx = Math.floor(candles.length * splitRatio);
  const testCandles = candles.slice(splitIdx);
  const maxHold = btMaxHold(tf);

  if (testCandles.length < 10) {
    return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  }

  let wins = 0, totalTrades = 0;
  const returns: number[] = [];
  let peak = 1, equity = 1, maxDrawdown = 0;
  const tradeLog: TradeRecord[] = [];

  for (let i = 0; i < testCandles.length - 1; i++) {
    const entry = getEntry(splitIdx + i);
    if (!entry) continue;

    const { direction, stopLoss, takeProfit } = entry;
    const entryBar = testCandles[i];
    const entryPrice = entryBar.close;
    const date = new Date((entryBar.time as number) * 1000).toISOString().split('T')[0];

    // Default exit: close of last hold bar (timeout — neither SL nor TP hit)
    let exitPrice = testCandles[Math.min(i + maxHold, testCandles.length - 1)].close;
    let exitReason: "SL" | "TP" | "TIMEOUT" = "TIMEOUT";
    let holdBars = Math.min(maxHold, testCandles.length - 1 - i);

    for (let j = i + 1; j <= Math.min(i + maxHold, testCandles.length - 1); j++) {
      const bar = testCandles[j];
      if (direction === "BUY") {
        const slHit = bar.low  <= stopLoss;
        const tpHit = bar.high >= takeProfit;
        if (slHit || tpHit) {
          // Both in same bar → conservative: assume SL first
          exitPrice  = (tpHit && !slHit) ? takeProfit : stopLoss;
          exitReason = (tpHit && !slHit) ? "TP" : "SL";
          holdBars = j - i;
          break;
        }
      } else {
        const slHit = bar.high >= stopLoss;
        const tpHit = bar.low  <= takeProfit;
        if (slHit || tpHit) {
          exitPrice  = (tpHit && !slHit) ? takeProfit : stopLoss;
          exitReason = (tpHit && !slHit) ? "TP" : "SL";
          holdBars = j - i;
          break;
        }
      }
    }

    const ret = direction === "BUY"
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;

    returns.push(ret); totalTrades++; if (ret > 0) wins++;
    equity *= 1 + ret;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
    tradeLog.push({
      n: totalTrades,
      date,
      direction,
      entryPrice:  Math.round(entryPrice  * 10000) / 10000,
      stopLoss:    Math.round(stopLoss    * 10000) / 10000,
      takeProfit:  Math.round(takeProfit  * 10000) / 10000,
      exitPrice:   Math.round(exitPrice   * 10000) / 10000,
      exitReason,
      holdBars,
      returnPct:   Math.round(ret * 10000) / 100,
      win: ret > 0,
    });
  }

  if (totalTrades === 0) {
    return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  }

  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdRet = returns.length > 1
    ? Math.sqrt(returns.reduce((a, b) => a + (b - avgRet) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdRet > 0 ? (avgRet / stdRet) * Math.sqrt(btAnnFactor(tf)) : 0;

  // Stats are computed over the full history; trade log is trimmed to the past 1 year for display.
  const oneYearAgoStr = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const displayLog = tradeLog.filter(t => !t.date || t.date >= oneYearAgoStr);

  return {
    winRate:      Math.round((wins / totalTrades) * 1000) / 10,
    totalReturn:  Math.round((equity - 1) * 10000) / 100,
    maxDrawdown:  Math.round(maxDrawdown * 10000) / 100,
    sharpe:       Math.round(sharpe * 100) / 100,
    trades:       totalTrades,
    tradeLog:     displayLog,
  };
}

async function runBacktest(symbol: string, tf: Timeframe): Promise<BacktestResult | null> {
  const cacheKey = `${symbol}|${tf}|v18`;
  const cached = backtestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BACKTEST_TTL) return cached.data;

  const candles = await fetchHistoryBt(symbol, tf);
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const inds: Indicators[] = [];
  const WARMUP = 30;

  for (let i = WARMUP; i <= closes.length; i++) {
    inds.push(calculateIndicators(candles.slice(0, i)));
  }

  // ── S7/S8: Pre-fetch HTF + cross-asset candles once, then timestamp-align per bar ──
  // HTF: one timeframe above the backtest TF (none for daily — daily is already top).
  // Cross-asset: correlated asset at the same TF, aligned by Unix timestamp.
  // Both are fetched in parallel before the per-bar loop to avoid per-bar I/O.
  const BT_HTF_MAP: Record<Timeframe, Timeframe | null> = {
    "1m": "1h", "5m": "1h", "1h": "4h", "4h": "1d", "1d": null, "1w": null,
  };
  const htfTf = BT_HTF_MAP[tf];
  const crossPair = CROSS_ASSET_PAIRS[symbol];
  const [htfAllCandles, crossAllCandles] = await Promise.all([
    htfTf ? fetchHistoryBt(symbol, htfTf) : Promise.resolve([] as OHLCV[]),
    crossPair ? fetchHistoryBt(crossPair.symbol, tf) : Promise.resolve(null as OHLCV[] | null),
  ]);

  // Returns { direction, stopLoss, takeProfit } using the same builders as live signals.
  // Returns null for HOLD (no trade this bar).
  const getEntry = (i: number, strat: StrategyId): BacktestEntry | null => {
    const idx = i - WARMUP;
    if (idx < 0 || idx >= inds.length) return null;
    const ind = inds[idx];
    if (!ind) return null;
    const price = closes[i];
    const candleSlice = candles.slice(0, i + 1);
    const ivPct = ind.atr ? atrPercentile(candleSlice.slice(-20), ind.atr) : 0.5;

    let direction: SignalDirection;
    let sl: number, tp: number;

    if (strat === "1") {
      direction = scoreToSignal(scoreIndicators(ind, price).score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "2") {
      const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
      direction = scoreToSignal(strategyS2(ind, price, atrPct).score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "3") {
      // No historical news — fallback to S1 signal; SL/TP from live builder
      direction = scoreToSignal(scoreIndicators(ind, price).score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "4") {
      const { score } = strategyS4(ind, price, candleSlice);
      direction = scoreToSignalS4(score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "5") {
      const r5 = strategyS5(ind, price, candleSlice);
      direction = r5.score > r5.threshold ? "BUY" : r5.score < -r5.threshold ? "SELL" : "HOLD";
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "6") {
      // No historical news — S2 signal with S6 asymmetric thresholds; live SL/TP
      const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
      const { score } = strategyS2(ind, price, atrPct);
      direction = score > 0.45 ? "BUY" : score < -0.35 ? "SELL" : "HOLD";
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "7" || strat === "8" || strat === "16" || strat === "17") {
      // Timestamp-align HTF and cross-asset to current bar — no lookahead.
      const curTime = candles[i].time;
      const htfSlice  = htfAllCandles.filter(c => c.time <= curTime);
      const crossSlice = crossAllCandles ? crossAllCandles.filter(c => c.time <= curTime) : null;
      const crossInverse = crossPair?.inverse ?? false;

      if (strat === "7") {
        const r7 = strategyAPEX(ind, price, candleSlice, htfSlice, crossSlice, crossInverse);
        direction = r7.tradeable && r7.score > r7.threshold ? "BUY"
          : r7.tradeable && r7.score < -r7.threshold ? "SELL" : "HOLD";
        const rl = buildRiskLevelsAPEX(direction, price, ind.atr, r7.regime);
        sl = rl.stopLoss; tp = rl.takeProfit;
      } else if (strat === "8") {
        const r8 = strategyEnsemble(ind, price, candleSlice, htfSlice, crossSlice, crossInverse);
        direction = r8.agreementCount >= 2 && r8.score > 0.40 ? "BUY"
          : r8.agreementCount >= 2 && r8.score < -0.40 ? "SELL" : "HOLD";
        const rl = buildRiskLevelsAPEX(direction, price, ind.atr, r8.regime);
        sl = rl.stopLoss; tp = rl.takeProfit;
      } else if (strat === "16") {
        const r16 = strategyAPEXPlus(ind, price, candleSlice, htfSlice, crossSlice, crossInverse);
        direction = r16.tradeable && r16.score > r16.threshold ? "BUY"
          : r16.tradeable && r16.score < -r16.threshold ? "SELL" : "HOLD";
        const rl = buildRiskLevelsAPEX(direction, price, ind.atr, r16.regime);
        sl = rl.stopLoss; tp = rl.takeProfit;
      } else {
        const r17 = strategyEnsemblePlus(ind, price, candleSlice, htfSlice, crossSlice, crossInverse);
        direction = r17.agreementCount >= 2 && r17.score > 0.38 ? "BUY"
          : r17.agreementCount >= 2 && r17.score < -0.38 ? "SELL" : "HOLD";
        const rl = buildRiskLevelsAPEX(direction, price, ind.atr, r17.regime);
        sl = rl.stopLoss; tp = rl.takeProfit;
      }
    // ── S1+–S6+ enhanced strategies ─────────────────────────────────────────
    } else if (strat === "10") {
      const { score } = strategyS1Plus(ind, price, candleSlice);
      direction = scoreToSignal(score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "11") {
      const { score } = strategyS2Plus(ind, price, candleSlice);
      direction = scoreToSignal(score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "12") {
      // No historical news — S3Plus falls back to pure S1Plus (count < 3 gate)
      const { score } = strategyS3Plus(ind, price, candleSlice, []);
      direction = scoreToSignal(score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "13") {
      const r13 = strategyS4Plus(ind, price, candleSlice);
      direction = scoreToSignalS4Plus(r13.score, r13.regimeType);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "14") {
      const r14 = strategyS5Plus(ind, price, candleSlice);
      direction = r14.score > r14.threshold ? "BUY" : r14.score < -r14.threshold ? "SELL" : "HOLD";
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else if (strat === "15") {
      // No historical news — S6Plus with empty articles falls back mostly to S2Plus
      const { score } = strategyS6Plus(ind, price, candleSlice, []);
      direction = score > 0.45 ? "BUY" : score < -0.35 ? "SELL" : "HOLD";
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    } else {
      direction = scoreToSignal(strategyS1(ind, price).score);
      const r = buildRiskLevels(direction, price, ind.atr, ivPct);
      sl = r.stopLoss; tp = r.takeProfit;
    }

    if (direction === "HOLD") return null;
    return { direction, stopLoss: sl!, takeProfit: tp! };
  };

  const strategyIds = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
  const enhancedIds = ["10", "11", "12", "13", "14", "15", "16", "17"] as const;

  const [strategyResults, enhancedResults] = await Promise.all([
    Promise.all(strategyIds.map((id) =>
      Promise.resolve(runBacktestWithSLTP(candles, (i) => getEntry(i, id), 0, tf))
    )),
    Promise.all(enhancedIds.map((id) =>
      Promise.resolve(runBacktestWithSLTP(candles, (i) => getEntry(i, id as StrategyId), 0, tf))
    )),
  ]);

  // ── S9: intraday candles with real session gates enabled on 1h bars ────────
  // Pass the actual timeframe to strategyS9 instead of "backtest".
  // On 1h bars: isLondonKZ/isNYKZ check candle.time (Unix seconds) — works on
  // historical bars. On 4h fallback: bypassSession remains true (4h bars are
  // too coarse to pinpoint a kill zone, so bypassing is still correct there).
  const S9_WARMUP = 32;
  let s9Perf: StrategyPerf = { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  const s9CandlesRaw = await fetchHistoryBt(symbol, "1h");
  const s9Candles = s9CandlesRaw.length >= 50 ? s9CandlesRaw : await fetchHistoryBt(symbol, "4h");
  const s9Tf: Timeframe = s9CandlesRaw.length >= 50 ? "1h" : "4h";
  if (s9Candles.length >= S9_WARMUP + 10) {
    const s9Closes = s9Candles.map(c => c.close);
    const s9Inds: (Indicators | null)[] = [];
    for (let i = S9_WARMUP; i < s9Candles.length; i++) {
      s9Inds.push(calculateIndicators(s9Candles.slice(0, i + 1)));
    }
    s9Perf = runBacktestWithSLTP(s9Candles, (i) => {
      const idx = i - S9_WARMUP;
      if (idx < 0 || idx >= s9Inds.length) return null;
      const ind9 = s9Inds[idx];
      if (!ind9) return null;
      const slice = s9Candles.slice(0, i + 1);
      // Use s9Tf (not "backtest") so session gates and POI zones fire on 1h bars
      const { score: s9score, swingHigh, swingLow } = strategyS9(slice, ind9, s9Closes[i], s9Tf);
      const dir: SignalDirection = s9score > 0.5 ? "BUY" : s9score < -0.5 ? "SELL" : "HOLD";
      if (dir === "HOLD") return null;
      const { stopLoss, takeProfit } = buildRiskLevelsS9(dir, s9Closes[i], swingHigh, swingLow, ind9.atr);
      return { direction: dir, stopLoss, takeProfit };
    }, 0, s9Tf);
  }

  // ── S9+: same session-gate fix as S9, extended sweep/fib lookbacks ──────────
  const S9_PLUS_WARMUP = 75; // FIB_LB_PLUS(50) + SWEEP_LB_PLUS(20) + buffer
  let s9PlusPerf: StrategyPerf = { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  if (s9Candles.length >= S9_PLUS_WARMUP + 10) {
    const s9Closes = s9Candles.map(c => c.close);
    const s9PlusInds: (Indicators | null)[] = [];
    for (let i = S9_PLUS_WARMUP; i < s9Candles.length; i++) {
      s9PlusInds.push(calculateIndicators(s9Candles.slice(0, i + 1)));
    }
    s9PlusPerf = runBacktestWithSLTP(s9Candles, (i) => {
      const idx = i - S9_PLUS_WARMUP;
      if (idx < 0 || idx >= s9PlusInds.length) return null;
      const ind9p = s9PlusInds[idx];
      if (!ind9p) return null;
      const slice = s9Candles.slice(0, i + 1);
      const { score: s9pScore, swingHigh, swingLow } = strategyS9Plus(slice, ind9p, s9Closes[i], s9Tf);
      const dir: SignalDirection = s9pScore > 0.5 ? "BUY" : s9pScore < -0.5 ? "SELL" : "HOLD";
      if (dir === "HOLD") return null;
      const { stopLoss, takeProfit } = buildRiskLevelsS9(dir, s9Closes[i], swingHigh, swingLow, ind9p.atr);
      return { direction: dir, stopLoss, takeProfit };
    }, 0, s9Tf);
  }

  const htfNote = htfTf
    ? `HTF candles (${htfTf}) and cross-asset data aligned by timestamp — full S7/S8 backtest.`
    : "Daily TF has no higher timeframe available — S7/S8 run without HTF alignment (same as live for daily signals). Cross-asset correlation still applied.";
  const s9SessionNote = s9Tf === "1h"
    ? "Session gates (London/NY kill zones) and POI zones are active — 1h bar timestamps checked against UTC session windows."
    : "Using 4h fallback — session gates bypass still applies (4h bars span multiple kill zones).";

  const strategies = {
    ...Object.fromEntries(strategyIds.map((id, idx) => [id, strategyResults[idx]])),
    "9": s9Perf,
    ...Object.fromEntries(enhancedIds.map((id, idx) => [id, enhancedResults[idx]])),
    "18": s9PlusPerf,
  } as BacktestResult["strategies"];

  const result: BacktestResult = {
    symbol,
    timeframe: tf,
    strategies,
    backtestNotes: {
      "3": "S3 backtested without live news (no historical per-bar sentiment available). Results approximate S1. Exits use live ATR-based SL/TP.",
      "6": "S6 backtested with S2 tech scores only — historical news not available. Exits use live ATR-based SL/TP.",
      "7": htfNote,
      "8": htfNote,
      "9": `S9 backtested across all intraday candles (no train/test split — no fitted parameters). ${s9SessionNote} Exits use Fibonacci SL/TP.`,
      "12": "S3+ backtested without live news — falls back to S1+ tech scoring (min 3 articles gate not met). Exits use live ATR-based SL/TP.",
      "15": "S6+ backtested with S2+ tech scores only — historical news not available. Exits use live ATR-based SL/TP.",
      "16": htfNote.replace("S7/S8", "S7+/S8+"),
      "17": htfNote.replace("S7/S8", "S7+/S8+"),
      "18": `S9+ backtested with 20-bar sweep / 50-bar Fib lookbacks across all intraday candles. ${s9SessionNote} Exits use Fibonacci SL/TP.`,
    },
    timestamp: new Date().toISOString(),
  };

  backtestCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ─── News & Sentiment ─────────────────────────────────────────────────────────

interface NewsArticle {
  title: string;
  publisher: string;
  publishedAt: string;
  url: string;
  sentiment: number;
}

interface NewsResult {
  symbol: string;
  articles: NewsArticle[];
  aggregateSentiment: number;
  timestamp: string;
}

const newsCache = new Map<string, { data: NewsResult; ts: number }>();
const NEWS_TTL = 4 * 60 * 60_000;

let _avCallsToday = 0;
let _avCallsResetAt = Date.now() + 24 * 60 * 60_000;
const AV_DAILY_LIMIT = 23;

const BULLISH_WORDS = [
  "surge", "surges", "surging", "rally", "rallies", "rallying", "rise", "rises", "rising", "rose",
  "gain", "gains", "gaining", "jump", "jumps", "jumped", "boost", "boosted", "high", "record",
  "bullish", "upside", "breakout", "buy", "upgrade", "beat", "beats", "strong", "strength",
  "recovery", "recover", "rebound", "positive", "growth", "expand", "expansion", "profit",
  "outperform", "exceed", "exceed expectations", "all-time", "momentum", "optimism", "optimistic",
];

const BEARISH_WORDS = [
  "drop", "drops", "dropping", "fall", "falls", "falling", "fell", "decline", "declines",
  "declining", "plunge", "plunges", "plunged", "crash", "crashes", "crashed", "lose", "loss",
  "losses", "sink", "sinks", "sank", "slump", "slumps", "slumped", "bearish", "downside",
  "breakdown", "sell", "downgrade", "miss", "misses", "weak", "weakness", "recession", "crisis",
  "fear", "fears", "risk", "risks", "concern", "concerns", "warning", "collapse", "collapses",
  "inflation", "rate hike", "default", "bankruptcy", "negative", "underperform",
];

function scoreSentiment(text: string): number {
  const lower = text.toLowerCase();
  let bullCount = 0;
  let bearCount = 0;
  for (const w of BULLISH_WORDS) if (lower.includes(w)) bullCount++;
  for (const w of BEARISH_WORDS) if (lower.includes(w)) bearCount++;
  const net = bullCount - bearCount;
  const total = bullCount + bearCount;
  if (total === 0) return 0;
  return Math.round((net / total) * 100);
}

function resolveAVQuery(symbol: string): { tickers: string } | { topics: string } | null {
  const asset = ASSET_MAP.get(symbol);

  // Crypto: strip -USD suffix, prefix with CRYPTO:
  if (asset?.category === "Crypto" && symbol.endsWith("-USD")) {
    return { tickers: `CRYPTO:${symbol.replace("-USD", "")}` };
  }

  // US equity index ETF proxies
  const US_INDEX_MAP: Record<string, string> = {
    "^GSPC": "SPY", "^DJI": "DIA", "^IXIC": "QQQ", "^RUT": "IWM",
  };
  if (US_INDEX_MAP[symbol]) return { tickers: US_INDEX_MAP[symbol] };
  if (symbol === "^VIX") return { topics: "financial_markets" };
  if (symbol === "DX-Y.NYB") return { topics: "economy_macro" };

  // International indices
  const INTL_INDICES = ["^FTSE", "^GDAXI", "^FCHI", "^N225", "^HSI", "^AXJO", "^NSEI", "^BVSP", "^MXX"];
  if (INTL_INDICES.includes(symbol)) return { topics: "financial_markets" };

  // Forex: all *=X symbols
  if (symbol.endsWith("=X")) return { topics: "forex" };

  // Commodities: energy vs. other
  if (asset?.category === "Commodities") {
    if (["CL=F", "BZ=F", "NG=F"].includes(symbol)) return { topics: "energy_transportation" };
    return { topics: "economy_macro" };
  }

  return null;
}

function parseAVDate(s: string): string {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
}

function pickSentiment(item: AVArticle, query: { tickers?: string; topics?: string }): number {
  if ("tickers" in query && query.tickers) {
    const match = item.ticker_sentiment?.find(
      (t) => t.ticker === query.tickers && parseFloat(t.relevance_score) >= 0.3
    );
    if (match) return Math.round(parseFloat(match.ticker_sentiment_score) * 100);
  }
  return Math.round(item.overall_sentiment_score * 100);
}

async function fetchNewsForSymbol(symbol: string): Promise<NewsResult> {
  const cached = newsCache.get(symbol);
  if (cached && Date.now() - cached.ts < NEWS_TTL) return cached.data;

  let articles: NewsArticle[] = [];

  // Reset daily counter if a new day has started
  if (Date.now() > _avCallsResetAt) {
    _avCallsToday = 0;
    _avCallsResetAt = Date.now() + 24 * 60 * 60_000;
  }

  const avQuery = resolveAVQuery(symbol);
  const canUseAV = AV_KEY !== null && _avCallsToday < AV_DAILY_LIMIT && avQuery !== null;

  if (canUseAV && avQuery !== null) {
    try {
      const qParam = "tickers" in avQuery
        ? `tickers=${encodeURIComponent(avQuery.tickers)}`
        : `topics=${encodeURIComponent(avQuery.topics)}`;
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&apikey=${AV_KEY}&limit=10&sort=LATEST&${qParam}`;
      const resp = await fetch(url);
      const data = (await resp.json()) as AVNewsResponse;
      _avCallsToday++;

      if (data.feed && data.feed.length > 0) {
        articles = data.feed.slice(0, 8).map((item) => ({
          title: item.title,
          publisher: item.source,
          publishedAt: parseAVDate(item.time_published),
          url: item.url,
          sentiment: pickSentiment(item, avQuery),
        }));
        console.log(`[news] ${symbol}: AV (${articles.length} articles, ${_avCallsToday}/${AV_DAILY_LIMIT} calls used)`);
      } else {
        console.log(`[news] ${symbol}: AV returned no feed — Yahoo fallback`);
      }
    } catch (e) {
      console.log(`[news] ${symbol}: AV error — Yahoo fallback (${(e as Error).message})`);
    }
  } else if (!canUseAV && AV_KEY !== null) {
    console.log(`[news] ${symbol}: AV daily limit reached — Yahoo fallback`);
  }

  // Yahoo Finance fallback (also used if AV returned no articles)
  if (articles.length === 0) {
    try {
      const asset = ASSET_MAP.get(symbol);
      const query = asset ? asset.name : symbol;
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8&enableNavLinks=false`;
      const data = await yfFetch<YFSearchResponse>(url);
      const news: YFNewsItem[] = data?.news ?? [];

      articles = news.slice(0, 8).map((item: YFNewsItem) => {
        const title = item.title ?? "";
        const sentiment = scoreSentiment(title + " " + (item.summary ?? ""));
        return {
          title,
          publisher: item.publisher ?? "Yahoo Finance",
          publishedAt: item.providerPublishTime
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : new Date().toISOString(),
          url: item.link ?? `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/news/`,
          sentiment,
        };
      });
    } catch {}
  }

  const aggregateSentiment =
    articles.length > 0
      ? Math.round(articles.reduce((s, a) => s + a.sentiment, 0) / articles.length)
      : 0;

  const result: NewsResult = {
    symbol,
    articles,
    aggregateSentiment,
    timestamp: new Date().toISOString(),
  };

  newsCache.set(symbol, { data: result, ts: Date.now() });
  return result;
}

// ─── Analyst Note — Claude Haiku with rate limiting ──────────────────────────

const _anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const _noteCache = new Map<string, { note: string; ts: number }>();
const _notePending = new Map<string, Promise<string>>();
const NOTE_TTL = 15 * 60 * 1000;

const CLAUDE_TIMEOUT_MS = 10_000;

// Sweep expired entries from all TTL-based caches every 10 minutes so stale
// entries don't accumulate in memory indefinitely even after their TTL passes.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of signalCache)   if (now - v.ts > SIGNAL_TTL)   signalCache.delete(k);
  for (const [k, v] of historyCache)  if (now - v.ts > HISTORY_TTL)  historyCache.delete(k);
  for (const [k, v] of backtestCache) if (now - v.ts > BACKTEST_TTL) backtestCache.delete(k);
  for (const [k, v] of newsCache)     if (now - v.ts > NEWS_TTL)     newsCache.delete(k);
  for (const [k, v] of _noteCache)    if (now - v.ts > NOTE_TTL)     _noteCache.delete(k);
  for (const [k, v] of _fundCache)    if (now - v.ts > FUND_TTL)     _fundCache.delete(k);
  for (const [k, v] of epsCache)      if (now - v.ts > EPS_TTL)      epsCache.delete(k);
  if (_tenXCache && now - _tenXCache.ts > TENX_TTL) _tenXCache = null;
  if (_stockScanCache && now - _stockScanCache.ts > STOCK_SCAN_TTL) _stockScanCache = null;
  if (_tenXV2Cache && now - _tenXV2Cache.ts > TENX_TTL) _tenXV2Cache = null;
  if (_tenXV3ForexCache && now - _tenXV3ForexCache.ts > TENX_TTL) _tenXV3ForexCache = null;
  if (_tenXV3CryptoCache && now - _tenXV3CryptoCache.ts > TENX_TTL) _tenXV3CryptoCache = null;
  if (_stockV2ScanCache && now - _stockV2ScanCache.ts > STOCK_SCAN_TTL) _stockV2ScanCache = null;
  if (_screenerCache && now - _screenerCache.ts > SCREENER_TTL) _screenerCache = null;
  if (_indianScreenerCache && now - _indianScreenerCache.ts > SCREENER_TTL) _indianScreenerCache = null;
  if (_indianScanCache && now - _indianScanCache.ts > STOCK_SCAN_TTL) _indianScanCache = null;
  if (_indianV2ScanCache && now - _indianV2ScanCache.ts > STOCK_SCAN_TTL) _indianV2ScanCache = null;
  if (_ukScreenerCache && now - _ukScreenerCache.ts > SCREENER_TTL) _ukScreenerCache = null;
  if (_ukScanCache && now - _ukScanCache.ts > STOCK_SCAN_TTL) _ukScanCache = null;
  if (_ukV2ScanCache && now - _ukV2ScanCache.ts > STOCK_SCAN_TTL) _ukV2ScanCache = null;
  if (_jpScreenerCache && now - _jpScreenerCache.ts > SCREENER_TTL) _jpScreenerCache = null;
  if (_jpScanCache && now - _jpScanCache.ts > STOCK_SCAN_TTL) _jpScanCache = null;
  if (_jpV2ScanCache && now - _jpV2ScanCache.ts > STOCK_SCAN_TTL) _jpV2ScanCache = null;
  if (_hkScreenerCache && now - _hkScreenerCache.ts > SCREENER_TTL) _hkScreenerCache = null;
  if (_hkScanCache && now - _hkScanCache.ts > STOCK_SCAN_TTL) _hkScanCache = null;
  if (_hkV2ScanCache && now - _hkV2ScanCache.ts > STOCK_SCAN_TTL) _hkV2ScanCache = null;
  if (_cnScreenerCache && now - _cnScreenerCache.ts > SCREENER_TTL) _cnScreenerCache = null;
  if (_cnScanCache && now - _cnScanCache.ts > STOCK_SCAN_TTL) _cnScanCache = null;
  if (_cnV2ScanCache && now - _cnV2ScanCache.ts > STOCK_SCAN_TTL) _cnV2ScanCache = null;
  if (_euronextScreenerCache && now - _euronextScreenerCache.ts > SCREENER_TTL) _euronextScreenerCache = null;
  if (_euronextScanCache && now - _euronextScanCache.ts > STOCK_SCAN_TTL) _euronextScanCache = null;
  if (_euronextV2ScanCache && now - _euronextV2ScanCache.ts > STOCK_SCAN_TTL) _euronextV2ScanCache = null;
  for (const [k, v] of _instFlowCache) if (now - v.ts > INST_FLOW_TTL) _instFlowCache.delete(k);
}, 10 * 60_000);

async function _callClaude(symbol: string, strategy: string, direction: string, confidence: number): Promise<string> {
  if (!_anthropic) return "";
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Claude timeout")), CLAUDE_TIMEOUT_MS)
  );
  const msg = await Promise.race([
    _anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: "You are a concise financial analyst writing brief trader notes. Write 2-3 sentences adding macro and event context beyond what technical indicators already show. Be specific to the asset and direction. No disclaimers.",
      messages: [{
        role: "user",
        content: `${symbol} ${direction} signal — ${Math.round(confidence)}% confidence, Strategy S${strategy}. Add: (1) relevant sector/macro backdrop for this direction, (2) any near-term risk event traders should watch (earnings, Fed, macro data), (3) one positioning insight. Do not repeat technical indicator language.`,
      }],
    }),
    timeout,
  ]);
  const block = msg.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

// ─── Strategy Definitions ─────────────────────────────────────────────────────
// Single source of truth for strategy titles/descriptions surfaced in the app.
// Flutter fetches this at startup and falls back to hardcoded strings on error.

const STRATEGY_DEFS = [
  {
    id: "1",
    label: "S1",
    title: "Technical Analysis",
    description: "Pure price-action signals using momentum and volatility indicators.",
    detail: "RSI-14 · MACD · EMA crossovers · Bollinger Bands · ATR · Rate of Change",
    accentHex: "#00D4AA",
  },
  {
    id: "2",
    label: "S2",
    title: "Multi-Factor",
    description: "Builds on S1 with volatility-adaptive entry and exit thresholds.",
    detail: "All S1 indicators + dynamic thresholds calibrated to current market vol",
    accentHex: "#FFB84D",
  },
  {
    id: "3",
    label: "S3",
    title: "Hybrid (Tech + Sentiment)",
    description: "Blends technical signals with real-time news sentiment scoring.",
    detail: "S1 signals (65%) + NLP sentiment from latest headlines (35%)",
    accentHex: "#FF4D6A",
  },
  {
    id: "4",
    label: "S4",
    title: "Regime-Adaptive",
    description: "Detects market regime first, then activates the right engine — Trend or Mean Reversion.",
    detail: "ADX > 25 → Trend Engine (EMA200 1.2×, MACD, Volume) · ADX < 18 → Range Engine (RSI, Bollinger, ATR) · High-conviction threshold (0.55)",
    accentHex: "#00C49A",
  },
  {
    id: "5",
    label: "S5",
    title: "Professional Systematic",
    description: "Four-regime classification with dynamic indicator weights, consensus gate, and calibrated confidence — built for high-probability setups.",
    detail: "Quiet Trend (0.45) · Quiet Range (0.60) · Volatile Trend (0.65) · Chaotic → No Trade · ≥60% consensus required · OBV + volume confirmation · score-to-win-rate calibration · VIX-adaptive threshold: −0.05 when VIX<15, +0.10 when VIX>30 (applies to S5 and S5+)",
    accentHex: "#FFB84D",
  },
  {
    id: "6",
    label: "S6",
    title: "Adaptive Hybrid",
    description: "Regime-aware fusion of S2 technical signals and enhanced news sentiment — weights shift automatically based on volatility and trend strength.",
    detail: "High-vol: tech 90% / news 10% · Strong-trend: 85/15 · Low-vol: 60/40 · Default: 70/30 · Freshness decay · Source credibility · Negation detection · BUY >0.45 / SELL <−0.35",
    accentHex: "#00D4AA",
  },
  {
    id: "7",
    label: "S7",
    title: "APEX — Adaptive Probabilistic EXecution",
    description: "Five-regime classifier with regime-specific direction engines, divergence veto, higher-timeframe permission layer, and a 0–100 quality gate that must hit 60 before any trade fires.",
    detail: "Strong Trend · Weak Trend · Ranging · Volatile Breakout · Chaotic (no trade) · VWAP · OBV · Divergence veto · HTF alignment · Cross-asset confirmation · Regime-aware SL/TP (1:1.8 → 2:4.5)",
    accentHex: "#FF4D6A",
  },
  {
    id: "8",
    label: "S8",
    title: "Ensemble — S4 + S5 + S7 Weighted Consensus",
    description: "Runs three strategies simultaneously and weights their votes by per-regime historical accuracy. Requires 2 of 3 to agree before firing — when engines split, the answer is HOLD.",
    detail: "Strong Trend: S7 50% · S4 35% · S5 15% · Ranging: S5 45% · S7 35% · S4 20% · Volatile Break: S7 55% · S4 35% · S5 10% · Full position on 3/3 · 60% size on 2/3 · No trade on 1/3 or split",
    accentHex: "#00C49A",
  },
  {
    id: "9",
    label: "S9",
    title: "Silver Liquidity Sweep",
    description: "Session-gated stop-hunt entries at Fibonacci confluence — optimised for Silver (SI=F) intraday. Fires only when all four conditions align simultaneously.",
    detail: "London KZ (02:00–05:00 ET) · NY KZ (07:00–10:00 ET) · Liquidity sweep (wick beyond recent H/L, close back inside) · 9 EMA power candle (body >60% of range) · Fib 0.618/0.786 long · Fib 0.236/0.382 short",
    accentHex: "#C0C0C0",
  },
  // ── Enhanced strategies (S1+–S9+) ─────────────────────────────────────────
  {
    id: "10",
    label: "S1+",
    title: "Technical Analysis+",
    description: "S1 enhanced with OBV institutional flow scoring and volume-participation gate — thin-volume signals are automatically dampened.",
    detail: "All S1 indicators + OBV slope (confirms/contradicts trend) + volume participation gate (sub-50% avg → 0.55× mult, sub-80% → 0.82×) + MACD near-crossover bonus (within 8% of line) · Threshold: 0.35",
    accentHex: "#00D4AA",
  },
  {
    id: "11",
    label: "S2+",
    title: "Multi-Factor+",
    description: "S2 with regime-aware weight shifting instead of blanket volatility multiplier, plus a candle-body direction lock that penalises entries against the prevailing bar.",
    detail: "S1+ base + ADX regime weights (trending: 1.05×, ranging: 0.80×, high-vol: 0.70×) + candle direction lock (opposing body >30% of range → 0.72×) · Threshold: 0.35",
    accentHex: "#FFB84D",
  },
  {
    id: "12",
    label: "S3+",
    title: "Hybrid+",
    description: "S3 with stricter news quality gate (min 3 high-relevance articles, relevance ≥0.5) and adaptive tech/news blend that shifts to 80/20 when news is stale (>6h).",
    detail: "S1+ base (65%) + enhanced sentiment (35%) · Relevance gate 0.5 (vs 0.2 in S3) · Min 3 articles before news weight activates · Stale-news shift 80/20 when >6h old · Freshness decay + credibility weighting",
    accentHex: "#FF4D6A",
  },
  {
    id: "13",
    label: "S4+",
    title: "Regime-Adaptive+",
    description: "S4 with a fixed neutral-zone engine (ADX 18–25 no longer falls through), Bollinger Width amplifier in MR mode, and volume-confirmation scoring in Trend mode.",
    detail: "ADX >25 → Trend Engine · ADX 18–25 → Weak Trend Engine (0.70× weight) · ADX <18 → MR Engine + BB-width amplifier (compressed: 1.30×) · Trend mode: vol 1.2× avg confirms (1.0× weight), OBV slope tie-breaker · Split thresholds: Trend 0.45 · MR 0.65 · Other 0.35",
    accentHex: "#00C49A",
  },
  {
    id: "14",
    label: "S5+",
    title: "Professional Systematic+",
    description: "S5 with volume-spike gate on Volatile Trend regime, weighted consensus gate (replacing raw count), and regime-aware EMA200 stretch penalty.",
    detail: "All S5 regimes + Volatile Trend gate: vol must be ≥1.5× avg or regime reclassified to Quiet Range · Weighted consensus ≥60% required (vs raw count) · EMA200 stretch >4% in range / >8% in trend → 15% quality penalty · Same 4 regime thresholds: 0.45/0.60/0.65/chaos",
    accentHex: "#FFB84D",
  },
  {
    id: "15",
    label: "S6+",
    title: "Adaptive Hybrid+",
    description: "S6 with stricter source credibility (unknown publishers score 0.35 vs 0.55), stale-news penalty when ATR<1% + news>6h, and minimum 3-article gate before news weight exceeds 15%.",
    detail: "S2+ tech base + enhanced S6+ sentiment · Unknown source credibility → 0.35 (was 0.55) · Low-vol + stale news → 80/20 split · Min 3 articles for news >10% weight · All original regime weights inherited",
    accentHex: "#00D4AA",
  },
  {
    id: "16",
    label: "S7+",
    title: "APEX+ — 2-Bar HTF · Expanded Cross-Asset",
    description: "APEX with 2-bar higher-timeframe persistence (both bars must confirm), VWAP added to the ranging engine, EMA50 direction lock on breakouts, and an expanded 25-pair cross-asset map.",
    detail: "All S7 engines + HTF 2-bar confirmation (prev bar re-checked on same slice) · Range engine: VWAP confirmation (0.8× weight) · Breakout engine: EMA50 direction lock (opposite → abstain) · Cross-asset: +15 forex/index/commodity pairs (25 total) · Quality gate 60/100 unchanged",
    accentHex: "#FF4D6A",
  },
  {
    id: "17",
    label: "S8+",
    title: "Ensemble+ — Regime-Shared · S7 Abstention",
    description: "S8 improved: S7+ abstains instead of voting HOLD when quality gate fails, all sub-strategies share S7+'s regime classification, and position size is differentiated by whether S7+ is among the agreeing engines.",
    detail: "Votes: S4+ + S5+ + S7+ (abstains if quality <60) · Shared regime across all engines (no conflicting classification) · S7+ in majority → 100% risk · S4++S5+ only → 50% risk · Full agreement → 100% risk · Threshold 0.38",
    accentHex: "#00C49A",
  },
  {
    id: "18",
    label: "S9+",
    title: "Silver Liquidity Sweep+",
    description: "S9 with extended lookbacks — sweep detection over 20 bars (was 10) and Fibonacci structure over 50 bars (was 20) — capturing deeper, more significant institutional liquidity levels.",
    detail: "London KZ + NY KZ + Post-News CZ · Liquidity sweep: 20-bar range (was 10) · Power candle: body >60% range + above/below 9 EMA · Fib POI: 44–61.8% of 50-bar swing (was 20-bar) · TP2 0.618 extension runner",
    accentHex: "#C0C0C0",
  },
] as const;

// ─── Analyst Note Rate Limiter ────────────────────────────────────────────────
// 3 calls per device per day (free tier only).

// ─── Express Router ───────────────────────────────────────────────────────────

// ─── 10X Scanner ─────────────────────────────────────────────────────────────
// Detects three institutional accumulation patterns described in Felix Prehn's
// "How to Find the Next 10X Bagger" framework:
//   1. Volume Spike  — current volume ≥ 3× 20-day avg on a green (up) day
//   2. Heartbeat     — price consolidating sideways (<30% range) over 1–2 years
//   3. Record Quarter — most recent EPS is highest of last 4 quarters (stocks only)

interface TenXScanEntry {
  symbol: string;
  name: string;
  flag: string;
  category: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
  heartbeat: boolean;
  consolidationRangePct: number;
  nearBreakout: boolean;
  recordQuarter: boolean;
  epsHistory: number[];
  epsApplicable: boolean;
  trendUp: boolean;
  // V3 "Super Pine" — index-specific signals (Indices only; absent on v1/v2 entries)
  thrust?: boolean;
  base?: boolean;
  uptrend?: boolean;
  newHighReclaim?: boolean;
  regimeBreakout?: boolean;
  signalsActive: number;
}

interface ScreenerQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume10Day?: number;
  averageDailyVolume3Month?: number;
  quoteType?: string;
  marketCap?: number;
}

interface ScreenerResponse {
  finance: {
    result: Array<{ quotes: ScreenerQuote[] }> | null;
    error: unknown;
  };
}

interface TenXScanResponse {
  assets: TenXScanEntry[];
  lastUpdated: string;
  cacheTtlSeconds: number;
}

interface FlowEntry {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  vwapDeviation?: number;
  obvSlopeRatio?: number;       // OBV 14-bar slope in days of 20d avg volume
  periodChangePercent?: number; // 14-bar price change (obv type)
  shortPercentFloat?: number;   // % of float sold short (short type)
  shortRatio?: number;          // days to cover (short type)
  insiderCount?: number;        // distinct Form 4 filers in window (insider type)
  filingCount?: number;         // total Form 4 filings in window (insider type)
}

interface InstFlowResponse {
  assets: FlowEntry[];
  type: string;
  lastUpdated: string;
}

interface FinnhubEarningsItem {
  period: string;
  actual: number | null;
  estimate: number | null;
  surprise: number | null;
  surprisePercent: number | null;
}

let _tenXCache: { data: TenXScanResponse; ts: number } | null = null;
const TENX_TTL = 30 * 60_000;

let _stockScanCache: { data: TenXScanResponse; ts: number } | null = null;
const STOCK_SCAN_TTL = 30 * 60_000;

let _tenXV2Cache: { data: TenXScanResponse; ts: number } | null = null;
let _stockV2ScanCache: { data: TenXScanResponse; ts: number } | null = null;

let _tenXV3Cache: { data: TenXScanResponse; ts: number } | null = null;
let _tenXV3CommoditiesCache: { data: TenXScanResponse; ts: number } | null = null;
let _tenXV3ForexCache: { data: TenXScanResponse; ts: number } | null = null;
let _tenXV3CryptoCache: { data: TenXScanResponse; ts: number } | null = null;

let _screenerCache: { stocks: ScreenerQuote[]; ts: number } | null = null;
let _indianScreenerCache: { stocks: ScreenerQuote[]; ts: number } | null = null;
let _indianScanCache: { data: TenXScanResponse; ts: number } | null = null;
let _indianV2ScanCache: { data: TenXScanResponse; ts: number } | null = null;

let _ukScreenerCache: { stocks: ScreenerQuote[]; ts: number } | null = null;
let _ukScanCache:     { data: TenXScanResponse; ts: number } | null = null;
let _ukV2ScanCache:   { data: TenXScanResponse; ts: number } | null = null;

let _jpScreenerCache:       { stocks: ScreenerQuote[]; ts: number } | null = null;
let _jpScanCache:           { data: TenXScanResponse; ts: number } | null = null;
let _jpV2ScanCache:         { data: TenXScanResponse; ts: number } | null = null;

let _hkScreenerCache:       { stocks: ScreenerQuote[]; ts: number } | null = null;
let _hkScanCache:           { data: TenXScanResponse; ts: number } | null = null;
let _hkV2ScanCache:         { data: TenXScanResponse; ts: number } | null = null;

let _cnScreenerCache:       { stocks: ScreenerQuote[]; ts: number } | null = null;
let _cnScanCache:           { data: TenXScanResponse; ts: number } | null = null;
let _cnV2ScanCache:         { data: TenXScanResponse; ts: number } | null = null;

let _euronextScreenerCache: { stocks: ScreenerQuote[]; ts: number } | null = null;
let _euronextScanCache:     { data: TenXScanResponse; ts: number } | null = null;
let _euronextV2ScanCache:   { data: TenXScanResponse; ts: number } | null = null;

const _instFlowCache = new Map<string, { data: InstFlowResponse; ts: number }>();
const INST_FLOW_TTL = 30 * 60_000;

const SCREENER_TTL = 60 * 60_000; // 1 hour — screener lists change throughout the trading day

// Shared EPS cache — keyed by symbol, shared across ALL scanner versions (v1 assets, v1 stocks,
// v2 assets, v2 stocks). EPS data is quarterly so 6h is safe; only successful fetches are cached
// so transient Finnhub failures always retry on the next scan run.
const epsCache = new Map<string, {
  data: { recordQuarter: boolean; epsHistory: number[]; epsApplicable: boolean };
  ts: number;
}>();
const EPS_TTL = 6 * 60 * 60_000; // 6 hours

async function computeVolumeSpike(symbol: string): Promise<{
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
}> {
  try {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "1mo")) as OHLCV[];
    if (candles.length < 2) return { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
    const volSma = calcVolumeSma(candles);
    if (!volSma || volSma === 0) return { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
    const last = candles[candles.length - 1];
    const volumeRatio = Math.round((last.volume / volSma) * 10) / 10;
    return {
      volumeRatio,
      volumeSpike: volumeRatio >= 3.0,
      volumeGreen: last.close > last.open,
    };
  } catch {
    return { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
  }
}

async function computeHeartbeat(symbol: string): Promise<{
  heartbeat: boolean;
  consolidationRangePct: number;
  nearBreakout: boolean;
}> {
  try {
    let candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "2y")) as OHLCV[];
    if (candles.length < 200) {
      candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "1y")) as OHLCV[];
    }
    if (candles.length < 50) {
      return { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
    }
    const hi = Math.max(...candles.map(c => c.high));
    const lo = Math.min(...candles.map(c => c.low));
    const consolidationRangePct = Math.round(((hi - lo) / lo) * 1000) / 10;
    const heartbeat = consolidationRangePct < 30;

    const closes = candles.map(c => c.close).sort((a, b) => a - b);
    const p90 = closes[Math.floor(closes.length * 0.9)];
    const currentPrice = candles[candles.length - 1].close;
    const nearBreakout = heartbeat && currentPrice > p90;

    return { heartbeat, consolidationRangePct, nearBreakout };
  } catch {
    return { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
  }
}

async function computeRecordQuarter(symbol: string, category: string): Promise<{
  recordQuarter: boolean;
  epsHistory: number[];
  epsApplicable: boolean;
}> {
  // Non-stock categories never have EPS — skip API entirely
  const nonStockCategories: string[] = ["Commodities", "Indices", "Crypto", "Forex"];
  if (nonStockCategories.includes(category)) {
    return { recordQuarter: false, epsHistory: [], epsApplicable: false };
  }

  // Shared across ALL scanner pipelines — one fetch serves v1/v2 assets/stocks.
  const cached = epsCache.get(symbol);
  if (cached && Date.now() - cached.ts < EPS_TTL) return cached.data;

  // International symbols have a dot suffix (.NS, .L, .HK, .SS, .DE …) → Yahoo.
  // US symbols (no dot) → Finnhub first, Yahoo as fallback.
  const isInternational = symbol.includes(".");
  let eps: number[] = [];

  if (!isInternational && FINNHUB_KEY) {
    try {
      const data = await yfFetch<FinnhubEarningsItem[]>(
        `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
      );
      if (Array.isArray(data) && data.length > 0) {
        const sorted = [...data].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 4);
        eps = sorted.map(q => q.actual ?? 0);
      }
    } catch { /* fall through to Yahoo */ }
  }

  // International stocks: Twelve Data (primary). US stocks fall back here if Finnhub was empty.
  if (eps.length === 0) {
    eps = await fetchTwelveDataEarnings(symbol);
  }

  // Last-resort: Yahoo quoteSummary crumb (unreliable from cloud IPs, kept as deep fallback).
  if (eps.length === 0) {
    eps = await fetchYFEarningsHistory(symbol);
  }

  if (eps.length === 0) {
    // Data unavailable (transient failure or unsupported exchange) — retry on next scan run.
    // epsApplicable stays true: EPS is conceptually valid for stocks; the lock icon is reserved
    // for non-stock asset classes (Crypto/Indices/Forex/Commodities) where EPS is N/A by nature.
    return { recordQuarter: false, epsHistory: [], epsApplicable: true };
  }

  const recordQuarter = eps.length >= 2 && eps[0] > 0 && eps.slice(1).every(v => eps[0] > v);
  const result = { recordQuarter, epsHistory: eps, epsApplicable: true };
  epsCache.set(symbol, { data: result, ts: Date.now() });
  return result;
}

async function scanAsset(asset: TradingAsset): Promise<TenXScanEntry | null> {
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const [vsResult, hbResult, eqResult] = await Promise.allSettled([
      computeVolumeSpike(asset.symbol),
      computeHeartbeat(asset.symbol),
      computeRecordQuarter(asset.symbol, asset.category),
    ]);

    const vs = vsResult.status === "fulfilled"
      ? vsResult.value
      : { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
    const hb = hbResult.status === "fulfilled"
      ? hbResult.value
      : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
    const eq = eqResult.status === "fulfilled"
      ? eqResult.value
      : { recordQuarter: false, epsHistory: [], epsApplicable: false };

    const signalsActive =
      (vs.volumeSpike && vs.volumeGreen ? 1 : 0) +
      (hb.heartbeat ? 1 : 0) +
      (eq.recordQuarter ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: vs.volumeRatio,
      volumeSpike: vs.volumeSpike,
      volumeGreen: vs.volumeGreen,
      heartbeat: hb.heartbeat,
      consolidationRangePct: hb.consolidationRangePct,
      nearBreakout: hb.nearBreakout,
      recordQuarter: eq.recordQuarter,
      epsHistory: eq.epsHistory,
      epsApplicable: eq.epsApplicable,
      trendUp: false,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function runWithConcurrency<TIn, TOut>(
  items: TIn[],
  fn: (item: TIn) => Promise<TOut | null>,
  concurrency: number
): Promise<(TOut | null)[]> {
  const results: (TOut | null)[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.allSettled(items.slice(i, i + concurrency).map(item => fn(item)));
    for (const r of batch) {
      results.push(r.status === "fulfilled" ? r.value : null);
    }
  }
  return results;
}

async function fetchStockUniverse(): Promise<ScreenerQuote[]> {
  if (_screenerCache && Date.now() - _screenerCache.ts < SCREENER_TTL) {
    return _screenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=en-US&region=US&count=100&start=0";
    const [activeRes, gainersRes] = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives${params}`),
      yfFetch<ScreenerResponse>(`${base}?scrIds=day_gainers${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes), ...extract(gainersRes)];

    // Deduplicate by symbol, filter for equity with meaningful price + volume
    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (
        q.quoteType === "EQUITY" &&
        q.regularMarketPrice >= 2 &&
        avgVol >= 100_000
      ) {
        stocks.push(q);
      }
    }

    _screenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function scanScreenerStock(quote: ScreenerQuote, category = "Stocks"): Promise<TenXScanEntry | null> {
  try {
    // Volume data comes directly from the screener — no extra API call needed
    const avgVol = quote.averageDailyVolume10Day ?? quote.averageDailyVolume3Month ?? 0;
    const volumeRatio = avgVol > 0
      ? Math.round((quote.regularMarketVolume / avgVol) * 10) / 10
      : 0;
    const volumeSpike = volumeRatio >= 3.0;
    const volumeGreen = quote.regularMarketChangePercent > 0;

    const [hbResult, eqResult] = await Promise.allSettled([
      computeHeartbeat(quote.symbol),
      computeRecordQuarter(quote.symbol, "Stocks"),
    ]);

    const hb = hbResult.status === "fulfilled"
      ? hbResult.value
      : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
    const eq = eqResult.status === "fulfilled"
      ? eqResult.value
      : { recordQuarter: false, epsHistory: [], epsApplicable: false };

    const signalsActive =
      (volumeSpike && volumeGreen ? 1 : 0) +
      (hb.heartbeat ? 1 : 0) +
      (eq.recordQuarter ? 1 : 0);

    return {
      symbol: quote.symbol,
      name: quote.shortName ?? quote.longName ?? quote.symbol,
      flag: "",
      category: "Stocks",
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      volumeRatio,
      volumeSpike,
      volumeGreen,
      heartbeat: hb.heartbeat,
      consolidationRangePct: hb.consolidationRangePct,
      nearBreakout: hb.nearBreakout,
      recordQuarter: eq.recordQuarter,
      epsHistory: eq.epsHistory,
      epsApplicable: eq.epsApplicable,
      trendUp: false,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function fetchIndianStockUniverse(): Promise<ScreenerQuote[]> {
  if (_indianScreenerCache && Date.now() - _indianScreenerCache.ts < SCREENER_TTL) {
    return _indianScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=en-IN&region=IN&count=100&start=0";
    const [activeRes, gainersRes] = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives_in${params}`),
      yfFetch<ScreenerResponse>(`${base}?scrIds=day_gainers_in${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes), ...extract(gainersRes)];

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (
        q.quoteType === "EQUITY" &&
        q.regularMarketPrice >= 2 &&
        avgVol >= 100_000
      ) {
        stocks.push(q);
      }
    }

    _indianScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runIndianStockScanner(): Promise<TenXScanResponse> {
  if (_indianScanCache && Date.now() - _indianScanCache.ts < STOCK_SCAN_TTL) return _indianScanCache.data;
  const universe = await fetchIndianStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "India"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _indianScanCache = { data, ts: Date.now() };
  return data;
}

async function runAssetScanner(): Promise<TenXScanResponse> {
  if (_tenXCache && Date.now() - _tenXCache.ts < TENX_TTL) return _tenXCache.data;
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(TRADING_ASSETS, scanAsset, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: TENX_TTL / 1000,
  };
  _tenXCache = { data, ts: Date.now() };
  return data;
}

async function runStockScanner(): Promise<TenXScanResponse> {
  if (_stockScanCache && Date.now() - _stockScanCache.ts < STOCK_SCAN_TTL) return _stockScanCache.data;
  const universe = await fetchStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(universe, scanScreenerStock, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _stockScanCache = { data, ts: Date.now() };
  return data;
}

// ─── Institutional Flow Scanner ──────────────────────────────────────────────

async function runInstitutionalFlow(
  type: "accumulation" | "distribution" | "vwap" | "obv" | "short" | "insider"
): Promise<InstFlowResponse> {
  const cached = _instFlowCache.get(type);
  if (cached && Date.now() - cached.ts < INST_FLOW_TTL) return cached.data;

  const screenerVolumeRatio = (q: ScreenerQuote): number | null => {
    const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
    if (avgVol === 0) return null;
    return Math.round((q.regularMarketVolume / avgVol) * 10) / 10;
  };

  let assets: FlowEntry[];

  if (type === "accumulation" || type === "distribution") {
    const universe = await fetchStockUniverse();
    const entries: FlowEntry[] = [];
    for (const q of universe) {
      const volumeRatio = screenerVolumeRatio(q);
      if (volumeRatio === null) continue;
      const cp = q.regularMarketChangePercent;
      const pass = type === "accumulation" ? cp > 0 : cp < 0;
      if (pass && volumeRatio >= 2.0) {
        entries.push({
          symbol: q.symbol,
          name: q.shortName ?? q.longName ?? q.symbol,
          price: q.regularMarketPrice,
          changePercent: cp,
          volumeRatio,
        });
      }
    }
    entries.sort((a, b) => b.volumeRatio - a.volumeRatio);
    assets = entries.slice(0, 10);

  } else if (type === "vwap") {
    const universe = await fetchStockUniverse();
    const candidates = universe.filter(q => {
      const vr = screenerVolumeRatio(q);
      return vr !== null && vr >= 3.0;
    }).slice(0, 100);

    const rows = await runWithConcurrency<ScreenerQuote, FlowEntry>(
      candidates,
      async (q) => {
        try {
          const volumeRatio = screenerVolumeRatio(q)!;
          const candles = (await yahooProvider.fetchHistoryCandles(q.symbol, "1d", "1mo")) as OHLCV[];
          const vwap = calcVwap(candles, 20);
          if (!vwap) return null;
          const vwapDeviation = Math.round(((q.regularMarketPrice - vwap) / vwap) * 1000) / 10;
          if (Math.abs(vwapDeviation) < 1.5) return null;
          return {
            symbol: q.symbol,
            name: q.shortName ?? q.longName ?? q.symbol,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            volumeRatio,
            vwapDeviation,
          };
        } catch {
          return null;
        }
      },
      5
    );

    const filtered = rows.filter((r): r is FlowEntry => r !== null);
    filtered.sort((a, b) => Math.abs(b.vwapDeviation ?? 0) - Math.abs(a.vwapDeviation ?? 0));
    assets = filtered.slice(0, 10);

  } else if (type === "obv") {
    // OBV divergence: OBV rising over 14 bars while price is flat/down —
    // volume flowing in without the price confirming yet (quiet accumulation).
    const universe = await fetchStockUniverse();
    const candidates = [...universe]
      .sort((a, b) => b.regularMarketVolume - a.regularMarketVolume)
      .slice(0, 100);

    const rows = await runWithConcurrency<ScreenerQuote, FlowEntry>(
      candidates,
      async (q) => {
        try {
          const candles = (await yahooProvider.fetchHistoryCandles(q.symbol, "1d", "3mo")) as OHLCV[];
          if (candles.length < 21) return null;
          const obvSlope = calcObvSlope(candles, 14);
          const volSma20 = calcVolumeSma(candles);
          if (obvSlope === null || !volSma20) return null;
          const past = candles[candles.length - 15]?.close;
          const last = candles[candles.length - 1].close;
          if (!past || !last) return null;
          const periodChangePercent = Math.round(((last - past) / past) * 1000) / 10;
          // Divergence: OBV up, price not up
          if (obvSlope <= 0 || periodChangePercent > 1.0) return null;
          const obvSlopeRatio = Math.round((obvSlope / volSma20) * 10) / 10;
          return {
            symbol: q.symbol,
            name: q.shortName ?? q.longName ?? q.symbol,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            volumeRatio: screenerVolumeRatio(q) ?? 0,
            obvSlopeRatio,
            periodChangePercent,
          };
        } catch {
          return null;
        }
      },
      5
    );

    const filtered = rows.filter((r): r is FlowEntry => r !== null);
    filtered.sort((a, b) => (b.obvSlopeRatio ?? 0) - (a.obvSlopeRatio ?? 0));
    assets = filtered.slice(0, 10);

  } else if (type === "short") {
    // Short squeeze: high short % float + price already rising = covering fuel.
    const universe = await fetchStockUniverse();
    const candidates = universe
      .filter(q => q.regularMarketChangePercent > 0 && screenerVolumeRatio(q) !== null)
      .sort((a, b) => (screenerVolumeRatio(b) ?? 0) - (screenerVolumeRatio(a) ?? 0))
      .slice(0, 50);

    const rows = await runWithConcurrency<ScreenerQuote, FlowEntry>(
      candidates,
      async (q) => {
        try {
          const quote = await fetchYahooQuoteSummary(q.symbol, { includeKeyStats: true });
          const si = quote?.shortPercentFloat;
          if (si == null || si < 10) return null;
          return {
            symbol: q.symbol,
            name: q.shortName ?? q.longName ?? q.symbol,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            volumeRatio: screenerVolumeRatio(q) ?? 0,
            shortPercentFloat: Math.round(si * 10) / 10,
            shortRatio: quote?.shortRatio != null
              ? Math.round(quote.shortRatio * 10) / 10
              : undefined,
          };
        } catch {
          return null;
        }
      },
      5
    );

    const filtered = rows.filter((r): r is FlowEntry => r !== null);
    filtered.sort((a, b) => (b.shortPercentFloat ?? 0) - (a.shortPercentFloat ?? 0));
    assets = filtered.slice(0, 10);

  } else {
    // Insider clusters: ≥2 distinct insiders filing Form 4s on the same ticker
    // within 30 days (SEC EDGAR via quiver.ts).
    const clusters = (await fetchInsiderClusters(30)).slice(0, 10);
    const universe = await fetchStockUniverse().catch(() => [] as ScreenerQuote[]);
    const bySymbol = new Map(universe.map(q => [q.symbol, q]));
    const prices = await fetchBatch(clusters.map(c => c.ticker));

    assets = clusters.map(c => {
      const q = bySymbol.get(c.ticker);
      const p = prices.get(c.ticker);
      return {
        symbol: c.ticker,
        name: q?.shortName ?? q?.longName ?? KNOWN_NAMES[c.ticker] ?? c.ticker,
        price: p?.price ?? q?.regularMarketPrice ?? 0,
        changePercent: p?.changePercent ?? q?.regularMarketChangePercent ?? 0,
        volumeRatio: q ? (screenerVolumeRatio(q) ?? 0) : 0,
        insiderCount: c.insiderCount,
        filingCount: c.filingCount,
      };
    });
  }

  const data: InstFlowResponse = { assets, type, lastUpdated: new Date().toISOString() };
  _instFlowCache.set(type, { data, ts: Date.now() });
  return data;
}

// ─── 10X Scanner v2 (Pine Script Aligned) ───────────────────────────────────
// Differences from v1:
//   - Heartbeat: ≤35% range over last 200 daily bars (was <30% over 2y)
//   - nearBreakout: close > highest(50)[1] (was price in top 10% of 2y range)
//   - trendUp: MA50 flat or rising (new 4th signal)

async function computeHeartbeatV2(symbol: string): Promise<{
  heartbeat: boolean;
  consolidationRangePct: number;
  nearBreakout: boolean;
}> {
  try {
    let candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "1y")) as OHLCV[];
    if (candles.length > 200) candles = candles.slice(-200);
    if (candles.length < 50) return { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };

    const hi = Math.max(...candles.map(c => c.high));
    const lo = Math.min(...candles.map(c => c.low));
    const consolidationRangePct = Math.round(((hi - lo) / lo) * 1000) / 10;
    const heartbeat = consolidationRangePct <= 35;

    const last51 = candles.slice(-51, -1);
    const highest50 = last51.length > 0 ? Math.max(...last51.map(c => c.high)) : hi;
    const currentPrice = candles[candles.length - 1].close;
    const nearBreakout = heartbeat && currentPrice > highest50;

    return { heartbeat, consolidationRangePct, nearBreakout };
  } catch {
    return { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
  }
}

async function computeTrend(symbol: string): Promise<{ trendUp: boolean }> {
  try {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "6mo")) as OHLCV[];
    if (candles.length < 70) return { trendUp: false };
    const closes = candles.map(c => c.close);
    const n = closes.length;
    const sma50 = (end: number) =>
      closes.slice(Math.max(0, end - 50), end).reduce((a, b) => a + b, 0) /
      Math.min(50, end);
    const trendUp = sma50(n) >= sma50(Math.max(50, n - 20));
    return { trendUp };
  } catch {
    return { trendUp: false };
  }
}

// ─── V3 "Super Pine" — Index Regime Breakout ─────────────────────────────────
// Port of user-supplied Pine "10X Power Moves — Indexes" (Felix Prehn adaptation).
// Index-tuned: lower volume threshold (2×) with thrust fallback for vol-less
// indexes, 120-bar base ≤ 20%, SMA200 uptrend, 252-bar new-high reclaim,
// composite breakout = baseRecently + newHighReclaim + (volSpike||thrust) + uptrend.

interface V3Signals {
  thrust: boolean;
  base: boolean;
  uptrend: boolean;
  newHighReclaim: boolean;
  regimeBreakout: boolean;
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
  consolidationRangePct: number;
}

async function computeV3Signals(symbol: string): Promise<V3Signals> {
  const empty: V3Signals = {
    thrust: false, base: false, uptrend: false,
    newHighReclaim: false, regimeBreakout: false,
    volumeRatio: 0, volumeSpike: false, volumeGreen: false,
    consolidationRangePct: 999,
  };
  try {
    // Need ~14 months of daily bars for the 252-bar prior-high lookback + 200-bar MA.
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "2y")) as OHLCV[];
    if (candles.length < 210) return empty;

    const n = candles.length;
    const last = candles[n - 1];
    const upDay = last.close >= last.open;

    // Pine inputs
    const VOL_MULT = 2.0, VOL_LEN = 20;
    const BASE_LEN = 120, BASE_RANGE_PCT = 20;
    const HI_LOOK = 252, MA_LEN = 200;

    // Move #1 — Volume spike or price thrust
    const volWindow = candles.slice(-VOL_LEN);
    const hasVolume = volWindow.some(c => c.volume > 0);
    const volAvg = volWindow.reduce((a, c) => a + c.volume, 0) / VOL_LEN;
    const volumeRatio = volAvg > 0
      ? Math.round((last.volume / volAvg) * 10) / 10
      : 0;
    const volumeSpike = hasVolume && last.volume >= volAvg * VOL_MULT;
    const volumeGreen = upDay;

    // Price thrust fallback (Pine: trueRange ≥ trAvg*1.5 && strongClose && upDay)
    const trueRange = last.high - last.low;
    const trAvg = volWindow.reduce((a, c) => a + (c.high - c.low), 0) / VOL_LEN;
    const strongClose = trueRange > 0
      ? (last.close - last.low) / trueRange > 0.7
      : false;
    const priceThrust = trueRange >= trAvg * 1.5 && strongClose && upDay;
    const thrust = volumeSpike || (!hasVolume && priceThrust);

    // Move #2 — Base zone (120-bar range ≤ 20%)
    const baseWindow = candles.slice(-BASE_LEN);
    const baseHi = Math.max(...baseWindow.map(c => c.high));
    const baseLo = Math.min(...baseWindow.map(c => c.low));
    const consolidationRangePct = baseLo > 0
      ? Math.round(((baseHi - baseLo) / baseLo) * 1000) / 10
      : 999;
    const base = consolidationRangePct <= BASE_RANGE_PCT;

    // baseRecently: any of the last 15 bars had isBase active (Pine: barssince(isBase) < 15)
    let baseRecently = false;
    for (let look = 1; look <= 15 && n - look - BASE_LEN >= 0; look++) {
      const win = candles.slice(n - look - BASE_LEN, n - look);
      const hi = Math.max(...win.map(c => c.high));
      const lo = Math.min(...win.map(c => c.low));
      const pct = lo > 0 ? ((hi - lo) / lo) * 100 : 999;
      if (pct <= BASE_RANGE_PCT) { baseRecently = true; break; }
    }
    if (base) baseRecently = true;

    // Trend — close > SMA200
    const maWindow = candles.slice(-MA_LEN);
    const sma200 = maWindow.reduce((a, c) => a + c.close, 0) / maWindow.length;
    const uptrend = last.close > sma200;

    // New-high reclaim — close > prior 252-bar high (excluding current bar)
    const priorWindow = candles.slice(Math.max(0, n - 1 - HI_LOOK), n - 1);
    const priorHigh = priorWindow.length > 0
      ? Math.max(...priorWindow.map(c => c.high))
      : Infinity;
    const newHighReclaim = last.close > priorHigh && uptrend;

    const greenSignal = (volumeSpike && upDay) || (!hasVolume && priceThrust);
    const regimeBreakout = baseRecently && newHighReclaim && greenSignal;

    return {
      thrust, base, uptrend, newHighReclaim, regimeBreakout,
      volumeRatio, volumeSpike, volumeGreen, consolidationRangePct,
    };
  } catch {
    return empty;
  }
}

async function scanAssetV3(asset: TradingAsset): Promise<TenXScanEntry | null> {
  if (asset.category !== "Indices") return null;
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const sig = await computeV3Signals(asset.symbol);

    const signalsActive =
      (sig.thrust ? 1 : 0) +
      (sig.base ? 1 : 0) +
      (sig.uptrend ? 1 : 0) +
      (sig.newHighReclaim ? 1 : 0) +
      (sig.regimeBreakout ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: sig.volumeRatio,
      volumeSpike: sig.volumeSpike,
      volumeGreen: sig.volumeGreen,
      heartbeat: false,
      consolidationRangePct: sig.consolidationRangePct,
      nearBreakout: false,
      recordQuarter: false,
      epsHistory: [],
      epsApplicable: false,
      trendUp: false,
      thrust: sig.thrust,
      base: sig.base,
      uptrend: sig.uptrend,
      newHighReclaim: sig.newHighReclaim,
      regimeBreakout: sig.regimeBreakout,
      signalsActive,
    };
  } catch {
    return null;
  }
}

// ─── 10X v3 Commodities ("Pine Power Moves — Commodities") ───────────────────
// 3 signals faithfully ported from the Pine Script:
//   #1 Green Volume Spike — volume >= 3× 20-bar avg on an up day
//   #2 Heartbeat          — multi-year consolidation (≤ 35% range over 400 bars,
//                           recent lows not collapsing vs older lows)
//   #3 Catalyst           — close > prior 100-bar high AND green spike on breakout

interface V3CommoditiesSignals {
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
  heartbeat: boolean;
  consolidationRangePct: number;
  catalyst: boolean;
}

async function computeV3CommoditiesSignals(symbol: string): Promise<V3CommoditiesSignals> {
  const empty: V3CommoditiesSignals = {
    volumeRatio: 0, volumeSpike: false, volumeGreen: false,
    heartbeat: false, consolidationRangePct: 999, catalyst: false,
  };
  try {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "2y")) as OHLCV[];
    if (candles.length < 110) return empty;

    const n = candles.length;
    const last = candles[n - 1];
    const upDay = last.close >= last.open;

    // Pine inputs
    const VOL_MULT = 3.0, VOL_LEN = 20;
    const HB_LEN = Math.min(400, n - 10); // cap to available data
    const HB_RANGE_PCT = 35.0;
    const BO_LOOK = Math.min(100, n - 2);

    // Signal #1: Volume spike
    const volWindow = candles.slice(-VOL_LEN);
    const volAvg = volWindow.reduce((a, c) => a + c.volume, 0) / VOL_LEN;
    const volumeRatio = volAvg > 0 ? Math.round((last.volume / volAvg) * 10) / 10 : 0;
    const volumeSpike = volAvg > 0 && last.volume >= volAvg * VOL_MULT;
    const volumeGreen = upDay;
    const greenSpike = volumeSpike && upDay;

    // Signal #2: Heartbeat (consolidation)
    const hbWindow = candles.slice(-HB_LEN);
    const hbHigh = Math.max(...hbWindow.map(c => c.high));
    const hbLow = Math.min(...hbWindow.map(c => c.low));
    const consolidationRangePct = hbLow > 0
      ? Math.round(((hbHigh - hbLow) / hbLow) * 1000) / 10
      : 999;
    const isFlat = consolidationRangePct <= HB_RANGE_PCT;

    // "not dying": recent half-window lows >= older lows * 0.98
    const halfLen = Math.max(2, Math.floor(HB_LEN / 2));
    const recentLow = Math.min(...candles.slice(-halfLen).map(c => c.low));
    const olderLow = hbLow;
    const notDying = recentLow >= olderLow * 0.98;
    const heartbeat = isFlat && notDying;

    // Signal #3: Catalyst — close > prior 100-bar high AND green spike on breakout
    const boRef = Math.max(...candles.slice(n - 1 - BO_LOOK, n - 1).map(c => c.high));
    const brokeOut = last.close > boRef;
    const catalyst = brokeOut && greenSpike;

    return { volumeRatio, volumeSpike, volumeGreen, heartbeat, consolidationRangePct, catalyst };
  } catch {
    return empty;
  }
}

async function scanAssetV3Commodities(asset: TradingAsset): Promise<TenXScanEntry | null> {
  if (asset.category !== "Commodities") return null;
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const sig = await computeV3CommoditiesSignals(asset.symbol);
    const signalsActive =
      (sig.volumeSpike && sig.volumeGreen ? 1 : 0) +
      (sig.heartbeat ? 1 : 0) +
      (sig.catalyst ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: sig.volumeRatio,
      volumeSpike: sig.volumeSpike,
      volumeGreen: sig.volumeGreen,
      heartbeat: sig.heartbeat,
      consolidationRangePct: sig.consolidationRangePct,
      nearBreakout: sig.catalyst,
      recordQuarter: false,
      epsHistory: [],
      epsApplicable: false,
      trendUp: false,
      thrust: false,
      base: false,
      uptrend: false,
      newHighReclaim: false,
      regimeBreakout: sig.catalyst,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function runAssetScannerV3Commodities(): Promise<TenXScanResponse> {
  if (_tenXV3CommoditiesCache && Date.now() - _tenXV3CommoditiesCache.ts < TENX_TTL) return _tenXV3CommoditiesCache.data;
  const commodities = TRADING_ASSETS.filter(a => a.category === "Commodities");
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(commodities, scanAssetV3Commodities, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: TENX_TTL / 1000,
  };
  _tenXV3CommoditiesCache = { data, ts: Date.now() };
  return data;
}

// ─── 10X v3 Forex ("Pine Power Moves — Forex Range Breakout") ────────────────
// 3 signals ported from the Pine Script:
//   #1 VOL      — tick-volume spike ≥ 2× 20-bar avg on a green day
//   #2 RANGE    — price range over 100 bars ≤ 8% (consolidation zone)
//   #3 BREAKOUT — rangeRecently + close > prior 100-bar high + close > SMA100 + greenSpike
// Session filter omitted: server runs on daily bars so kill-zone concept n/a.
// Only LONG (bullish) breakout is scored; short setups require separate scan.

interface V3ForexSignals {
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
  rangeConsolidation: boolean;   // stored in heartbeat field
  consolidationRangePct: number;
  breakout: boolean;             // stored in regimeBreakout field
}

async function computeV3ForexSignals(symbol: string): Promise<V3ForexSignals> {
  const empty: V3ForexSignals = {
    volumeRatio: 0, volumeSpike: false, volumeGreen: false,
    rangeConsolidation: false, consolidationRangePct: 999, breakout: false,
  };
  try {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "1y")) as OHLCV[];
    if (candles.length < 110) return empty;

    const n = candles.length;
    const last = candles[n - 1];
    const upDay = last.close >= last.open;

    // Pine inputs
    const VOL_MULT = 2.0, VOL_LEN = 20;
    const RANGE_LEN = Math.min(100, n - 5);
    const RANGE_MAX_PCT = 8.0;
    const MA_LEN = Math.min(100, n - 2);

    // Signal #1: tick-volume spike
    const volWindow = candles.slice(-VOL_LEN);
    const volAvg = volWindow.reduce((a, c) => a + c.volume, 0) / VOL_LEN;
    const volumeRatio = volAvg > 0 ? Math.round((last.volume / volAvg) * 10) / 10 : 0;
    const volumeSpike = volAvg > 0 && last.volume >= volAvg * VOL_MULT;
    const volumeGreen = upDay;
    const greenSpike = volumeSpike && upDay;

    // Signal #2: range consolidation
    const rangeWindow = candles.slice(-RANGE_LEN);
    const rHigh = Math.max(...rangeWindow.map(c => c.high));
    const rLow = Math.min(...rangeWindow.map(c => c.low));
    const consolidationRangePct = rLow > 0
      ? Math.round(((rHigh - rLow) / rLow) * 1000) / 10
      : 999;
    const rangeConsolidation = consolidationRangePct <= RANGE_MAX_PCT;

    // rangeRecently: any of the last 15 bars was in consolidation
    let rangeRecently = rangeConsolidation;
    if (!rangeRecently) {
      for (let look = 1; look <= 15 && n - look - RANGE_LEN >= 0; look++) {
        const win = candles.slice(n - look - RANGE_LEN, n - look);
        const hi = Math.max(...win.map(c => c.high));
        const lo = Math.min(...win.map(c => c.low));
        const pct = lo > 0 ? ((hi - lo) / lo) * 100 : 999;
        if (pct <= RANGE_MAX_PCT) { rangeRecently = true; break; }
      }
    }

    // Trend MA
    const maWindow = candles.slice(-MA_LEN);
    const trendMA = maWindow.reduce((a, c) => a + c.close, 0) / maWindow.length;
    const aboveTrend = last.close > trendMA;

    // Signal #3: long breakout (close > prior RANGE_LEN high[1], above trend MA, green spike)
    const refHigh = Math.max(...candles.slice(n - 1 - RANGE_LEN, n - 1).map(c => c.high));
    const breakout = rangeRecently && last.close > refHigh && aboveTrend && greenSpike;

    return { volumeRatio, volumeSpike, volumeGreen, rangeConsolidation, consolidationRangePct, breakout };
  } catch {
    return empty;
  }
}

async function scanAssetV3Forex(asset: TradingAsset): Promise<TenXScanEntry | null> {
  if (asset.category !== "Forex") return null;
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const sig = await computeV3ForexSignals(asset.symbol);
    const signalsActive =
      (sig.volumeSpike && sig.volumeGreen ? 1 : 0) +
      (sig.rangeConsolidation ? 1 : 0) +
      (sig.breakout ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: sig.volumeRatio,
      volumeSpike: sig.volumeSpike,
      volumeGreen: sig.volumeGreen,
      heartbeat: sig.rangeConsolidation,
      consolidationRangePct: sig.consolidationRangePct,
      nearBreakout: sig.breakout,
      recordQuarter: false,
      epsHistory: [],
      epsApplicable: false,
      trendUp: false,
      thrust: false,
      base: false,
      uptrend: false,
      newHighReclaim: false,
      regimeBreakout: sig.breakout,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function runAssetScannerV3Forex(): Promise<TenXScanResponse> {
  if (_tenXV3ForexCache && Date.now() - _tenXV3ForexCache.ts < TENX_TTL) return _tenXV3ForexCache.data;
  const forexAssets = TRADING_ASSETS.filter(a => a.category === "Forex");
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(forexAssets, scanAssetV3Forex, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: TENX_TTL / 1000 };
  _tenXV3ForexCache = { data, ts: Date.now() };
  return data;
}

// ─── 10X v3 Crypto ("Pine Power Moves — Crypto") ─────────────────────────────
// 3 signals ported from the Pine Script:
//   #1 VOL      — volume spike ≥ 3× 20-bar avg on a green day
//   #2 HEARTBEAT — base consolidation ≤ 40% range over 180 bars, lows not collapsing (0.97)
//   #3 CATALYST  — close > prior 90-bar high AND green spike (baseRecently required)

interface V3CryptoSignals {
  volumeRatio: number;
  volumeSpike: boolean;
  volumeGreen: boolean;
  heartbeat: boolean;
  consolidationRangePct: number;
  catalyst: boolean;
}

async function computeV3CryptoSignals(symbol: string): Promise<V3CryptoSignals> {
  const empty: V3CryptoSignals = {
    volumeRatio: 0, volumeSpike: false, volumeGreen: false,
    heartbeat: false, consolidationRangePct: 999, catalyst: false,
  };
  try {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "2y")) as OHLCV[];
    if (candles.length < 95) return empty;

    const n = candles.length;
    const last = candles[n - 1];
    const upDay = last.close >= last.open;

    const VOL_MULT = 3.0, VOL_LEN = 20;
    const HB_LEN = Math.min(180, n - 10);
    const HB_RANGE_PCT = 40.0;
    const BO_LOOK = Math.min(90, n - 2);

    // Signal #1: volume spike
    const volWindow = candles.slice(-VOL_LEN);
    const volAvg = volWindow.reduce((a, c) => a + c.volume, 0) / VOL_LEN;
    const volumeRatio = volAvg > 0 ? Math.round((last.volume / volAvg) * 10) / 10 : 0;
    const volumeSpike = volAvg > 0 && last.volume >= volAvg * VOL_MULT;
    const volumeGreen = upDay;
    const greenSpike = volumeSpike && upDay;

    // Signal #2: heartbeat base
    const hbWindow = candles.slice(-HB_LEN);
    const hbHigh = Math.max(...hbWindow.map(c => c.high));
    const hbLow = Math.min(...hbWindow.map(c => c.low));
    const consolidationRangePct = hbLow > 0
      ? Math.round(((hbHigh - hbLow) / hbLow) * 1000) / 10
      : 999;
    const isFlat = consolidationRangePct <= HB_RANGE_PCT;

    const halfLen = Math.max(2, Math.floor(HB_LEN / 2));
    const recentLow = Math.min(...candles.slice(-halfLen).map(c => c.low));
    const notDying = recentLow >= hbLow * 0.97;
    const heartbeat = isFlat && notDying;

    // baseRecently: any of the last 10 bars was in a base
    let baseRecently = heartbeat;
    if (!baseRecently) {
      for (let look = 1; look <= 10 && n - look - HB_LEN >= 0; look++) {
        const win = candles.slice(n - look - HB_LEN, n - look);
        const hi = Math.max(...win.map(c => c.high));
        const lo = Math.min(...win.map(c => c.low));
        const pct = lo > 0 ? ((hi - lo) / lo) * 100 : 999;
        const rLow = Math.min(...win.map(c => c.low));
        const rHalfLow = Math.min(...win.slice(-Math.floor(win.length / 2)).map(c => c.low));
        if (pct <= HB_RANGE_PCT && rHalfLow >= rLow * 0.97) { baseRecently = true; break; }
      }
    }

    // Signal #3: catalyst — close > prior 90-bar high + green spike
    const boRef = Math.max(...candles.slice(n - 1 - BO_LOOK, n - 1).map(c => c.high));
    const brokeOut = last.close > boRef;
    const catalyst = baseRecently && brokeOut && greenSpike;

    return { volumeRatio, volumeSpike, volumeGreen, heartbeat, consolidationRangePct, catalyst };
  } catch {
    return empty;
  }
}

async function scanAssetV3Crypto(asset: TradingAsset): Promise<TenXScanEntry | null> {
  if (asset.category !== "Crypto") return null;
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const sig = await computeV3CryptoSignals(asset.symbol);
    const signalsActive =
      (sig.volumeSpike && sig.volumeGreen ? 1 : 0) +
      (sig.heartbeat ? 1 : 0) +
      (sig.catalyst ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: sig.volumeRatio,
      volumeSpike: sig.volumeSpike,
      volumeGreen: sig.volumeGreen,
      heartbeat: sig.heartbeat,
      consolidationRangePct: sig.consolidationRangePct,
      nearBreakout: sig.catalyst,
      recordQuarter: false,
      epsHistory: [],
      epsApplicable: false,
      trendUp: false,
      thrust: false,
      base: false,
      uptrend: false,
      newHighReclaim: false,
      regimeBreakout: sig.catalyst,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function runAssetScannerV3Crypto(): Promise<TenXScanResponse> {
  if (_tenXV3CryptoCache && Date.now() - _tenXV3CryptoCache.ts < TENX_TTL) return _tenXV3CryptoCache.data;
  const cryptoAssets = TRADING_ASSETS.filter(a => a.category === "Crypto");
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(cryptoAssets, scanAssetV3Crypto, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: TENX_TTL / 1000 };
  _tenXV3CryptoCache = { data, ts: Date.now() };
  return data;
}

async function scanAssetV2(asset: TradingAsset): Promise<TenXScanEntry | null> {
  try {
    const priceEntry = latestPrices.get(asset.symbol);
    if (!priceEntry) return null;

    const [vsResult, hbResult, eqResult, trResult] = await Promise.allSettled([
      computeVolumeSpike(asset.symbol),
      computeHeartbeatV2(asset.symbol),
      computeRecordQuarter(asset.symbol, asset.category),
      computeTrend(asset.symbol),
    ]);

    const vs = vsResult.status === "fulfilled"
      ? vsResult.value
      : { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
    const hb = hbResult.status === "fulfilled"
      ? hbResult.value
      : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
    const eq = eqResult.status === "fulfilled"
      ? eqResult.value
      : { recordQuarter: false, epsHistory: [], epsApplicable: false };
    const tr = trResult.status === "fulfilled"
      ? trResult.value
      : { trendUp: false };

    const signalsActive =
      (vs.volumeSpike && vs.volumeGreen ? 1 : 0) +
      (hb.heartbeat ? 1 : 0) +
      (eq.recordQuarter ? 1 : 0) +
      (tr.trendUp ? 1 : 0);

    return {
      symbol: asset.symbol,
      name: asset.name,
      flag: asset.flag,
      category: asset.category,
      price: priceEntry.price,
      changePercent: priceEntry.changePercent,
      volumeRatio: vs.volumeRatio,
      volumeSpike: vs.volumeSpike,
      volumeGreen: vs.volumeGreen,
      heartbeat: hb.heartbeat,
      consolidationRangePct: hb.consolidationRangePct,
      nearBreakout: hb.nearBreakout,
      recordQuarter: eq.recordQuarter,
      epsHistory: eq.epsHistory,
      epsApplicable: eq.epsApplicable,
      trendUp: tr.trendUp,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function scanScreenerStockV2(quote: ScreenerQuote, category = "Stocks"): Promise<TenXScanEntry | null> {
  try {
    const avgVol = quote.averageDailyVolume10Day ?? quote.averageDailyVolume3Month ?? 0;
    const volumeRatio = avgVol > 0
      ? Math.round((quote.regularMarketVolume / avgVol) * 10) / 10
      : 0;
    const volumeSpike = volumeRatio >= 3.0;
    const volumeGreen = quote.regularMarketChangePercent > 0;

    const [hbResult, eqResult, trResult] = await Promise.allSettled([
      computeHeartbeatV2(quote.symbol),
      computeRecordQuarter(quote.symbol, "Stocks"),
      computeTrend(quote.symbol),
    ]);

    const hb = hbResult.status === "fulfilled"
      ? hbResult.value
      : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
    const eq = eqResult.status === "fulfilled"
      ? eqResult.value
      : { recordQuarter: false, epsHistory: [], epsApplicable: false };
    const tr = trResult.status === "fulfilled"
      ? trResult.value
      : { trendUp: false };

    const signalsActive =
      (volumeSpike && volumeGreen ? 1 : 0) +
      (hb.heartbeat ? 1 : 0) +
      (eq.recordQuarter ? 1 : 0) +
      (tr.trendUp ? 1 : 0);

    return {
      symbol: quote.symbol,
      name: quote.shortName ?? quote.longName ?? quote.symbol,
      flag: "",
      category,
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      volumeRatio,
      volumeSpike,
      volumeGreen,
      heartbeat: hb.heartbeat,
      consolidationRangePct: hb.consolidationRangePct,
      nearBreakout: hb.nearBreakout,
      recordQuarter: eq.recordQuarter,
      epsHistory: eq.epsHistory,
      epsApplicable: eq.epsApplicable,
      trendUp: tr.trendUp,
      signalsActive,
    };
  } catch {
    return null;
  }
}

async function runIndianStockScannerV2(): Promise<TenXScanResponse> {
  if (_indianV2ScanCache && Date.now() - _indianV2ScanCache.ts < STOCK_SCAN_TTL) return _indianV2ScanCache.data;
  const universe = await fetchIndianStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "India"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _indianV2ScanCache = { data, ts: Date.now() };
  return data;
}

async function fetchUKStockUniverse(): Promise<ScreenerQuote[]> {
  if (_ukScreenerCache && Date.now() - _ukScreenerCache.ts < SCREENER_TTL) {
    return _ukScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=en-GB&region=GB&count=100&start=0";
    const [activeRes, gainersRes] = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives_gb${params}`),
      yfFetch<ScreenerResponse>(`${base}?scrIds=day_gainers_gb${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes), ...extract(gainersRes)];

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (
        q.quoteType === "EQUITY" &&
        q.regularMarketPrice >= 1 &&
        avgVol >= 100_000
      ) {
        stocks.push(q);
      }
    }

    _ukScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runUKStockScanner(): Promise<TenXScanResponse> {
  if (_ukScanCache && Date.now() - _ukScanCache.ts < STOCK_SCAN_TTL) return _ukScanCache.data;
  const universe = await fetchUKStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "UK"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _ukScanCache = { data, ts: Date.now() };
  return data;
}

async function runUKStockScannerV2(): Promise<TenXScanResponse> {
  if (_ukV2ScanCache && Date.now() - _ukV2ScanCache.ts < STOCK_SCAN_TTL) return _ukV2ScanCache.data;
  const universe = await fetchUKStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "UK"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _ukV2ScanCache = { data, ts: Date.now() };
  return data;
}

// ─── Japan ────────────────────────────────────────────────────────────────────

async function fetchJapanStockUniverse(): Promise<ScreenerQuote[]> {
  if (_jpScreenerCache && Date.now() - _jpScreenerCache.ts < SCREENER_TTL) {
    return _jpScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=ja-JP&region=JP&count=250&start=0";
    const activeRes = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives_jp${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes[0])];

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (q.quoteType === "EQUITY" && q.regularMarketPrice >= 1 && avgVol >= 100_000) {
        stocks.push(q);
      }
    }

    _jpScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runJapanStockScanner(): Promise<TenXScanResponse> {
  if (_jpScanCache && Date.now() - _jpScanCache.ts < STOCK_SCAN_TTL) return _jpScanCache.data;
  const universe = await fetchJapanStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "Japan"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _jpScanCache = { data, ts: Date.now() };
  return data;
}

async function runJapanStockScannerV2(): Promise<TenXScanResponse> {
  if (_jpV2ScanCache && Date.now() - _jpV2ScanCache.ts < STOCK_SCAN_TTL) return _jpV2ScanCache.data;
  const universe = await fetchJapanStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "Japan"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _jpV2ScanCache = { data, ts: Date.now() };
  return data;
}

// ─── Hong Kong ────────────────────────────────────────────────────────────────

async function fetchHKStockUniverse(): Promise<ScreenerQuote[]> {
  if (_hkScreenerCache && Date.now() - _hkScreenerCache.ts < SCREENER_TTL) {
    return _hkScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=zh-HK&region=HK&count=250&start=0";
    const activeRes = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives_hk${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes[0])];

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (q.quoteType === "EQUITY" && q.regularMarketPrice >= 1 && avgVol >= 100_000) {
        stocks.push(q);
      }
    }

    _hkScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runHKStockScanner(): Promise<TenXScanResponse> {
  if (_hkScanCache && Date.now() - _hkScanCache.ts < STOCK_SCAN_TTL) return _hkScanCache.data;
  const universe = await fetchHKStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "Hong Kong"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _hkScanCache = { data, ts: Date.now() };
  return data;
}

async function runHKStockScannerV2(): Promise<TenXScanResponse> {
  if (_hkV2ScanCache && Date.now() - _hkV2ScanCache.ts < STOCK_SCAN_TTL) return _hkV2ScanCache.data;
  const universe = await fetchHKStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "Hong Kong"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _hkV2ScanCache = { data, ts: Date.now() };
  return data;
}

// ─── China ────────────────────────────────────────────────────────────────────

async function fetchChinaStockUniverse(): Promise<ScreenerQuote[]> {
  if (_cnScreenerCache && Date.now() - _cnScreenerCache.ts < SCREENER_TTL) {
    return _cnScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const params = "&formatted=false&lang=zh-CN&region=CN&count=250&start=0";
    const activeRes = await Promise.allSettled([
      yfFetch<ScreenerResponse>(`${base}?scrIds=most_actives_cn${params}`),
    ]);

    const extract = (res: PromiseSettledResult<ScreenerResponse>): ScreenerQuote[] =>
      res.status === "fulfilled"
        ? (res.value?.finance?.result?.[0]?.quotes ?? [])
        : [];

    const combined = [...extract(activeRes[0])];

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (q.quoteType === "EQUITY" && q.regularMarketPrice >= 1 && avgVol >= 100_000) {
        stocks.push(q);
      }
    }

    _cnScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runChinaStockScanner(): Promise<TenXScanResponse> {
  if (_cnScanCache && Date.now() - _cnScanCache.ts < STOCK_SCAN_TTL) return _cnScanCache.data;
  const universe = await fetchChinaStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "China"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _cnScanCache = { data, ts: Date.now() };
  return data;
}

async function runChinaStockScannerV2(): Promise<TenXScanResponse> {
  if (_cnV2ScanCache && Date.now() - _cnV2ScanCache.ts < STOCK_SCAN_TTL) return _cnV2ScanCache.data;
  const universe = await fetchChinaStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "China"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _cnV2ScanCache = { data, ts: Date.now() };
  return data;
}

// ─── Euronext (FR + NL + DE + IT + NO) ───────────────────────────────────────

async function fetchEuronextStockUniverse(): Promise<ScreenerQuote[]> {
  if (_euronextScreenerCache && Date.now() - _euronextScreenerCache.ts < SCREENER_TTL) {
    return _euronextScreenerCache.stocks;
  }
  try {
    const base = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";
    const regions: Array<{ scrId: string; lang: string; region: string }> = [
      { scrId: "most_actives_fr", lang: "fr-FR", region: "FR" },
      { scrId: "most_actives_nl", lang: "nl-NL", region: "NL" },
      { scrId: "most_actives_de", lang: "de-DE", region: "DE" },
      { scrId: "most_actives_it", lang: "it-IT", region: "IT" },
      { scrId: "most_actives_no", lang: "no-NO", region: "NO" },
    ];

    const results = await Promise.allSettled(
      regions.map(r =>
        yfFetch<ScreenerResponse>(
          `${base}?scrIds=${r.scrId}&formatted=false&lang=${r.lang}&region=${r.region}&count=250&start=0`
        )
      )
    );

    const combined: ScreenerQuote[] = [];
    for (const res of results) {
      if (res.status === "fulfilled") {
        combined.push(...(res.value?.finance?.result?.[0]?.quotes ?? []));
      }
    }

    const seen = new Set<string>();
    const stocks: ScreenerQuote[] = [];
    for (const q of combined) {
      if (seen.has(q.symbol)) continue;
      seen.add(q.symbol);
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0;
      if (q.quoteType === "EQUITY" && q.regularMarketPrice >= 1 && avgVol >= 100_000) {
        stocks.push(q);
      }
    }

    _euronextScreenerCache = { stocks, ts: Date.now() };
    return stocks;
  } catch {
    return [];
  }
}

async function runEuronextStockScanner(): Promise<TenXScanResponse> {
  if (_euronextScanCache && Date.now() - _euronextScanCache.ts < STOCK_SCAN_TTL) return _euronextScanCache.data;
  const universe = await fetchEuronextStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStock(q, "Euronext"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _euronextScanCache = { data, ts: Date.now() };
  return data;
}

async function runEuronextStockScannerV2(): Promise<TenXScanResponse> {
  if (_euronextV2ScanCache && Date.now() - _euronextV2ScanCache.ts < STOCK_SCAN_TTL) return _euronextV2ScanCache.data;
  const universe = await fetchEuronextStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(
    universe,
    (q) => scanScreenerStockV2(q, "Euronext"),
    5,
  );
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = { assets, lastUpdated: new Date().toISOString(), cacheTtlSeconds: STOCK_SCAN_TTL / 1000 };
  _euronextV2ScanCache = { data, ts: Date.now() };
  return data;
}

async function runAssetScannerV2(): Promise<TenXScanResponse> {
  if (_tenXV2Cache && Date.now() - _tenXV2Cache.ts < TENX_TTL) return _tenXV2Cache.data;
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(TRADING_ASSETS, scanAssetV2, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: TENX_TTL / 1000,
  };
  _tenXV2Cache = { data, ts: Date.now() };
  return data;
}

async function runAssetScannerV3(): Promise<TenXScanResponse> {
  if (_tenXV3Cache && Date.now() - _tenXV3Cache.ts < TENX_TTL) return _tenXV3Cache.data;
  const indices = TRADING_ASSETS.filter(a => a.category === "Indices");
  const raw = await runWithConcurrency<TradingAsset, TenXScanEntry>(indices, scanAssetV3, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: TENX_TTL / 1000,
  };
  _tenXV3Cache = { data, ts: Date.now() };
  return data;
}

async function runStockScannerV2(): Promise<TenXScanResponse> {
  if (_stockV2ScanCache && Date.now() - _stockV2ScanCache.ts < STOCK_SCAN_TTL) return _stockV2ScanCache.data;
  const universe = await fetchStockUniverse();
  const raw = await runWithConcurrency<ScreenerQuote, TenXScanEntry>(universe, scanScreenerStockV2, 5);
  const assets = raw
    .filter((r): r is TenXScanEntry => r !== null && r.signalsActive > 0)
    .sort((a, b) => b.signalsActive - a.signalsActive || b.volumeRatio - a.volumeRatio);
  const data: TenXScanResponse = {
    assets,
    lastUpdated: new Date().toISOString(),
    cacheTtlSeconds: STOCK_SCAN_TTL / 1000,
  };
  _stockV2ScanCache = { data, ts: Date.now() };
  return data;
}

// ─── 10X Scanner Single-Symbol ───────────────────────────────────────────────
// On-demand scan for any symbol — runs v1 and v2 computations in parallel.
// No caching: each call is user-triggered, live data only.

async function scanSingleSymbol(symbol: string, displayName?: string): Promise<{
  v1: TenXScanEntry;
  v2: TenXScanEntry;
  lastUpdated: string;
} | null> {
  const knownAsset = ASSET_MAP.get(symbol);
  const category = knownAsset?.category ?? "Stocks";
  const name = displayName?.trim() || knownAsset?.name || symbol;
  const flag = knownAsset?.flag ?? "";

  let priceEntry = latestPrices.get(symbol);
  if (!priceEntry) {
    priceEntry = (await fetchCurrentPrice(symbol)) ?? undefined;
  }
  if (!priceEntry) return null;

  const { price, changePercent } = priceEntry;

  const [vsResult, hbV1Result, hbV2Result, eqResult, trResult] = await Promise.allSettled([
    computeVolumeSpike(symbol),
    computeHeartbeat(symbol),
    computeHeartbeatV2(symbol),
    computeRecordQuarter(symbol, category),
    computeTrend(symbol),
  ]);

  const vs  = vsResult.status    === "fulfilled" ? vsResult.value    : { volumeRatio: 0, volumeSpike: false, volumeGreen: false };
  const hb1 = hbV1Result.status  === "fulfilled" ? hbV1Result.value  : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
  const hb2 = hbV2Result.status  === "fulfilled" ? hbV2Result.value  : { heartbeat: false, consolidationRangePct: 999, nearBreakout: false };
  const eq  = eqResult.status    === "fulfilled" ? eqResult.value    : { recordQuarter: false, epsHistory: [], epsApplicable: false };
  const tr  = trResult.status    === "fulfilled" ? trResult.value    : { trendUp: false };

  const base = {
    symbol, name, flag, category, price, changePercent,
    volumeRatio: vs.volumeRatio, volumeSpike: vs.volumeSpike, volumeGreen: vs.volumeGreen,
    recordQuarter: eq.recordQuarter, epsHistory: eq.epsHistory, epsApplicable: eq.epsApplicable,
  };

  const v1: TenXScanEntry = {
    ...base,
    heartbeat: hb1.heartbeat, consolidationRangePct: hb1.consolidationRangePct, nearBreakout: hb1.nearBreakout,
    trendUp: false,
    signalsActive: (vs.volumeSpike && vs.volumeGreen ? 1 : 0) + (hb1.heartbeat ? 1 : 0) + (eq.recordQuarter ? 1 : 0),
  };

  const v2: TenXScanEntry = {
    ...base,
    heartbeat: hb2.heartbeat, consolidationRangePct: hb2.consolidationRangePct, nearBreakout: hb2.nearBreakout,
    trendUp: tr.trendUp,
    signalsActive: (vs.volumeSpike && vs.volumeGreen ? 1 : 0) + (hb2.heartbeat ? 1 : 0) + (eq.recordQuarter ? 1 : 0) + (tr.trendUp ? 1 : 0),
  };

  return { v1, v2, lastUpdated: new Date().toISOString() };
}

// ─── 10X Scanner Backtest ────────────────────────────────────────────────────
// Validates whether historical volume-spike events preceded positive returns.
// Trigger: volume spike on green day. Context: heartbeat, trend, record quarter.
// Each event's forward returns are measured at +5/+21/+63/+126/+252 trading days.

interface BacktestForwardReturns {
  d5: number | null;   // ~1 week
  d21: number | null;  // ~1 month
  d63: number | null;  // ~3 months
  d126: number | null; // ~6 months
  d252: number | null; // ~1 year
  d756: number | null; // ~3 years (null for signals < 3y from today)
}

interface BacktestSignalEvent {
  date: string;
  signalCount: number;
  volumeSpike: boolean;
  heartbeat: boolean;
  recordQuarter: boolean;
  trendUp: boolean;
  epsApplicable: boolean;
  priceAtSignal: number;
  returns: BacktestForwardReturns;
  dow?: string;           // "Mon"–"Fri" — day of week for DOW bucket analysis
  vixAtDate?: number | null; // VIX close on signal date for VIX bucket analysis
}

interface BacktestSummaryStats {
  events: number;
  winRate1m: number;
  winRate3m: number;
  winRate6m: number;
  winRate1y: number;
  winRate3y: number;
  avgReturn1m: number;
  avgReturn3m: number;
  avgReturn6m: number;
  avgReturn3y: number;
  sampleSize3y: number; // how many events had ≥3y of forward data
  // New: breakdown analytics
  byDayOfWeek?: Record<string, { events: number; winRate1m: number }>;
  byVixBucket?: Record<string, { events: number; winRate1m: number }>;
  winRateLower95?: number | null;
  winRateUpper95?: number | null;
}

interface BacktestAssetResult {
  symbol: string;
  name: string;
  category: string;
  flag: string;
  totalEvents: number;
  bySignalCount: Record<string, BacktestSummaryStats>;
  events: BacktestSignalEvent[];
}

interface ScannerBacktestResponse {
  version: string;
  type: string;
  fromDate: string;
  toDate: string;
  assets: BacktestAssetResult[];
  aggregate: {
    totalEvents: number;
    bySignalCount: Record<string, BacktestSummaryStats>;
  };
  lastUpdated: string;
}

// Cache: keyed by "v1-assets", "v1-stocks", "v2-assets", "v2-stocks"
const _backtestCache = new Map<string, { data: ScannerBacktestResponse; ts: number }>();
const BACKTEST_SCANNER_TTL = 24 * 60 * 60_000; // 24h — historical data doesn't change

function computeForwardReturns(candles: OHLCV[], idx: number, entryPrice: number): BacktestForwardReturns {
  const ret = (offset: number): number | null => {
    const future = candles[idx + offset];
    if (!future || entryPrice === 0) return null;
    return Math.round(((future.close - entryPrice) / entryPrice) * 10000) / 100;
  };
  return { d5: ret(5), d21: ret(21), d63: ret(63), d126: ret(126), d252: ret(252), d756: ret(756) };
}

function evalEpsRecordQuarter(
  epsData: FinnhubEarningsItem[],
  dateStr: string,
  category: string
): { recordQuarter: boolean; epsApplicable: boolean } {
  const nonStock = ["Commodities", "Indices", "Crypto", "Forex"];
  if (nonStock.includes(category)) return { recordQuarter: false, epsApplicable: false };
  if (!FINNHUB_KEY || epsData.length === 0) return { recordQuarter: false, epsApplicable: false };
  const available = epsData
    .filter(e => e.period <= dateStr)
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 4);
  if (available.length < 2) return { recordQuarter: false, epsApplicable: true };
  const vals = available.map(e => e.actual ?? 0);
  const recordQuarter = vals[0] > 0 && vals.slice(1).every(v => vals[0] > v);
  return { recordQuarter, epsApplicable: true };
}

function dayOfWeek(dateStr: string): string {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(dateStr).getDay()];
}

function bootstrapCI(wins: boolean[], nResamples = 1000): { lower95: number | null; upper95: number | null } {
  if (wins.length < 10) return { lower95: null, upper95: null };
  const rates: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    let w = 0;
    for (let j = 0; j < wins.length; j++) {
      if (wins[Math.floor(Math.random() * wins.length)]) w++;
    }
    rates.push(w / wins.length);
  }
  rates.sort((a, b) => a - b);
  return {
    lower95: Math.round(rates[Math.floor(nResamples * 0.025)] * 1000) / 10,
    upper95: Math.round(rates[Math.floor(nResamples * 0.975)] * 1000) / 10,
  };
}

function buildAssetResult(
  symbol: string, name: string, category: string, flag: string,
  events: BacktestSignalEvent[]
): BacktestAssetResult {
  const bySignalCount: Record<string, BacktestSummaryStats> = {};
  for (let n = 1; n <= 4; n++) {
    const evs = events.filter(e => e.signalCount === n);
    if (evs.length === 0) continue;
    const returns1m = evs.map(e => e.returns.d21).filter((v): v is number => v !== null);
    const returns3m = evs.map(e => e.returns.d63).filter((v): v is number => v !== null);
    const returns6m = evs.map(e => e.returns.d126).filter((v): v is number => v !== null);
    const returns1y = evs.map(e => e.returns.d252).filter((v): v is number => v !== null);
    const returns3y = evs.map(e => e.returns.d756).filter((v): v is number => v !== null);
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100 : 0;
    const winRate = (arr: number[]) => arr.length ? Math.round(arr.filter(v => v > 0).length / arr.length * 1000) / 10 : 0;

    // DOW breakdown
    const dowBuckets: Record<string, boolean[]> = {};
    for (const e of evs) {
      if (!e.dow || e.returns.d21 === null) continue;
      (dowBuckets[e.dow] ??= []).push(e.returns.d21 > 0);
    }
    const byDayOfWeek: Record<string, { events: number; winRate1m: number }> = {};
    for (const [d, wins] of Object.entries(dowBuckets)) {
      byDayOfWeek[d] = { events: wins.length, winRate1m: Math.round(wins.filter(Boolean).length / wins.length * 1000) / 10 };
    }

    // VIX bucket breakdown
    const vixGroups: Record<string, boolean[]> = { "0-15": [], "15-25": [], "25+": [] };
    for (const e of evs) {
      if (e.vixAtDate == null || e.returns.d21 === null) continue;
      const bkt = e.vixAtDate < 15 ? "0-15" : e.vixAtDate < 25 ? "15-25" : "25+";
      vixGroups[bkt].push(e.returns.d21 > 0);
    }
    const byVixBucket: Record<string, { events: number; winRate1m: number }> = {};
    for (const [bkt, wins] of Object.entries(vixGroups)) {
      if (wins.length > 0) byVixBucket[bkt] = { events: wins.length, winRate1m: Math.round(wins.filter(Boolean).length / wins.length * 1000) / 10 };
    }

    const { lower95, upper95 } = bootstrapCI(returns1m.map(v => v > 0));

    bySignalCount[String(n)] = {
      events: evs.length,
      winRate1m: winRate(returns1m),
      winRate3m: winRate(returns3m),
      winRate6m: winRate(returns6m),
      winRate1y: winRate(returns1y),
      winRate3y: winRate(returns3y),
      avgReturn1m: avg(returns1m),
      avgReturn3m: avg(returns3m),
      avgReturn6m: avg(returns6m),
      avgReturn3y: avg(returns3y),
      sampleSize3y: returns3y.length,
      byDayOfWeek,
      byVixBucket,
      winRateLower95: lower95,
      winRateUpper95: upper95,
    };
  }
  return { symbol, name, category, flag, totalEvents: events.length, bySignalCount, events };
}

async function backtestSymbol(
  symbol: string,
  name: string,
  category: string,
  flag: string,
  version: "v1" | "v2"
): Promise<BacktestAssetResult | null> {
  try {
    const allCandles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", "5y")) as OHLCV[];
    if (allCandles.length < 300) return null;

    // Historical VIX for VIX bucket analysis — in-flight dedup coalesces across concurrent calls
    const vixCandles = await (yahooProvider.fetchHistoryCandles("^VIX", "1d", "5y") as Promise<OHLCV[]>)
      .catch(() => [] as OHLCV[]);
    const vixByDate = new Map<string, number>();
    for (const c of vixCandles) {
      vixByDate.set(new Date(c.time * 1000).toISOString().slice(0, 10), c.close);
    }

    // Fetch EPS once (non-stocks return [] immediately)
    let epsData: FinnhubEarningsItem[] = [];
    const nonStock = ["Commodities", "Indices", "Crypto", "Forex"];
    if (!nonStock.includes(category) && FINNHUB_KEY) {
      try {
        const raw = await yfFetch<FinnhubEarningsItem[]>(
          `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
        );
        if (Array.isArray(raw)) epsData = raw;
      } catch { /* skip EPS if unavailable */ }
    }

    const lookback = version === "v1" ? 504 : 220;
    const events: BacktestSignalEvent[] = [];
    const startIdx = Math.max(lookback, 70); // ensure enough history for MA50 too
    const endIdx = allCandles.length - 253;  // need at least 1y forward data

    for (let i = startIdx; i <= endIdx; i++) {
      const c = allCandles[i];

      // Volume spike (in-memory)
      const slice20 = allCandles.slice(i - 20, i);
      const avgVol = slice20.reduce((s, v) => s + v.volume, 0) / 20;
      if (avgVol === 0 || c.volume / avgVol < 3.0 || c.close <= c.open) continue;

      // Heartbeat (in-memory slice)
      const hbSlice = allCandles.slice(i - lookback, i + 1);
      const hi = Math.max(...hbSlice.map(v => v.high));
      const lo = Math.min(...hbSlice.map(v => v.low));
      const rangePct = ((hi - lo) / lo) * 100;
      const heartbeat = rangePct < (version === "v1" ? 30 : 35);

      // Trend — v2 only (in-memory MA50)
      let trendUp = false;
      if (version === "v2") {
        const closes = allCandles.slice(Math.max(0, i - 69), i + 1).map(v => v.close);
        const n = closes.length;
        const sma50 = (end: number) =>
          closes.slice(Math.max(0, end - 50), end).reduce((a, b) => a + b, 0) /
          Math.min(50, Math.max(1, end));
        trendUp = sma50(n) >= sma50(Math.max(20, n - 20));
      }

      // Record quarter (EPS filtered to ≤ signal date)
      const dateStr = new Date(c.time * 1000).toISOString().slice(0, 10);
      const { recordQuarter, epsApplicable } = evalEpsRecordQuarter(epsData, dateStr, category);

      const signalCount =
        1 + (heartbeat ? 1 : 0) + (recordQuarter ? 1 : 0) + (trendUp ? 1 : 0);

      events.push({
        date: dateStr,
        signalCount,
        volumeSpike: true,
        heartbeat,
        recordQuarter,
        trendUp,
        epsApplicable,
        priceAtSignal: c.close,
        returns: computeForwardReturns(allCandles, i, c.close),
        dow: dayOfWeek(dateStr),
        vixAtDate: vixByDate.get(dateStr) ?? null,
      });
    }

    return buildAssetResult(symbol, name, category, flag, events);
  } catch {
    return null;
  }
}

function buildAggregate(assets: BacktestAssetResult[]): ScannerBacktestResponse["aggregate"] {
  let totalEvents = 0;
  const combined: Record<string, BacktestSignalEvent[]> = {};
  for (const a of assets) {
    totalEvents += a.totalEvents;
    for (const e of a.events) {
      const k = String(e.signalCount);
      (combined[k] ??= []).push(e);
    }
  }
  const bySignalCount: Record<string, BacktestSummaryStats> = {};
  for (const [k, evs] of Object.entries(combined)) {
    const r1m = evs.map(e => e.returns.d21).filter((v): v is number => v !== null);
    const r3m = evs.map(e => e.returns.d63).filter((v): v is number => v !== null);
    const r6m = evs.map(e => e.returns.d126).filter((v): v is number => v !== null);
    const r1y = evs.map(e => e.returns.d252).filter((v): v is number => v !== null);
    const r3y = evs.map(e => e.returns.d756).filter((v): v is number => v !== null);
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100 : 0;
    const wr = (arr: number[]) => arr.length ? Math.round(arr.filter(v => v > 0).length / arr.length * 1000) / 10 : 0;

    // DOW breakdown (aggregate)
    const dowBuckets: Record<string, boolean[]> = {};
    for (const e of evs) {
      if (!e.dow || e.returns.d21 === null) continue;
      (dowBuckets[e.dow] ??= []).push(e.returns.d21 > 0);
    }
    const byDayOfWeek: Record<string, { events: number; winRate1m: number }> = {};
    for (const [d, wins] of Object.entries(dowBuckets)) {
      byDayOfWeek[d] = { events: wins.length, winRate1m: Math.round(wins.filter(Boolean).length / wins.length * 1000) / 10 };
    }

    // VIX bucket breakdown (aggregate)
    const vixGroups: Record<string, boolean[]> = { "0-15": [], "15-25": [], "25+": [] };
    for (const e of evs) {
      if (e.vixAtDate == null || e.returns.d21 === null) continue;
      const bkt = e.vixAtDate < 15 ? "0-15" : e.vixAtDate < 25 ? "15-25" : "25+";
      vixGroups[bkt].push(e.returns.d21 > 0);
    }
    const byVixBucket: Record<string, { events: number; winRate1m: number }> = {};
    for (const [bkt, wins] of Object.entries(vixGroups)) {
      if (wins.length > 0) byVixBucket[bkt] = { events: wins.length, winRate1m: Math.round(wins.filter(Boolean).length / wins.length * 1000) / 10 };
    }

    const { lower95, upper95 } = bootstrapCI(r1m.map(v => v > 0));

    bySignalCount[k] = {
      events: evs.length,
      winRate1m: wr(r1m), winRate3m: wr(r3m), winRate6m: wr(r6m), winRate1y: wr(r1y), winRate3y: wr(r3y),
      avgReturn1m: avg(r1m), avgReturn3m: avg(r3m), avgReturn6m: avg(r6m), avgReturn3y: avg(r3y),
      sampleSize3y: r3y.length,
      byDayOfWeek,
      byVixBucket,
      winRateLower95: lower95,
      winRateUpper95: upper95,
    };
  }
  return { totalEvents, bySignalCount };
}

async function runScannerBacktest(version: "v1" | "v2", type: "assets" | "stocks" | "india" | "uk" | "japan" | "hongkong" | "china" | "euronext"): Promise<ScannerBacktestResponse> {
  const cacheKey = `${version}-${type}`;
  const cached = _backtestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BACKTEST_SCANNER_TTL) return cached.data;

  const mapQ = (q: ScreenerQuote, category: string) => ({
    symbol: q.symbol,
    name: q.shortName ?? q.longName ?? q.symbol,
    category,
    flag: "",
  });

  const targets: Array<{ symbol: string; name: string; category: string; flag: string }> =
    type === "assets"
      ? TRADING_ASSETS.map(a => ({ symbol: a.symbol, name: a.name, category: a.category, flag: a.flag }))
      : type === "india"
        ? (await fetchIndianStockUniverse()).map(q => mapQ(q, "India"))
        : type === "uk"
          ? (await fetchUKStockUniverse()).map(q => mapQ(q, "UK"))
          : type === "japan"
            ? (await fetchJapanStockUniverse()).map(q => mapQ(q, "Japan"))
            : type === "hongkong"
              ? (await fetchHKStockUniverse()).map(q => mapQ(q, "Hong Kong"))
              : type === "china"
                ? (await fetchChinaStockUniverse()).map(q => mapQ(q, "China"))
                : type === "euronext"
                  ? (await fetchEuronextStockUniverse()).map(q => mapQ(q, "Euronext"))
                  : (await fetchStockUniverse()).map(q => mapQ(q, "Stocks"));

  const raw = await runWithConcurrency<typeof targets[0], BacktestAssetResult>(
    targets,
    t => backtestSymbol(t.symbol, t.name, t.category, t.flag, version),
    3  // lower concurrency — 5y candle fetches are heavy
  );

  const assets = raw.filter((r): r is BacktestAssetResult => r !== null && r.totalEvents > 0);
  assets.sort((a, b) => b.totalEvents - a.totalEvents);

  const allCandles5yAgo = new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000);
  const data: ScannerBacktestResponse = {
    version,
    type,
    fromDate: allCandles5yAgo.toISOString().slice(0, 10),
    toDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // yesterday
    assets,
    aggregate: buildAggregate(assets),
    lastUpdated: new Date().toISOString(),
  };
  _backtestCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// ── Backtest pre-warming ──────────────────────────────────────────────────────

export async function runAllBacktests(): Promise<void> {
  const combos: Array<["v1" | "v2", "assets" | "stocks"]> = [
    ["v1", "assets"],
    ["v2", "assets"],
    ["v1", "stocks"],
    ["v2", "stocks"],
  ];
  for (const [version, type] of combos) {
    try {
      console.log(`[BacktestWarm] starting ${version}-${type}`);
      await runScannerBacktest(version, type);
      console.log(`[BacktestWarm] done ${version}-${type}`);
    } catch (err) {
      console.error(`[BacktestWarm] ${version}-${type} failed:`, err);
    }
    // 5s gap between combos to ease Yahoo Finance / Finnhub rate-limit pressure
    await new Promise<void>(r => setTimeout(r, 5_000));
  }
}

// Startup warm: 2 min after boot so cache is hot shortly after every deploy.
// Leader-only — on multi-machine Fly setups followers skip this so we don't
// duplicate 5 min of Yahoo Finance scans on every redeploy.
setTimeout(() => {
  if (!isLeader()) {
    console.log("[BacktestWarm] skipping startup warm — follower");
    return;
  }
  runAllBacktests().catch(err => console.error("[BacktestWarm] startup failed:", err));
}, 2 * 60_000);

// Nightly refresh at 00:05 UTC, then every 24 h — leader-only.
(function scheduleNightlyBacktest() {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(0, 5, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(() => {
    if (isLeader()) {
      runAllBacktests().catch(err => console.error("[BacktestWarm] nightly failed:", err));
    }
    setInterval(() => {
      if (isLeader()) {
        runAllBacktests().catch(err => console.error("[BacktestWarm] nightly failed:", err));
      }
    }, 24 * 60 * 60_000);
  }, next.getTime() - now.getTime());
})();

// ── Adv Correlation — universe, computation, background pre-warm ────────────
// Fully separate from the existing /api/trading/correlation endpoint/cache
// above (TRADING_ASSETS, _correlationCache) — this feeds a new, additive
// "Adv Correlation" tab and never touches the old one.

type AdvCorrelationWindow = "1m" | "3m" | "6m" | "1y";
const ADV_CORRELATION_WINDOWS: AdvCorrelationWindow[] = ["1m", "3m", "6m", "1y"];
const ADV_CORRELATION_WINDOW_DAYS: Record<AdvCorrelationWindow, number> = {
  "1m": 30, "3m": 90, "6m": 182, "1y": 365,
};
const ADV_CORRELATION_TTL = 4 * 60 * 60 * 1000; // 4h

interface AdvCorrelationData {
  symbols: CorrelationAsset[];
  matrix: number[][];
  window: AdvCorrelationWindow;
  cacheWarm: boolean;
  staleSymbols: string[];
  lastUpdated: string;
}

const _advCorrelationCacheByWindow = new Map<AdvCorrelationWindow, { data: AdvCorrelationData; ts: number }>();

// Per-symbol last-known-good daily close series, carried forward across warm
// cycles when a fetch fails — a transient Yahoo blip degrades to "one symbol
// slightly stale" instead of silently zeroing that symbol's correlations.
const _advCloseSeriesCache = new Map<string, Map<string, number>>();

const _advRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

async function fetchClosesWithRetry(symbol: string, range: string): Promise<Map<string, number> | null> {
  let delay = 1_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candles = (await yahooProvider.fetchHistoryCandles(symbol, "1d", range)) as OHLCV[];
    if (candles.length > 0) {
      const byDate = new Map<string, number>();
      for (const c of candles) {
        if (c.time && c.close) {
          byDate.set(new Date(c.time * 1000).toISOString().slice(0, 10), c.close);
        }
      }
      return byDate;
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
  return null; // exhausted retries — caller decides whether to carry forward
}

function pearson(mapI: Map<string, number>, mapJ: Map<string, number>): number {
  const dates = [...mapI.keys()].filter(d => mapJ.has(d)).sort();
  if (dates.length < 5) return 0;
  const xs = dates.map(d => mapI.get(d)!);
  const ys = dates.map(d => mapJ.get(d)!);
  const k = dates.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / k;
  const meanY = ys.reduce((a, b) => a + b, 0) / k;
  let num = 0, denX = 0, denY = 0;
  for (let t = 0; t < k; t++) {
    const dx = xs[t] - meanX;
    const dy = ys[t] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  const r = denom > 0 ? Math.max(-1, Math.min(1, num / denom)) : 0;
  return Math.round(r * 100) / 100;
}

// ── Weekly market-cap-ranked "Stocks" slice ──────────────────────────────────
// Market-cap rank within an already-curated pool shifts slowly — recomputing
// it every 4h alongside the matrix itself would be wasted Yahoo load. Runs on
// its own weekly cadence; the 4h matrix warm always reads whatever is cached.

let _correlationStockSelection: { data: CorrelationAsset[]; ts: number } | null = null;
const ADV_STOCK_SELECTION_REDIS_KEY = "correlation:advanced:stock-selection";

async function refreshCorrelationStockSelection(): Promise<void> {
  console.log("[AdvCorrelation] refreshing stock selection...");
  const picked: CorrelationAsset[] = [];
  for (const pool of CORRELATION_STOCK_POOLS) {
    try {
      const quotes = await fetchYahooQuoteSummaryBatch(pool.symbols);
      const ranked = [...quotes.entries()]
        .filter(([, q]) => typeof q.marketCap === "number" && (q.marketCap as number) > 0)
        .sort((a, b) => (b[1].marketCap ?? 0) - (a[1].marketCap ?? 0))
        .slice(0, pool.topN);
      for (const [symbol, q] of ranked) {
        picked.push({
          symbol,
          name: q.longName ?? q.shortName ?? symbol,
          category: "Stocks",
          flag: pool.flag,
        });
      }
      console.log(`[AdvCorrelation] ${pool.region}: selected ${ranked.length}/${pool.topN}`);
    } catch (err) {
      console.error(`[AdvCorrelation] stock selection failed for ${pool.region}:`, err);
    }
  }
  if (picked.length === 0) {
    console.warn("[AdvCorrelation] stock selection produced 0 symbols — keeping previous selection");
    return;
  }
  _correlationStockSelection = { data: picked, ts: Date.now() };
  if (_advRedis) {
    try {
      await _advRedis.set(ADV_STOCK_SELECTION_REDIS_KEY, picked, { ex: 10 * 24 * 60 * 60 });
    } catch (err) {
      console.warn("[AdvCorrelation] failed to persist stock selection to Redis:", err);
    }
  }
}

async function hydrateCorrelationStockSelectionFromRedis(): Promise<void> {
  if (!_advRedis || _correlationStockSelection) return;
  try {
    const cached = await _advRedis.get<CorrelationAsset[]>(ADV_STOCK_SELECTION_REDIS_KEY);
    if (cached && cached.length > 0) {
      _correlationStockSelection = { data: cached, ts: Date.now() };
      console.log(`[AdvCorrelation] hydrated stock selection from Redis (${cached.length} symbols)`);
    }
  } catch (err) {
    console.warn("[AdvCorrelation] failed to hydrate stock selection from Redis:", err);
  }
}

function currentCorrelationUniverse(): CorrelationAsset[] {
  return [...CORRELATION_FIXED_ASSETS, ...(_correlationStockSelection?.data ?? [])];
}

// ── Base matrix compute ──────────────────────────────────────────────────────
// Fetches each symbol's 1y daily closes ONCE per warm cycle; all 4 windows are
// then derived from that same in-memory series (pure CPU, no extra network).

async function fetchAllCloseSeries(universe: CorrelationAsset[]): Promise<string[]> {
  const staleSymbols: string[] = [];
  await runWithConcurrency(universe, async (asset) => {
    const series = await fetchClosesWithRetry(asset.symbol, "1y");
    if (series) {
      _advCloseSeriesCache.set(asset.symbol, series);
    } else if (_advCloseSeriesCache.has(asset.symbol)) {
      staleSymbols.push(asset.symbol);
    } else {
      _advCloseSeriesCache.set(asset.symbol, new Map());
    }
    return null;
  }, 10);
  return staleSymbols;
}

function buildAdvMatrixForWindow(
  universe: CorrelationAsset[],
  window: AdvCorrelationWindow,
  staleSymbols: string[],
): AdvCorrelationData {
  const cutoff = window === "1y" ? null : Date.now() - ADV_CORRELATION_WINDOW_DAYS[window] * 24 * 60 * 60 * 1000;
  const n = universe.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const windowedSeries = universe.map(asset => {
    const full = _advCloseSeriesCache.get(asset.symbol) ?? new Map<string, number>();
    if (!cutoff) return full;
    const filtered = new Map<string, number>();
    for (const [date, close] of full) {
      if (new Date(date).getTime() >= cutoff) filtered.set(date, close);
    }
    return filtered;
  });

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearson(windowedSeries[i], windowedSeries[j]);
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }

  return {
    symbols: universe,
    matrix,
    window,
    cacheWarm: true,
    staleSymbols,
    lastUpdated: new Date().toISOString(),
  };
}

async function runAdvCorrelationWarm(): Promise<void> {
  const universe = currentCorrelationUniverse();
  console.log(`[AdvCorrelationWarm] fetching ${universe.length} symbols...`);
  const staleSymbols = await fetchAllCloseSeries(universe);
  for (const window of ADV_CORRELATION_WINDOWS) {
    try {
      const data = buildAdvMatrixForWindow(universe, window, staleSymbols);
      _advCorrelationCacheByWindow.set(window, { data, ts: Date.now() });
      if (_advRedis) {
        try {
          await _advRedis.set(`correlation:advanced:${window}`, data, { ex: 26 * 60 * 60 });
        } catch (err) {
          console.warn(`[AdvCorrelationWarm] Redis snapshot write failed for ${window}:`, err);
        }
      }
      console.log(`[AdvCorrelationWarm] done window=${window} (${staleSymbols.length} stale)`);
    } catch (err) {
      console.error(`[AdvCorrelationWarm] window=${window} failed:`, err);
    }
  }
}

// Startup: 2.5 min after boot (offset from BacktestWarm's 2-min slot so the two
// don't collide on deploy), leader-only.
setTimeout(() => {
  if (!isLeader()) {
    console.log("[AdvCorrelationWarm] skipping startup warm — follower");
    return;
  }
  (async () => {
    await hydrateCorrelationStockSelectionFromRedis();
    if (!_correlationStockSelection) await refreshCorrelationStockSelection();
    await runAdvCorrelationWarm();
  })().catch(err => console.error("[AdvCorrelationWarm] startup failed:", err));
}, 2.5 * 60_000);

// Refresh every 4h — a fixed interval, not market-close-timed. Daily-close
// data only changes once per exchange per trading day, but this 180-symbol
// universe spans exchanges closing at very different UTC times across DST
// changes; a flat 4h loop caps staleness uniformly without calendar logic.
setInterval(() => {
  if (isLeader()) {
    runAdvCorrelationWarm().catch(err => console.error("[AdvCorrelationWarm] periodic failed:", err));
  }
}, 4 * 60 * 60_000);

// Weekly stock-selection re-rank — independent, much slower cadence than the
// 4h matrix warm above.
setInterval(() => {
  if (isLeader()) {
    refreshCorrelationStockSelection().catch(err => console.error("[AdvCorrelation] weekly stock selection failed:", err));
  }
}, 7 * 24 * 60 * 60_000);

export function createTradingRouter(): Router {
  const router = Router();

  // GET /api/trading/strategies — effectively static; refreshes on deploy
  router.get("/strategies", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=172800"); // 24h / 48h SWR
    res.json({ strategies: STRATEGY_DEFS, timestamp: new Date().toISOString() });
  });

  // GET /api/trading/quotes — data refreshes via 20s background poll into latestPrices
  router.get("/quotes", (_req: Request, res: Response) => {
    // 15s edge cache absorbs concurrent device polls (Trading Dashboard auto-refreshes every 30s).
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    const quotes = TRADING_ASSETS.map(asset => {
      const p = latestPrices.get(asset.symbol);
      return {
        symbol: asset.symbol,
        name: asset.name,
        category: asset.category,
        flag: asset.flag,
        currency: asset.currency,
        price: p?.price ?? null,
        change: p?.change ?? null,
        changePercent: p?.changePercent ?? null,
        updatedAt: p ? new Date(p.updatedAt).toISOString() : null,
        preMarketPrice: p?.preMarketPrice ?? null,
        preMarketChangePercent: p?.preMarketChangePercent ?? null,
      };
    });
    res.json({ quotes, timestamp: new Date().toISOString() });
  });

  const VALID_TF: Timeframe[] = ["1m", "5m", "1h", "4h", "1d", "1w"];
  const VALID_STRAT: StrategyId[] = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18"];

  /** Resolve timeframe from `interval` (spec) or `timeframe` (alias), defaulting to "1d". */
  function resolveTimeframe(query: Request["query"]): Timeframe | null {
    const raw = (query.interval ?? query.timeframe) as string | undefined;
    if (!raw) return "1d";
    return VALID_TF.includes(raw as Timeframe) ? (raw as Timeframe) : null;
  }

  /** Safely coerce Express route param to string (handles string | string[] edge case). */
  function paramStr(raw: string | string[] | undefined): string {
    return decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
  }

  // GET /api/trading/signals/:symbol
  router.get("/signals/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const tf = resolveTimeframe(req.query);
    const strategy = (req.query.strategy as StrategyId) ?? "1";

    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }
    if (!VALID_STRAT.includes(strategy)) {
      return res.status(400).json({ error: "Invalid strategy. Use: 1, 2, 3, 4, 5, 6, 7, 8" });
    }

    // Strategies 4–9 and all enhanced (10–18) require Pro plan
    const advancedStrategies = new Set(["4","5","6","7","8","9","10","11","12","13","14","15","16","17","18"]);
    if (advancedStrategies.has(strategy) && !isPro(getDevicePlan(req))) {
      return res.status(403).json({ error: "Strategy requires Pro plan.", code: "PLAN_REQUIRED" });
    }

    // Determine data requirements per strategy
    const needsNews    = ["3","6","12","15"].includes(strategy);
    const needsApexData = ["7","8","16","17"].includes(strategy);

    let newsSentiment = 0;
    let newsArticles: NewsArticle[] = [];
    if (needsNews) {
      const news = await fetchNewsForSymbol(symbol);
      newsSentiment = news.aggregateSentiment;
      newsArticles = news.articles;
    }

    const HTF_MAP: Record<Timeframe, Timeframe | null> = {
      "1m": "1h", "5m": "1h", "1h": "4h", "4h": "1d", "1d": null, "1w": null,
    };
    let htfCandles: OHLCV[] = [];
    let crossAssetCandles: OHLCV[] | null = null;
    let crossAssetInverse = false;
    if (needsApexData) {
      const htfTf = HTF_MAP[tf!];
      if (htfTf) htfCandles = await fetchHistory(symbol, htfTf);
      const crossPair = CROSS_ASSET_PAIRS_PLUS[symbol] ?? CROSS_ASSET_PAIRS[symbol];
      if (crossPair) {
        crossAssetCandles = await fetchHistory(crossPair.symbol, tf!);
        crossAssetInverse = crossPair.inverse;
      }
    }

    const bypassCache = !!req.query.fresh;
    const signal = await generateSignal(symbol, tf, strategy, newsSentiment, bypassCache, newsArticles, htfCandles, crossAssetCandles, crossAssetInverse);
    if (!signal) {
      return res.status(503).json({ error: "Insufficient historical data to generate signal" });
    }

    // VWAP enrichment — intraday 5m bars for the current session. Non-critical;
    // null when market is closed or Yahoo returns insufficient bars.
    let vwap: number | null = null;
    let vwapDeviation: number | null = null;
    try {
      const intraday = (await yahooProvider.fetchHistoryCandles(symbol, "5m", "1d") as OHLCV[])
        .filter(c => (c.volume ?? 0) > 0);
      if (intraday.length >= 5) {
        vwap = calcVwapIntraday(intraday);
        if (vwap && signal.entry) {
          vwapDeviation = Math.round(((signal.entry - vwap) / vwap) * 10000) / 100;
        }
      }
    } catch { /* non-critical */ }

    // private — strategies 4–9 are plan-gated and the response is per-device-plan
    res.setHeader("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    return res.json({ ...signal, vwap, vwapDeviation });
  });

  // GET /api/trading/signals-compare/:symbol
  // Returns all 9 base + 9 enhanced strategy signals in parallel pairs for comparison.
  // Plan-gated: Pro+ (signals_advanced). Intentionally un-cached — always fresh.
  router.get("/signals-compare/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    if (!isPro(getDevicePlan(req))) {
      return res.status(403).json({ error: "Strategy comparison requires Pro plan.", code: "PLAN_REQUIRED" });
    }

    const tf = resolveTimeframe(req.query) ?? "1d";
    const HTF_MAP: Record<Timeframe, Timeframe | null> = {
      "1m": "1h", "5m": "1h", "1h": "4h", "4h": "1d", "1d": null, "1w": null,
    };
    const htfTf = HTF_MAP[tf];
    const [newsData, htfCandles] = await Promise.all([
      fetchNewsForSymbol(symbol),
      htfTf ? fetchHistory(symbol, htfTf) : Promise.resolve([] as OHLCV[]),
    ]);
    const { aggregateSentiment: newsSentiment, articles: newsArticles } = newsData;
    const crossPair = CROSS_ASSET_PAIRS_PLUS[symbol];
    const crossAssetCandles = crossPair ? await fetchHistory(crossPair.symbol, tf) : null;
    const crossAssetInverse = crossPair?.inverse ?? false;

    const BASE_STRATS: BaseStrategyId[] = ["1","2","3","4","5","6","7","8","9"];
    const PLUS_STRATS: EnhancedStrategyId[] = ["10","11","12","13","14","15","16","17","18"];

    const [baseSettled, plusSettled] = await Promise.all([
      Promise.allSettled(BASE_STRATS.map(s =>
        generateSignal(symbol, tf, s, newsSentiment, false, newsArticles, htfCandles, crossAssetCandles, crossAssetInverse)
      )),
      Promise.allSettled(PLUS_STRATS.map(s =>
        generateSignal(symbol, tf, s, newsSentiment, false, newsArticles, htfCandles, crossAssetCandles, crossAssetInverse)
      )),
    ]);
    const baseResults = baseSettled.map(r => r.status === 'fulfilled' ? r.value : null);
    const plusResults = plusSettled.map(r => r.status === 'fulfilled' ? r.value : null);

    const pairs = BASE_STRATS.map((baseId, i) => ({
      baseId,
      enhancedId: PLUS_STRATS[i],
      base: baseResults[i],
      enhanced: plusResults[i],
    }));

    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res.json({ symbol, timeframe: tf, pairs, timestamp: new Date().toISOString() });
  });

  // GET /api/trading/analyst-note/:symbol
  router.get("/analyst-note/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }

    if (!isPro(getDevicePlan(req))) {
      return res.status(403).json({
        error: "Analyst notes require Pro plan.",
        code: "PLAN_REQUIRED",
      });
    }

    const strategy = (req.query.strategy as string) ?? "1";
    const direction = (req.query.direction as string) ?? "HOLD";
    const confidence = parseFloat(req.query.confidence as string) || 50;
    const key = `${symbol}_${strategy}_${direction}`;

    // Track the button tap regardless of cache hit/miss
    const _db = adminFirestore();
    const _deviceId = req.headers["x-device-id"] as string | undefined;
    if (_db && _deviceId) {
      _db.doc(`ai_usage/${_deviceId}`).set({
        anthropicCalls: FieldValue.increment(1),
        lastSeen: new Date().toISOString(),
        routes: { "/api/trading/analyst-note/:symbol": FieldValue.increment(1) },
      }, { merge: true }).catch(() => {});
    }

    res.setHeader("Cache-Control", "private, max-age=900"); // 15m — Pro+ gated
    const cached = _noteCache.get(key);
    if (cached && Date.now() - cached.ts < NOTE_TTL) {
      return res.json({ note: cached.note });
    }

    if (!_anthropic) return res.json({ note: null });

    if (!_notePending.has(key)) {
      const promise = _callClaude(symbol, strategy, direction, confidence)
        .then(note => {
          _noteCache.set(key, { note, ts: Date.now() });
          _notePending.delete(key);
          return note;
        })
        .catch(err => {
          _notePending.delete(key);
          throw err;
        });
      _notePending.set(key, promise);
    }

    try {
      const note = await _notePending.get(key)!;
      return res.json({ note });
    } catch {
      return res.status(503).json({ error: "Failed to generate analyst note" });
    }
  });

  // GET /api/trading/history/:symbol
  // Supports ?interval=1d (spec) or ?timeframe=1d (alias)
  router.get("/history/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const tf = resolveTimeframe(req.query);

    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }

    const candles = await fetchHistory(symbol, tf);
    if (candles.length === 0) {
      return res.status(503).json({ error: "Failed to fetch history" });
    }
    res.setHeader("Cache-Control", "public, max-age=150, stale-while-revalidate=300"); // 2.5m / 5m SWR
    return res.json({ symbol, timeframe: tf, interval: tf, candles, count: candles.length });
  });

  // GET /api/trading/backtest/:symbol
  router.get("/backtest/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const tf = resolveTimeframe(req.query);

    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }

    const result = await runBacktest(symbol, tf);
    if (!result) {
      return res.status(503).json({ error: "Insufficient data for backtest (need 60+ candles)" });
    }
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600"); // 5m / 10m SWR
    return res.json(result);
  });

  // GET /api/trading/news/:symbol
  router.get("/news/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    const result = await fetchNewsForSymbol(symbol);
    res.setHeader("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
    return res.json(result);
  });

  // GET /api/trading/scanner/10x/single?symbol=AAPL&name=Apple+Inc. — v1+v2 on-demand scan
  router.get("/scanner/10x/single", async (req: Request, res: Response) => {
    const raw = ((req.query.symbol as string) ?? "").trim();
    if (!raw) return res.status(400).json({ error: "symbol is required." });
    const validation = symbolSchema.safeParse(raw);
    if (!validation.success) return res.status(400).json({ error: "Invalid symbol format." });
    const displayName = ((req.query.name as string) ?? "").trim();
    try {
      const result = await scanSingleSymbol(raw, displayName || undefined);
      if (!result) return res.status(404).json({ error: "Could not fetch price data for symbol." });
      return res.json(result);
    } catch (err) {
      console.error("[10X Single Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable." });
    }
  });

  // GET /api/trading/scanner/10x/assets  — 49 base assets (Commodities/Indices/Crypto/Forex)
  router.get("/scanner/10x/assets", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X Asset Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/stocks  — auto-discovered equities via Yahoo screener
  router.get("/scanner/10x/stocks", async (_req: Request, res: Response) => {
    try {
      const result = await runStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X Stock Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/india  — Indian equities via Yahoo Finance IN screener
  router.get("/scanner/10x/india", async (_req: Request, res: Response) => {
    try {
      const result = await runIndianStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X India Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/assets  — v2: Pine Script aligned (35% range, 200-bar, trend)
  router.get("/scanner/10x-v2/assets", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 Asset Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v3/assets  — v3 "Super Pine" (Indices only): index regime breakout
  router.get("/scanner/10x-v3/assets", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScannerV3();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v3 Asset Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v3/commodities  — v3 Pine Commodities: heartbeat + catalyst
  router.get("/scanner/10x-v3/commodities", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScannerV3Commodities();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v3 Commodities Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v3/forex  — v3 Pine Forex: range consolidation + long breakout
  router.get("/scanner/10x-v3/forex", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScannerV3Forex();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v3 Forex Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v3/crypto  — v3 Pine Crypto: base + breakout on volume
  router.get("/scanner/10x-v3/crypto", async (_req: Request, res: Response) => {
    try {
      const result = await runAssetScannerV3Crypto();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v3 Crypto Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/stocks  — v2: Pine Script aligned stocks
  router.get("/scanner/10x-v2/stocks", async (_req: Request, res: Response) => {
    try {
      const result = await runStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 Stock Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/india  — v2 Pine Script aligned Indian equities
  router.get("/scanner/10x-v2/india", async (_req: Request, res: Response) => {
    try {
      const result = await runIndianStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 India Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/uk  — UK equities via Yahoo Finance GB screener
  router.get("/scanner/10x/uk", async (_req: Request, res: Response) => {
    try {
      const result = await runUKStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X UK Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/uk  — v2 Pine Script aligned UK equities
  router.get("/scanner/10x-v2/uk", async (_req: Request, res: Response) => {
    try {
      const result = await runUKStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 UK Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/japan
  router.get("/scanner/10x/japan", async (_req: Request, res: Response) => {
    try {
      const result = await runJapanStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X Japan Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/japan
  router.get("/scanner/10x-v2/japan", async (_req: Request, res: Response) => {
    try {
      const result = await runJapanStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 Japan Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/hongkong
  router.get("/scanner/10x/hongkong", async (_req: Request, res: Response) => {
    try {
      const result = await runHKStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X HK Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/hongkong
  router.get("/scanner/10x-v2/hongkong", async (_req: Request, res: Response) => {
    try {
      const result = await runHKStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 HK Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/china
  router.get("/scanner/10x/china", async (_req: Request, res: Response) => {
    try {
      const result = await runChinaStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X China Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/china
  router.get("/scanner/10x-v2/china", async (_req: Request, res: Response) => {
    try {
      const result = await runChinaStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 China Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x/euronext  — Euronext equities (FR+NL+DE+IT+NO)
  router.get("/scanner/10x/euronext", async (_req: Request, res: Response) => {
    try {
      const result = await runEuronextStockScanner();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X Euronext Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/10x-v2/euronext
  router.get("/scanner/10x-v2/euronext", async (_req: Request, res: Response) => {
    try {
      const result = await runEuronextStockScannerV2();
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.json(result);
    } catch (err) {
      console.error("[10X v2 Euronext Scanner]", err);
      return res.status(503).json({ error: "Scanner temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/backtest/:type?version=v1|v2  — historical signal backtest (24h cache)
  router.get("/scanner/backtest/:type", async (req: Request, res: Response) => {
    const type = req.params.type as string;
    if (
      type !== "assets" && type !== "stocks" && type !== "india" && type !== "uk" &&
      type !== "japan" && type !== "hongkong" && type !== "china" && type !== "euronext"
    ) {
      return res.status(400).json({ error: "type must be 'assets', 'stocks', 'india', 'uk', 'japan', 'hongkong', 'china', or 'euronext'" });
    }
    const version = (req.query.version === "v2" ? "v2" : "v1") as "v1" | "v2";
    try {
      const result = await runScannerBacktest(version, type as "assets" | "stocks" | "india" | "uk" | "japan" | "hongkong" | "china" | "euronext");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.json(result);
    } catch (err) {
      console.error("[10X Backtest]", err);
      return res.status(503).json({ error: "Backtest temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/best-setups?version=v1&type=assets&minWinRate=0.65
  router.get("/scanner/best-setups", async (req: Request, res: Response) => {
    const version = (req.query.version === "v2" ? "v2" : "v1") as "v1" | "v2";
    const type = (req.query.type === "stocks" ? "stocks" : "assets") as "assets" | "stocks";
    const minWinRate = parseFloat((req.query.minWinRate as string) || "0.65");

    const cacheKey = `${version}-${type}`;
    const cached = _backtestCache.get(cacheKey);
    if (!cached) {
      return res.json({ setups: [], cacheWarm: false, lastUpdated: null });
    }
    const btData = cached.data;

    try {
      const scanData =
        version === "v2"
          ? type === "stocks"
            ? await runStockScannerV2()
            : await runAssetScannerV2()
          : type === "stocks"
            ? await runStockScanner()
            : await runAssetScanner();

      const btBySymbol = new Map(btData.assets.map((a) => [a.symbol, a]));

      const setups: Array<{
        symbol: string; name: string; flag: string; category: string;
        signalsActive: number; price: number; changePercent: number;
        volumeRatio: number;
        winRate1m: number; winRate3m: number; winRate6m: number;
        winRate1y: number; winRate3y: number; sampleSize3y: number;
        avgReturn3m: number;
      }> = [];

      for (const entry of scanData.assets) {
        if (entry.signalsActive < 1) continue;
        const bt = btBySymbol.get(entry.symbol);
        if (!bt) continue;
        const stats = bt.bySignalCount[String(entry.signalsActive)];
        if (!stats || stats.winRate1m < minWinRate * 100) continue;
        setups.push({
          symbol: entry.symbol, name: entry.name, flag: entry.flag,
          category: entry.category, signalsActive: entry.signalsActive,
          price: entry.price, changePercent: entry.changePercent,
          volumeRatio: entry.volumeRatio,
          winRate1m: stats.winRate1m, winRate3m: stats.winRate3m,
          winRate6m: stats.winRate6m, winRate1y: stats.winRate1y,
          winRate3y: stats.winRate3y, sampleSize3y: stats.sampleSize3y,
          avgReturn3m: stats.avgReturn3m,
        });
      }

      setups.sort((a, b) => b.winRate1m - a.winRate1m);
      return res
        .setHeader("Cache-Control", "public, max-age=1800")
        .json({ setups: setups.slice(0, 5), cacheWarm: true, lastUpdated: scanData.lastUpdated });
    } catch (err) {
      console.error("[Best Setups]", err);
      return res.status(503).json({ error: "Best setups temporarily unavailable" });
    }
  });

  // GET /api/trading/best-setups-sector?version=v1|v2
  // Groups stock-scanner output by RRG sector quadrant + GICS sector, returning
  // the top 7 stocks per sector inside the Leading and Improving quadrants.
  // Reuses the existing _stockScanCache (dynamic Yahoo most-actives universe)
  // and joins against the S&P 500 sector CSV plus a small NDX-only override map.
  const _bestSetupsSectorCache = new Map<string, { data: unknown; ts: number }>();
  // Tracks in-flight computations per version so concurrent client requests
  // don't each kick off a duplicate (and so we can return cacheWarm:false
  // immediately while one is already running).
  const _bestSetupsSectorInFlight = new Map<string, Promise<void>>();
  const BEST_SETUPS_SECTOR_TTL = 30 * 60_000;

  const _cacheWarmingResponse = (version: "v1" | "v2") => ({
    leading: [],
    improving: [],
    cacheWarm: false,
    version,
    lastUpdated: new Date().toISOString(),
  });

  let _symbolSectorCache: { map: Map<string, string>; ts: number } | null = null;
  const SYMBOL_SECTOR_TTL = 7 * 24 * 60 * 60_000;

  // NDX 100 names not reliably in S&P 500 (foreign listings, recent IPOs).
  // GICS strings here are passed through GICS_TO_ETF_SECTOR for the join.
  const NDX_ONLY_SECTORS: Record<string, string> = {
    "ASML":   "Information Technology",
    "ARM":    "Information Technology",
    "AZN":    "Health Care",
    "CCEP":   "Consumer Staples",
    "DASH":   "Consumer Discretionary",
    "DDOG":   "Information Technology",
    "GFS":    "Information Technology",
    "MELI":   "Consumer Discretionary",
    "MSTR":   "Information Technology",
    "PDD":    "Consumer Discretionary",
    "TEAM":   "Information Technology",
    "BIIB":   "Health Care",
  };

  async function getStockToSectorMap(): Promise<Map<string, string>> {
    if (_symbolSectorCache && Date.now() - _symbolSectorCache.ts < SYMBOL_SECTOR_TTL) {
      return _symbolSectorCache.map;
    }
    const map = new Map<string, string>();
    try {
      const sp = await fetchSp500Constituents();
      for (const c of sp) {
        if (c.symbol && c.sector) map.set(c.symbol, c.sector);
      }
    } catch (e) {
      console.error("[Sector Map] S&P 500 fetch failed:", e);
    }
    for (const [sym, sector] of Object.entries(NDX_ONLY_SECTORS)) {
      if (!map.has(sym)) map.set(sym, sector);
    }
    _symbolSectorCache = { map, ts: Date.now() };
    return map;
  }

  // Extracted so it can be kicked off from the handler (background) AND from
  // the startup pre-warm — both share the same in-flight map.
  function ensureBestSetupsSectorFresh(version: "v1" | "v2"): Promise<void> {
    const existing = _bestSetupsSectorInFlight.get(version);
    if (existing) return existing;

    const job = (async () => {
      const [scanData, sectorQuadrants, stockToSector] = await Promise.all([
        version === "v2" ? runStockScannerV2() : runStockScanner(),
        getSectorQuadrants(),
        getStockToSectorMap(),
      ]);

      const btCached = _backtestCache.get(`${version}-stocks`);
      const btBySymbol = new Map(
        (btCached?.data.assets ?? []).map((a) => [a.symbol, a]),
      );

      type Row = {
        symbol: string; name: string; price: number; changePercent: number;
        volumeRatio: number; signalsActive: number;
        winRate1m: number | null;
      };
      const groups = new Map<string, { sector: string; emoji: string; quadrant: RrgQuadrant; rows: Row[] }>();

      for (const entry of scanData.assets) {
        if (entry.signalsActive < 1) continue;
        const gics = stockToSector.get(entry.symbol);
        if (!gics) continue;
        const etfSectorName = GICS_TO_ETF_SECTOR[gics];
        if (!etfSectorName) continue;
        const sectorRrg = sectorQuadrants.get(etfSectorName);
        if (!sectorRrg || (sectorRrg.quadrant !== "Leading" && sectorRrg.quadrant !== "Improving")) continue;

        const bt = btBySymbol.get(entry.symbol);
        const stats = bt?.bySignalCount[String(entry.signalsActive)];
        const row: Row = {
          symbol: entry.symbol,
          name: entry.name,
          price: entry.price,
          changePercent: entry.changePercent,
          volumeRatio: entry.volumeRatio,
          signalsActive: entry.signalsActive,
          winRate1m: stats?.winRate1m ?? null,
        };

        const key = `${sectorRrg.quadrant}::${etfSectorName}`;
        let g = groups.get(key);
        if (!g) {
          g = { sector: etfSectorName, emoji: sectorRrg.emoji, quadrant: sectorRrg.quadrant, rows: [] };
          groups.set(key, g);
        }
        g.rows.push(row);
      }

      const sortRows = (rows: Row[]) =>
        rows.sort((a, b) => {
          if (b.signalsActive !== a.signalsActive) return b.signalsActive - a.signalsActive;
          const aw = a.winRate1m ?? -1;
          const bw = b.winRate1m ?? -1;
          if (bw !== aw) return bw - aw;
          return b.changePercent - a.changePercent;
        });

      // Preserve SECTOR_ETFS declaration order so sectors render predictably.
      const sectorOrder = SECTOR_ETFS.map((e) => e.name);
      const buildList = (quadrant: RrgQuadrant) =>
        sectorOrder
          .map((name) => groups.get(`${quadrant}::${name}`))
          .filter((g): g is { sector: string; emoji: string; quadrant: RrgQuadrant; rows: Row[] } => !!g && g.rows.length > 0)
          .map((g) => ({
            sector: g.sector,
            emoji: g.emoji,
            stocks: sortRows(g.rows).slice(0, 7),
          }));

      const payload = {
        leading: buildList("Leading"),
        improving: buildList("Improving"),
        cacheWarm: true,
        version,
        lastUpdated: scanData.lastUpdated,
      };
      _bestSetupsSectorCache.set(version, { data: payload, ts: Date.now() });
    })()
      .catch((err) => {
        console.error("[Best Setups Sector] compute failed:", err);
      })
      .finally(() => {
        _bestSetupsSectorInFlight.delete(version);
      });

    _bestSetupsSectorInFlight.set(version, job);
    return job;
  }

  // Pre-warm both versions ~10s after backtest warm starts (which is 2 min
  // after boot). The scanner + sectors caches are typically populated by
  // then, so this is a cheap join + post-process; total < 10s.
  setTimeout(() => {
    if (!isLeader()) return;
    void ensureBestSetupsSectorFresh("v1");
    void ensureBestSetupsSectorFresh("v2");
  }, 3 * 60_000);

  router.get("/best-setups-sector", async (req: Request, res: Response) => {
    const version = (req.query.version === "v2" ? "v2" : "v1") as "v1" | "v2";

    const cached = _bestSetupsSectorCache.get(version);
    if (cached && Date.now() - cached.ts < BEST_SETUPS_SECTOR_TTL) {
      return res.setHeader("Cache-Control", "public, max-age=1800").json(cached.data);
    }

    // No fresh cache. Kick off (or join) the background compute and return a
    // cacheWarm:false skeleton immediately so the client renders its "warming
    // up — check back in ~2 min" message instead of blocking the UI for 30-50s.
    // Concurrent client requests all share the single in-flight Promise via
    // _bestSetupsSectorInFlight, so we never duplicate the work.
    void ensureBestSetupsSectorFresh(version);
    return res
      .setHeader("Cache-Control", "no-store")
      .json(_cacheWarmingResponse(version));
  });

  // GET /api/trading/fundamentals/:symbol
  router.get("/fundamentals/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    if (!symbolSchema.safeParse(symbol).success) {
      return res.status(400).json({ error: "Invalid symbol format." });
    }
    const cached = _fundCache.get(symbol);
    if (cached && Date.now() - cached.ts < FUND_TTL) return res.json(cached.data);

    try {
      // Fetch chart meta (52W range, currency) and search result (sector, industry) in parallel
      const [chartData, searchData] = await Promise.allSettled([
        yfFetch<YFChartResponse>(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
        ),
        yfFetch<any>(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=0`
        ),
      ]);

      const meta = (chartData.status === "fulfilled"
        ? (chartData.value?.chart?.result?.[0]?.meta ?? {})
        : {}) as Record<string, any>;

      const searchQuote = (searchData.status === "fulfilled"
        ? (searchData.value?.quotes?.[0] ?? null)
        : null) as Record<string, any> | null;

      const quoteType: string | null = searchQuote?.quoteType ?? null;
      const epsApplicable = quoteType === "EQUITY";

      let epsHistory: number[] = [];
      if (epsApplicable) {
        epsHistory = await fetchYFEarningsHistory(symbol);
        if (epsHistory.length === 0) {
          epsHistory = await fetchTwelveDataEarnings(symbol);
        }
      }

      const result: FundamentalsResult = {
        symbol,
        sector: searchQuote?.sector ?? null,
        industry: searchQuote?.industry ?? null,
        quoteType,
        currency: meta.currency ?? null,
        week52High: meta.fiftyTwoWeekHigh ?? null,
        week52Low: meta.fiftyTwoWeekLow ?? null,
        epsHistory,
        epsApplicable,
      };
      _fundCache.set(symbol, { data: result, ts: Date.now() });
      return res.json(result);
    } catch {
      return res.status(503).json({ error: "Failed to fetch fundamentals" });
    }
  });

  // GET /api/trading/earnings-calendar?days=15
  const EARNINGS_SYMBOLS = [
    { symbol: "AAPL", name: "Apple", sector: "Technology" },
    { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
    { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
    { symbol: "GOOGL", name: "Alphabet", sector: "Technology" },
    { symbol: "AMZN", name: "Amazon", sector: "Consumer Disc." },
    { symbol: "META", name: "Meta", sector: "Technology" },
    { symbol: "TSLA", name: "Tesla", sector: "Consumer Disc." },
    { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials" },
    { symbol: "V", name: "Visa", sector: "Financials" },
    { symbol: "XOM", name: "ExxonMobil", sector: "Energy" },
    { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
    { symbol: "WMT", name: "Walmart", sector: "Consumer Staples" },
    { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Staples" },
    { symbol: "MA", name: "Mastercard", sector: "Financials" },
    { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare" },
    { symbol: "HD", name: "Home Depot", sector: "Consumer Disc." },
    { symbol: "CVX", name: "Chevron", sector: "Energy" },
    { symbol: "LLY", name: "Eli Lilly", sector: "Healthcare" },
    { symbol: "ABBV", name: "AbbVie", sector: "Healthcare" },
    { symbol: "MRK", name: "Merck", sector: "Healthcare" },
    { symbol: "BAC", name: "Bank of America", sector: "Financials" },
    { symbol: "PFE", name: "Pfizer", sector: "Healthcare" },
    { symbol: "KO", name: "Coca-Cola", sector: "Consumer Staples" },
    { symbol: "AVGO", name: "Broadcom", sector: "Technology" },
    { symbol: "COST", name: "Costco", sector: "Consumer Staples" },
    { symbol: "DIS", name: "Disney", sector: "Comm. Services" },
    { symbol: "NFLX", name: "Netflix", sector: "Comm. Services" },
    { symbol: "AMD", name: "AMD", sector: "Technology" },
    { symbol: "INTC", name: "Intel", sector: "Technology" },
    { symbol: "CSCO", name: "Cisco", sector: "Technology" },
    { symbol: "ORCL", name: "Oracle", sector: "Technology" },
    { symbol: "IBM", name: "IBM", sector: "Technology" },
    { symbol: "CRM", name: "Salesforce", sector: "Technology" },
    { symbol: "ADBE", name: "Adobe", sector: "Technology" },
    { symbol: "PYPL", name: "PayPal", sector: "Financials" },
    { symbol: "UBER", name: "Uber", sector: "Technology" },
    { symbol: "ABNB", name: "Airbnb", sector: "Consumer Disc." },
    { symbol: "SPOT", name: "Spotify", sector: "Comm. Services" },
    { symbol: "GS", name: "Goldman Sachs", sector: "Financials" },
    { symbol: "MS", name: "Morgan Stanley", sector: "Financials" },
    { symbol: "C", name: "Citigroup", sector: "Financials" },
    { symbol: "WFC", name: "Wells Fargo", sector: "Financials" },
    { symbol: "RTX", name: "RTX Corp", sector: "Industrials" },
    { symbol: "BA", name: "Boeing", sector: "Industrials" },
    { symbol: "CAT", name: "Caterpillar", sector: "Industrials" },
    { symbol: "GE", name: "GE Aerospace", sector: "Industrials" },
    { symbol: "F", name: "Ford", sector: "Consumer Disc." },
    { symbol: "GM", name: "General Motors", sector: "Consumer Disc." },
    { symbol: "SBUX", name: "Starbucks", sector: "Consumer Disc." },
    { symbol: "MCD", name: "McDonald's", sector: "Consumer Disc." },
    { symbol: "NKE", name: "Nike", sector: "Consumer Disc." },
    { symbol: "TGT", name: "Target", sector: "Consumer Disc." },
    { symbol: "T", name: "AT&T", sector: "Comm. Services" },
    { symbol: "VZ", name: "Verizon", sector: "Comm. Services" },
    { symbol: "CMCSA", name: "Comcast", sector: "Comm. Services" },
  ];
  const _earningsCache = new Map<string, { data: unknown; ts: number }>();
  const EARNINGS_TTL = 6 * 60 * 60 * 1000;

  router.get("/earnings-calendar", async (req: Request, res: Response) => {
    const days = Math.min(parseInt((req.query.days as string) ?? "15", 10), 30);
    const cacheKey = `earnings-${days}`;
    const cached = _earningsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < EARNINGS_TTL) return res.json(cached.data);

    const auth = await getYFCrumb();
    if (!auth) return res.json({ items: [], lastUpdated: new Date().toISOString() });

    const now = Date.now();
    const cutoff = now + days * 24 * 60 * 60 * 1000;

    const results: Array<{ symbol: string; name: string; earningsDate: string; sector: string }> = [];
    const CONCURRENCY = 8;

    for (let i = 0; i < EARNINGS_SYMBOLS.length; i += CONCURRENCY) {
      const batch = EARNINGS_SYMBOLS.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (s) => {
          try {
            const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s.symbol)}?modules=calendarEvents&formatted=false&crumb=${encodeURIComponent(auth.crumb)}`;
            const r = await fetch(url, {
              headers: { "User-Agent": YF_CRUMB_UA, "Cookie": auth.cookie, "Accept": "application/json" },
              signal: AbortSignal.timeout(8_000),
            });
            if (!r.ok) return;
            const data = await r.json() as { quoteSummary?: { result?: Array<{ calendarEvents?: { earnings?: { earningsDate?: Array<{ raw: number }> } } }> } };
            const dates = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
            if (!dates || dates.length === 0) return;
            const ts = (dates[0].raw ?? 0) * 1000;
            if (ts >= now && ts <= cutoff) {
              results.push({
                symbol: s.symbol,
                name: s.name,
                earningsDate: new Date(ts).toISOString().slice(0, 10),
                sector: s.sector,
              });
            }
          } catch { /* skip */ }
        })
      );
    }

    results.sort((a, b) => a.earningsDate.localeCompare(b.earningsDate));
    const data = { items: results, lastUpdated: new Date().toISOString() };
    _earningsCache.set(cacheKey, { data, ts: Date.now() });
    return res.json(data);
  });

  // GET /api/trading/regime-summary
  const REGIME_SUMMARY_TTL = 5 * 60 * 1000;
  let _regimeSummaryCache: { data: unknown; ts: number } | null = null;

  router.get("/regime-summary", async (_req: Request, res: Response) => {
    if (_regimeSummaryCache && Date.now() - _regimeSummaryCache.ts < REGIME_SUMMARY_TTL) {
      return res.json(_regimeSummaryCache.data);
    }

    try {
      // Use cached signals or generate on demand for each TRADING_ASSET (strategy 4, 1d tf)
      const results: Array<{
        symbol: string; name: string; flag: string;
        direction: SignalDirection; confidence: number;
        regime: string;
      }> = [];

      await Promise.allSettled(
        TRADING_ASSETS.map(async (asset) => {
          const cacheKey = `${asset.symbol}|1d|4`;
          let sig = signalCache.get(cacheKey)?.data ?? null;
          if (!sig) {
            sig = await generateSignal(asset.symbol, "1d", "4");
          }
          if (!sig) return;
          const ind = sig.indicators;
          const price = sig.entry;
          const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
          const regime = classifyRegimeS5(atrPct, ind.adx ?? null);
          results.push({
            symbol: asset.symbol,
            name: asset.name,
            flag: asset.flag,
            direction: sig.direction,
            confidence: sig.confidence,
            regime,
          });
        })
      );

      const bullish = results.filter((r) => r.direction === "BUY").length;
      const neutral = results.filter((r) => r.direction === "HOLD").length;
      const bearish = results.filter((r) => r.direction === "SELL").length;

      const regimeBreakdown = {
        quiet_trend: results.filter((r) => r.regime === "quiet_trend").length,
        quiet_range: results.filter((r) => r.regime === "quiet_range").length,
        volatile_trend: results.filter((r) => r.regime === "volatile_trend").length,
        chaotic: results.filter((r) => r.regime === "chaotic").length,
      };

      const topBullish = results
        .filter((r) => r.direction === "BUY")
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(({ symbol, name, flag, confidence }) => ({ symbol, name, flag, confidence }));

      const topBearish = results
        .filter((r) => r.direction === "SELL")
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(({ symbol, name, flag, confidence }) => ({ symbol, name, flag, confidence }));

      const data = {
        bullish, neutral, bearish,
        total: results.length,
        regimeBreakdown,
        topBullish,
        topBearish,
        lastUpdated: new Date().toISOString(),
      };
      _regimeSummaryCache = { data, ts: Date.now() };
      return res.json(data);
    } catch (err) {
      console.error("[Regime Summary]", err);
      return res.status(503).json({ error: "Regime summary temporarily unavailable" });
    }
  });

  // ── GET /api/trading/correlation ───────────────────────────────────────────
  let _correlationCache: { data: unknown; ts: number } | null = null;
  const CORRELATION_TTL = 4 * 60 * 60 * 1000; // 4h

  router.get("/correlation", async (_req: Request, res: Response) => {
    if (_correlationCache && Date.now() - _correlationCache.ts < CORRELATION_TTL) {
      return res.json(_correlationCache.data);
    }
    try {
      const assets = TRADING_ASSETS.map(a => ({
        symbol: a.symbol,
        name: a.name,
        flag: a.flag,
        category: a.category,
      }));

      // Fetch ~60 days of daily closes for all assets in parallel
      const closesBySymbol = new Map<string, Map<string, number>>();
      await Promise.allSettled(
        TRADING_ASSETS.map(async (asset) => {
          try {
            const candles = (await yahooProvider.fetchHistoryCandles(
              asset.symbol, "1d", "3mo"
            )) as OHLCV[];
            const byDate = new Map<string, number>();
            for (const c of candles) {
              if (c.time && c.close) {
                const d = new Date(c.time * 1000).toISOString().slice(0, 10);
                byDate.set(d, c.close);
              }
            }
            closesBySymbol.set(asset.symbol, byDate);
          } catch (_) {
            closesBySymbol.set(asset.symbol, new Map());
          }
        })
      );

      // Compute Pearson correlation for every pair using overlapping dates
      const n = assets.length;
      const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

      for (let i = 0; i < n; i++) {
        matrix[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
          const si = assets[i].symbol;
          const sj = assets[j].symbol;
          const mapI = closesBySymbol.get(si)!;
          const mapJ = closesBySymbol.get(sj)!;

          // Overlapping dates
          const dates = [...mapI.keys()].filter(d => mapJ.has(d)).sort();
          if (dates.length < 5) {
            matrix[i][j] = 0;
            matrix[j][i] = 0;
            continue;
          }

          const xs = dates.map(d => mapI.get(d)!);
          const ys = dates.map(d => mapJ.get(d)!);
          const k = dates.length;
          const meanX = xs.reduce((a, b) => a + b, 0) / k;
          const meanY = ys.reduce((a, b) => a + b, 0) / k;

          let num = 0, denX = 0, denY = 0;
          for (let t = 0; t < k; t++) {
            const dx = xs[t] - meanX;
            const dy = ys[t] - meanY;
            num  += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
          }
          const denom = Math.sqrt(denX * denY);
          const r = denom > 0 ? Math.max(-1, Math.min(1, num / denom)) : 0;
          const rr = Math.round(r * 100) / 100;
          matrix[i][j] = rr;
          matrix[j][i] = rr;
        }
      }

      const data = { symbols: assets, matrix, lastUpdated: new Date().toISOString() };
      _correlationCache = { data, ts: Date.now() };
      return res.json(data);
    } catch (err) {
      console.error("[Correlation]", err);
      return res.status(503).json({ error: "Correlation temporarily unavailable" });
    }
  });

  // ── GET /api/trading/correlation/advanced ──────────────────────────────────
  // New, additive "Adv Correlation" tab — 180-symbol universe, background-only
  // compute (never on the request path). See runAdvCorrelationWarm above.
  router.get("/correlation/advanced", async (req: Request, res: Response) => {
    const window = (req.query.window as string) || "3m";
    if (!ADV_CORRELATION_WINDOWS.includes(window as AdvCorrelationWindow)) {
      return res.status(400).json({ error: `window must be one of: ${ADV_CORRELATION_WINDOWS.join(", ")}` });
    }
    const w = window as AdvCorrelationWindow;
    const cached = _advCorrelationCacheByWindow.get(w);
    if (cached && Date.now() - cached.ts < ADV_CORRELATION_TTL) {
      res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
      return res.json(cached.data);
    }
    if (_advRedis) {
      try {
        const snapshot = await _advRedis.get<AdvCorrelationData>(`correlation:advanced:${w}`);
        if (snapshot) {
          _advCorrelationCacheByWindow.set(w, { data: snapshot, ts: Date.now() });
          res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
          return res.json(snapshot);
        }
      } catch (err) {
        console.warn("[AdvCorrelation] Redis snapshot read failed:", err);
      }
    }
    return res.status(503).json({ error: "Adv correlation matrix warming up, try again shortly", cacheWarm: false });
  });

  // ── GET /api/trading/correlation/advanced/custom ───────────────────────────
  // User-pinned symbols, correlated against each other + a fixed reference-
  // anchor set (not the full 180-symbol base universe — see plan doc for why).
  const ADV_CUSTOM_MAX_SYMBOLS = 12;
  const ADV_CUSTOM_CACHE_MAX_ENTRIES = 200;
  const ADV_CUSTOM_CACHE_TTL = 45 * 60 * 1000;
  const _advCorrelationCustomCache = new Map<string, { data: AdvCorrelationData; ts: number }>();
  const ADV_CORRELATION_REFERENCE_ANCHORS = [
    "SPY", "QQQ", "GC=F", "CL=F", "DX-Y.NYB", "BTC-USD", "^VIX", "EURUSD=X", "^TNX", "HG=F",
  ];

  router.get("/correlation/advanced/custom", async (req: Request, res: Response) => {
    const rawSymbols = String(req.query.symbols ?? "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const symbols = [...new Set(rawSymbols)];
    if (symbols.length === 0) return res.status(400).json({ error: "symbols required" });
    if (symbols.length > ADV_CUSTOM_MAX_SYMBOLS) {
      return res.status(400).json({ error: `max ${ADV_CUSTOM_MAX_SYMBOLS} symbols` });
    }
    const window = (req.query.window as string) || "3m";
    if (!ADV_CORRELATION_WINDOWS.includes(window as AdvCorrelationWindow)) {
      return res.status(400).json({ error: `window must be one of: ${ADV_CORRELATION_WINDOWS.join(", ")}` });
    }
    const w = window as AdvCorrelationWindow;
    const cacheKey = `${w}:${[...symbols].sort().join(",")}`;
    const cached = _advCorrelationCustomCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ADV_CUSTOM_CACHE_TTL) {
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.json(cached.data);
    }

    try {
      const anchors = ADV_CORRELATION_REFERENCE_ANCHORS.filter(a => !symbols.includes(a));
      const universeSymbols = [...symbols, ...anchors];
      const seriesMap = new Map<string, Map<string, number>>();
      await runWithConcurrency(universeSymbols, async (symbol) => {
        const series = await fetchClosesWithRetry(symbol, "1y");
        seriesMap.set(symbol, series ?? new Map());
        return null;
      }, 10);

      const knownUniverse = currentCorrelationUniverse();
      const cutoff = w === "1y" ? null : Date.now() - ADV_CORRELATION_WINDOW_DAYS[w] * 24 * 60 * 60 * 1000;
      const symbolsMeta: CorrelationAsset[] = universeSymbols.map(s => {
        const known = knownUniverse.find(a => a.symbol === s);
        return known ?? { symbol: s, name: s, category: "Stocks", flag: "" };
      });
      const n = universeSymbols.length;
      const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      const windowed = universeSymbols.map(s => {
        const full = seriesMap.get(s) ?? new Map<string, number>();
        if (!cutoff) return full;
        const filtered = new Map<string, number>();
        for (const [date, close] of full) {
          if (new Date(date).getTime() >= cutoff) filtered.set(date, close);
        }
        return filtered;
      });
      for (let i = 0; i < n; i++) {
        matrix[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
          const r = pearson(windowed[i], windowed[j]);
          matrix[i][j] = r;
          matrix[j][i] = r;
        }
      }

      const data: AdvCorrelationData = {
        symbols: symbolsMeta,
        matrix,
        window: w,
        cacheWarm: true,
        staleSymbols: [],
        lastUpdated: new Date().toISOString(),
      };
      if (_advCorrelationCustomCache.size >= ADV_CUSTOM_CACHE_MAX_ENTRIES) {
        const oldestKey = _advCorrelationCustomCache.keys().next().value;
        if (oldestKey) _advCorrelationCustomCache.delete(oldestKey);
      }
      _advCorrelationCustomCache.set(cacheKey, { data, ts: Date.now() });
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.json(data);
    } catch (err) {
      console.error("[AdvCorrelationCustom]", err);
      return res.status(503).json({ error: "Custom correlation temporarily unavailable" });
    }
  });

  // ── GET /api/trading/correlation/advanced/history ──────────────────────────
  // 30-day rolling Pearson r for a symbol pair, downsampled to weekly steps
  // over a trailing 1y — the drill-down chart for a matrix cell / pairs row.
  const ADV_HISTORY_TTL = 4 * 60 * 60 * 1000;
  const ADV_HISTORY_CACHE_MAX_ENTRIES = 200;
  const ADV_HISTORY_ROLLING_DAYS = 30;
  const _advCorrelationHistoryCache = new Map<string, { data: unknown; ts: number }>();

  router.get("/correlation/advanced/history", async (req: Request, res: Response) => {
    const a = String(req.query.a ?? "").toUpperCase().trim();
    const b = String(req.query.b ?? "").toUpperCase().trim();
    if (!a || !b || a === b) {
      return res.status(400).json({ error: "a and b (distinct symbols) required" });
    }
    const key = [a, b].sort().join("|");
    const cached = _advCorrelationHistoryCache.get(key);
    if (cached && Date.now() - cached.ts < ADV_HISTORY_TTL) {
      res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
      return res.json(cached.data);
    }
    try {
      const [seriesA, seriesB] = await Promise.all([
        fetchClosesWithRetry(a, "1y"),
        fetchClosesWithRetry(b, "1y"),
      ]);
      const mapA = seriesA ?? new Map<string, number>();
      const mapB = seriesB ?? new Map<string, number>();
      const dates = [...mapA.keys()].filter(d => mapB.has(d)).sort();

      const points: { date: string; r: number }[] = [];
      for (let i = ADV_HISTORY_ROLLING_DAYS - 1; i < dates.length; i += 5) {
        const windowDates = dates.slice(i - ADV_HISTORY_ROLLING_DAYS + 1, i + 1);
        const xs = windowDates.map(d => mapA.get(d)!);
        const ys = windowDates.map(d => mapB.get(d)!);
        const k = xs.length;
        const meanX = xs.reduce((s, v) => s + v, 0) / k;
        const meanY = ys.reduce((s, v) => s + v, 0) / k;
        let num = 0, denX = 0, denY = 0;
        for (let t = 0; t < k; t++) {
          const dx = xs[t] - meanX, dy = ys[t] - meanY;
          num += dx * dy; denX += dx * dx; denY += dy * dy;
        }
        const denom = Math.sqrt(denX * denY);
        const r = denom > 0 ? Math.max(-1, Math.min(1, num / denom)) : 0;
        points.push({ date: dates[i], r: Math.round(r * 100) / 100 });
      }

      const data = {
        a: { symbol: a },
        b: { symbol: b },
        points,
        windowDays: ADV_HISTORY_ROLLING_DAYS,
        lastUpdated: new Date().toISOString(),
      };
      if (_advCorrelationHistoryCache.size >= ADV_HISTORY_CACHE_MAX_ENTRIES) {
        const oldestKey = _advCorrelationHistoryCache.keys().next().value;
        if (oldestKey) _advCorrelationHistoryCache.delete(oldestKey);
      }
      _advCorrelationHistoryCache.set(key, { data, ts: Date.now() });
      res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
      return res.json(data);
    } catch (err) {
      console.error("[AdvCorrelationHistory]", err);
      return res.status(503).json({ error: "Correlation history temporarily unavailable" });
    }
  });

  // GET /api/trading/scanner/institutional-flow
  //   ?type=accumulation|distribution|vwap|obv|short|insider
  const INST_FLOW_TYPES = ["accumulation", "distribution", "vwap", "obv", "short", "insider"] as const;
  router.get("/scanner/institutional-flow", async (req: Request, res: Response) => {
    const t = req.query.type as (typeof INST_FLOW_TYPES)[number];
    if (!INST_FLOW_TYPES.includes(t)) {
      return res.status(400).json({ error: `type must be one of: ${INST_FLOW_TYPES.join(", ")}` });
    }
    try {
      const result = await runInstitutionalFlow(t);
      return res.setHeader("Cache-Control", "public, max-age=1800").json(result);
    } catch (err) {
      console.error("[InstFlow]", err);
      return res.status(503).json({ error: "Institutional flow temporarily unavailable" });
    }
  });

  return router;
}
