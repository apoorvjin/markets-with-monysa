/**
 * server/trading.ts
 * AI Trading Signals module — integrated into Monysa Express backend.
 *
 * Endpoints (all prefixed /api/trading/):
 *   GET  /quotes              — live prices for all 39 assets (refreshed every 10 s)
 *   GET  /signals/:symbol     — BUY/HOLD/SELL signal with confidence, Entry/SL/TP, indicators
 *   GET  /history/:symbol     — OHLCV candles for 5 timeframes
 *   GET  /backtest/:symbol    — walk-forward backtest results across 3 strategies
 *   GET  /news/:symbol        — up to 8 headlines with per-article + aggregate sentiment
 */

import { Router, type Request, type Response } from "express";

// ─── External API Response Types ─────────────────────────────────────────────

interface YFChartMeta {
  regularMarketPrice: number;
  chartPreviousClose?: number;
  previousClose?: number;
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
}

export const latestPrices = new Map<string, PriceEntry>();

// ─── Yahoo Finance Helpers ────────────────────────────────────────────────────

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
};

async function yfFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`YF fetch failed: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function fetchCurrentPrice(symbol: string): Promise<PriceEntry | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const data = await yfFetch<YFChartResponse>(url);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return { price, change, changePercent, updatedAt: Date.now() };
  } catch {
    return null;
  }
}

// ─── Price Polling Loop ───────────────────────────────────────────────────────

async function pollAllPrices() {
  const symbols = TRADING_ASSETS.map(a => a.symbol);
  const BATCH = 10;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(s => fetchCurrentPrice(s)));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value) {
        latestPrices.set(batch[idx], r.value);
      }
    });
  }
}

// Boot: immediate poll, then every 10 s
pollAllPrices().catch(() => {});
setInterval(() => pollAllPrices().catch(() => {}), 10_000);

// ─── Optional Finnhub WebSocket for Crypto ───────────────────────────────────

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

function startFinnhubWebSocket() {
  if (!FINNHUB_KEY) return;

  let reconnectDelay = 3000;

  const cryptoAssets = TRADING_ASSETS.filter(a => a.category === "Crypto" && a.finnhubSymbol);

  const connect = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WsConstructor = require("ws") as new (url: string) => WsLike;
      const ws = new WsConstructor(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

      ws.on("open", () => {
        reconnectDelay = 3000;
        for (const asset of cryptoAssets) {
          ws.send(JSON.stringify({ type: "subscribe", symbol: asset.finnhubSymbol }));
        }
        console.log("[Finnhub WS] Connected — subscribed to", cryptoAssets.length, "crypto streams");
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as FinnhubMessage;
          if (msg.type === "trade" && Array.isArray(msg.data)) {
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
        console.warn(`[Finnhub WS] Disconnected — reconnecting in ${reconnectDelay}ms`);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
      });
    } catch (err) {
      console.warn("[Finnhub WS] Could not start:", err);
    }
  };

  connect();
}

startFinnhubWebSocket();

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
  ema12: number | null;
  ema26: number | null;
  ema50: number | null;
  ema200: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  atr: number | null;
  roc: number | null;
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

function calculateIndicators(candles: OHLCV[]): Indicators {
  const closes = candles.map(c => c.close);

  const ema12Arr = calcEma(closes, 12);
  const ema26Arr = calcEma(closes, 26);
  const ema50Arr = calcEma(closes, 50);
  const ema200Arr = calcEma(closes, 200);

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

  return {
    rsi,
    macd: macd !== null ? Math.round(macd * 10000) / 10000 : null,
    macdSignal: macdSignal !== null ? Math.round(macdSignal * 10000) / 10000 : null,
    macdHistogram: macdHistogram !== null ? Math.round(macdHistogram * 10000) / 10000 : null,
    ema12: ema12 !== null ? Math.round(ema12 * 100) / 100 : null,
    ema26: ema26 !== null ? Math.round(ema26 * 100) / 100 : null,
    ema50: ema50 !== null ? Math.round(ema50 * 100) / 100 : null,
    ema200: ema200 !== null ? Math.round(ema200 * 100) / 100 : null,
    bbUpper: bb ? Math.round(bb.upper * 100) / 100 : null,
    bbMid: bb ? Math.round(bb.mid * 100) / 100 : null,
    bbLower: bb ? Math.round(bb.lower * 100) / 100 : null,
    atr,
    roc,
  };
}

// ─── History Fetching ─────────────────────────────────────────────────────────

type Timeframe = "1m" | "5m" | "1h" | "4h" | "1d";

const TF_PARAMS: Record<Timeframe, { interval: string; range: string }> = {
  "1m": { interval: "1m",  range: "1d"  },
  "5m": { interval: "5m",  range: "5d"  },
  "1h": { interval: "60m", range: "1mo" },
  "4h": { interval: "60m", range: "3mo" },
  "1d": { interval: "1d",  range: "1y"  },
};

const historyCache = new Map<string, { data: OHLCV[]; ts: number }>();
const HISTORY_TTL = 5 * 60_000;

async function fetchHistory(symbol: string, tf: Timeframe): Promise<OHLCV[]> {
  const cacheKey = `${symbol}|${tf}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_TTL) return cached.data;

  const params = TF_PARAMS[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  try {
    const data = await yfFetch<YFChartResponse>(url);
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quotes: YFChartQuote = result.indicators?.quote?.[0] ?? { open: [], high: [], low: [], close: [], volume: [] };
    const opens = quotes.open;
    const highs = quotes.high;
    const lows = quotes.low;
    const closes = quotes.close;
    const volumes = quotes.volume;

    let candles: OHLCV[] = timestamps
      .map((t, i) => ({
        time: t,
        open: opens[i] ?? 0,
        high: highs[i] ?? 0,
        low: lows[i] ?? 0,
        close: closes[i] ?? 0,
        volume: volumes[i] ?? 0,
      }))
      .filter(c => c.open && c.high && c.low && c.close);

    // Aggregate 1h bars into 4h bars
    if (tf === "4h") {
      const aggregated: OHLCV[] = [];
      for (let i = 0; i < candles.length; i += 4) {
        const group = candles.slice(i, i + 4);
        if (group.length === 0) continue;
        aggregated.push({
          time: group[0].time,
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
type StrategyId = "1" | "2" | "3";

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
}

const signalCache = new Map<string, { data: SignalResult; ts: number }>();
const SIGNAL_TTL = 30_000;

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

function scoreToSignal(score: number): SignalDirection {
  if (score > 0.25) return "BUY";
  if (score < -0.25) return "SELL";
  return "HOLD";
}

function scoreToConfidence(score: number): number {
  const abs = Math.abs(score);
  // Maps 0..1 → 50..95
  return Math.round(50 + abs * 45);
}

function buildRiskLevels(
  direction: SignalDirection,
  price: number,
  atr: number | null,
): { stopLoss: number; takeProfit: number; riskReward: number } {
  const risk = atr ? atr * 1.5 : price * 0.02;
  const reward = risk * 2.5;
  const sl = direction === "BUY" ? price - risk : price + risk;
  const tp = direction === "BUY" ? price + reward : price - reward;
  return {
    stopLoss: Math.round(sl * 10000) / 10000,
    takeProfit: Math.round(tp * 10000) / 10000,
    riskReward: Math.round((reward / risk) * 100) / 100,
  };
}

async function generateSignal(
  symbol: string,
  tf: Timeframe,
  strategy: StrategyId,
  newsSentiment = 0,
  bypassCache = false,
): Promise<SignalResult | null> {
  const cacheKey = `${symbol}|${tf}|${strategy}`;
  const cached = signalCache.get(cacheKey);
  if (!bypassCache && cached && Date.now() - cached.ts < SIGNAL_TTL) return cached.data;

  const asset = ASSET_MAP.get(symbol);
  if (!asset) return null;

  const candles = await fetchHistory(symbol, tf);
  if (candles.length < 30) return null;

  const ind = calculateIndicators(candles);
  const currentPrice = latestPrices.get(symbol)?.price ?? candles[candles.length - 1].close;
  const atrPct = ind.atr ? (ind.atr / currentPrice) * 100 : 2;

  let score: number;
  let bullets: string[];

  if (strategy === "1") {
    ({ score, bullets } = strategyS1(ind, currentPrice));
  } else if (strategy === "2") {
    ({ score, bullets } = strategyS2(ind, currentPrice, atrPct));
  } else {
    const { score: s1, bullets: b1 } = strategyS1(ind, currentPrice);
    ({ score, bullets } = strategyS3(s1, newsSentiment, b1));
  }

  const direction = scoreToSignal(score);
  const confidence = scoreToConfidence(score);
  const { stopLoss, takeProfit, riskReward } = buildRiskLevels(direction, currentPrice, ind.atr);

  const result: SignalResult = {
    symbol,
    name: asset.name,
    direction,
    confidence,
    entry: Math.round(currentPrice * 10000) / 10000,
    stopLoss,
    takeProfit,
    riskReward,
    reasoning: bullets.slice(0, strategy === "3" ? 6 : 5),
    indicators: ind,
    strategy,
    timeframe: tf,
    timestamp: new Date().toISOString(),
  };

  signalCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ─── Backtest Engine ──────────────────────────────────────────────────────────

interface TradeRecord {
  n: number;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
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

interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  strategies: Record<StrategyId, StrategyPerf>;
  timestamp: string;
}

const backtestCache = new Map<string, { data: BacktestResult; ts: number }>();
const BACKTEST_TTL = 10 * 60_000;

function runBacktestOnSeries(closes: number[], strategyFn: (i: number) => SignalDirection): StrategyPerf {
  const splitIdx = Math.floor(closes.length * 0.7);
  const testCloses = closes.slice(splitIdx);
  if (testCloses.length < 10) {
    return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  }

  let wins = 0;
  let totalTrades = 0;
  const returns: number[] = [];
  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  const tradeLog: TradeRecord[] = [];

  const HOLD_BARS = 5;

  for (let i = 0; i < testCloses.length - HOLD_BARS; i++) {
    const sig = strategyFn(splitIdx + i);
    if (sig === "HOLD") continue;

    const entry = testCloses[i];
    const exit = testCloses[i + HOLD_BARS];
    const ret = sig === "BUY" ? (exit - entry) / entry : (entry - exit) / entry;

    returns.push(ret);
    totalTrades++;
    if (ret > 0) wins++;

    equity *= 1 + ret;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;

    tradeLog.push({
      n: totalTrades,
      direction: sig,
      entryPrice: Math.round(entry * 10000) / 10000,
      exitPrice: Math.round(exit * 10000) / 10000,
      returnPct: Math.round(ret * 10000) / 100,
      win: ret > 0,
    });
  }

  if (totalTrades === 0) {
    return { winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpe: 0, trades: 0, tradeLog: [] };
  }

  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdRet =
    returns.length > 1
      ? Math.sqrt(returns.reduce((a, b) => a + (b - avgRet) ** 2, 0) / (returns.length - 1))
      : 0;
  const annualisedReturn = (equity - 1) * 100;
  const sharpe = stdRet > 0 ? (avgRet / stdRet) * Math.sqrt(252) : 0;

  return {
    winRate: Math.round((wins / totalTrades) * 1000) / 10,
    totalReturn: Math.round(annualisedReturn * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    trades: totalTrades,
    tradeLog,
  };
}

async function runBacktest(symbol: string, tf: Timeframe): Promise<BacktestResult | null> {
  const cacheKey = `${symbol}|${tf}`;
  const cached = backtestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BACKTEST_TTL) return cached.data;

  const candles = await fetchHistory(symbol, tf);
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const inds: Indicators[] = [];
  const WARMUP = 30;

  for (let i = WARMUP; i <= closes.length; i++) {
    const slice = candles.slice(0, i);
    inds.push(calculateIndicators(slice));
  }

  const getSignal = (i: number, strat: StrategyId): SignalDirection => {
    const idx = i - WARMUP;
    if (idx < 0 || idx >= inds.length) return "HOLD";
    const ind = inds[idx];
    const price = closes[i];
    if (!ind) return "HOLD";
    let score: number;
    if (strat === "1") score = scoreIndicators(ind, price).score;
    else if (strat === "2") {
      const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
      score = strategyS2(ind, price, atrPct).score;
    } else {
      const { score: s } = strategyS1(ind, price);
      score = s; // no news in backtest
    }
    return scoreToSignal(score);
  };

  const result: BacktestResult = {
    symbol,
    timeframe: tf,
    strategies: {
      "1": runBacktestOnSeries(closes, (i) => getSignal(i, "1")),
      "2": runBacktestOnSeries(closes, (i) => getSignal(i, "2")),
      "3": runBacktestOnSeries(closes, (i) => getSignal(i, "3")),
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
const NEWS_TTL = 15 * 60_000;

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

async function fetchNewsForSymbol(symbol: string): Promise<NewsResult> {
  const cached = newsCache.get(symbol);
  if (cached && Date.now() - cached.ts < NEWS_TTL) return cached.data;

  const asset = ASSET_MAP.get(symbol);
  const query = asset ? asset.name : symbol;

  let articles: NewsArticle[] = [];

  try {
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

// ─── Express Router ───────────────────────────────────────────────────────────

export function createTradingRouter(): Router {
  const router = Router();

  // GET /api/trading/quotes
  router.get("/quotes", (_req: Request, res: Response) => {
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
      };
    });
    res.json({ quotes, timestamp: new Date().toISOString() });
  });

  const VALID_TF: Timeframe[] = ["1m", "5m", "1h", "4h", "1d"];
  const VALID_STRAT: StrategyId[] = ["1", "2", "3"];

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

    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }
    if (!VALID_STRAT.includes(strategy)) {
      return res.status(400).json({ error: "Invalid strategy. Use: 1, 2, 3" });
    }
    if (!ASSET_MAP.has(symbol)) {
      return res.status(404).json({ error: "Unknown symbol" });
    }

    // For S3, we need news sentiment first
    let newsSentiment = 0;
    if (strategy === "3") {
      const news = await fetchNewsForSymbol(symbol);
      newsSentiment = news.aggregateSentiment;
    }

    const bypassCache = !!req.query.fresh;
    const signal = await generateSignal(symbol, tf, strategy, newsSentiment, bypassCache);
    if (!signal) {
      return res.status(503).json({ error: "Insufficient historical data to generate signal" });
    }
    return res.json(signal);
  });

  // GET /api/trading/history/:symbol
  // Supports ?interval=1d (spec) or ?timeframe=1d (alias)
  router.get("/history/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const tf = resolveTimeframe(req.query);

    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }
    if (!ASSET_MAP.has(symbol)) {
      return res.status(404).json({ error: "Unknown symbol" });
    }

    const candles = await fetchHistory(symbol, tf);
    if (candles.length === 0) {
      return res.status(503).json({ error: "Failed to fetch history" });
    }
    return res.json({ symbol, timeframe: tf, interval: tf, candles, count: candles.length });
  });

  // GET /api/trading/backtest/:symbol
  router.get("/backtest/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const tf = resolveTimeframe(req.query);

    if (!tf) {
      return res.status(400).json({ error: "Invalid interval/timeframe. Use: 1m, 5m, 1h, 4h, 1d" });
    }
    if (!ASSET_MAP.has(symbol)) {
      return res.status(404).json({ error: "Unknown symbol" });
    }

    const result = await runBacktest(symbol, tf);
    if (!result) {
      return res.status(503).json({ error: "Insufficient data for backtest (need 60+ candles)" });
    }
    return res.json(result);
  });

  // GET /api/trading/news/:symbol
  router.get("/news/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    if (!ASSET_MAP.has(symbol)) {
      return res.status(404).json({ error: "Unknown symbol" });
    }
    const result = await fetchNewsForSymbol(symbol);
    return res.json(result);
  });

  return router;
}
