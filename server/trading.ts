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

    // Pre-market data (present before market open; Yahoo returns percent as a small
    // decimal like 0.52 meaning 0.52 %, so no multiplication needed)
    const preMarketPrice = meta.preMarketPrice ?? null;
    const rawPmp = meta.preMarketChangePercent;
    const preMarketChangePercent = rawPmp != null ? rawPmp : null;

    return { price, change, changePercent, updatedAt: Date.now(), preMarketPrice, preMarketChangePercent };
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

function calcObvSlope(candles: OHLCV[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let obv = 0;
  const obvArr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    obvArr.push(obv);
  }
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
  const adx = calcAdx(candles);
  const bbWidth = bb && bb.mid !== 0 ? Math.round(((bb.upper - bb.lower) / bb.mid) * 10000) / 10000 : null;

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
    adx,
    bbWidth,
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
type StrategyId = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
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
  } else {
    const { score: s1, bullets: b1 } = strategyS1(ind, currentPrice);
    ({ score, bullets } = strategyS3(s1, newsSentiment, b1));
  }

  const direction =
    strategy === "4" ? scoreToSignalS4(score) :
    strategy === "5" ? (score > s5threshold ? "BUY" : score < -s5threshold ? "SELL" : "HOLD") :
    strategy === "6" ? (score > 0.45 ? "BUY" : score < -0.35 ? "SELL" : "HOLD") :
    (strategy === "7" || strategy === "8") ? (score > apexThreshold ? "BUY" : score < -apexThreshold ? "SELL" : "HOLD") :
    scoreToSignal(score);
  const confidence = (strategy === "5" || strategy === "6" || strategy === "7" || strategy === "8") ? calibrateConfidenceS5(Math.abs(score)) : scoreToConfidence(score);
  const { stopLoss, takeProfit, riskReward } = (strategy === "7" || strategy === "8")
    ? buildRiskLevelsAPEX(direction, currentPrice, ind.atr, apexRegime)
    : buildRiskLevels(direction, currentPrice, ind.atr);

  const result: SignalResult = {
    symbol,
    name: ASSET_MAP.get(symbol)?.name ?? symbol,
    direction,
    confidence,
    entry: Math.round(currentPrice * 10000) / 10000,
    stopLoss,
    takeProfit,
    riskReward,
    reasoning: bullets.slice(0, (strategy === "3" || strategy === "5" || strategy === "6" || strategy === "7" || strategy === "8") ? 6 : 5),
    indicators: ind,
    strategy,
    timeframe: tf,
    timestamp: new Date().toISOString(),
    ...((strategy === "7" || strategy === "8") ? { quality: apexQuality, apexRegime, positionRiskPct: apexPositionRisk, htfAlignment: apexHtfAlignment, tradeable: apexTradeable } : {}),
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
    } else if (strat === "4") {
      const candleSlice = candles.slice(0, i + 1);
      score = strategyS4(ind, price, candleSlice).score;
      return scoreToSignalS4(score);
    } else if (strat === "5") {
      const candleSlice = candles.slice(0, i + 1);
      const r = strategyS5(ind, price, candleSlice);
      return r.score > r.threshold ? "BUY" : r.score < -r.threshold ? "SELL" : "HOLD";
    } else if (strat === "6") {
      // No historical news in backtest — use S2 score with S6 asymmetric thresholds
      const atrPct = ind.atr ? (ind.atr / price) * 100 : 2;
      const { score: s6score } = strategyS2(ind, price, atrPct);
      return s6score > 0.45 ? "BUY" : s6score < -0.35 ? "SELL" : "HOLD";
    } else if (strat === "7") {
      // No HTF/cross-asset data in backtest — APEX runs with available candles only
      const candleSlice = candles.slice(0, i + 1);
      const r = strategyAPEX(ind, price, candleSlice, [], null, false);
      return r.tradeable && r.score > r.threshold ? "BUY" : r.tradeable && r.score < -r.threshold ? "SELL" : "HOLD";
    } else if (strat === "8") {
      const candleSlice = candles.slice(0, i + 1);
      const r = strategyEnsemble(ind, price, candleSlice, [], null, false);
      return r.agreementCount >= 2 && r.score > 0.40 ? "BUY" : r.agreementCount >= 2 && r.score < -0.40 ? "SELL" : "HOLD";
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
      "4": runBacktestOnSeries(closes, (i) => getSignal(i, "4")),
      "5": runBacktestOnSeries(closes, (i) => getSignal(i, "5")),
      "6": runBacktestOnSeries(closes, (i) => getSignal(i, "6")),
      "7": runBacktestOnSeries(closes, (i) => getSignal(i, "7")),
      "8": runBacktestOnSeries(closes, (i) => getSignal(i, "8")),
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
        preMarketPrice: p?.preMarketPrice ?? null,
        preMarketChangePercent: p?.preMarketChangePercent ?? null,
      };
    });
    res.json({ quotes, timestamp: new Date().toISOString() });
  });

  const VALID_TF: Timeframe[] = ["1m", "5m", "1h", "4h", "1d"];
  const VALID_STRAT: StrategyId[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

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
      return res.status(400).json({ error: "Invalid strategy. Use: 1, 2, 3, 4, 5, 6, 7, 8" });
    }

    // S3 and S6 need news; S7 needs HTF candles + cross-asset candles
    let newsSentiment = 0;
    let newsArticles: NewsArticle[] = [];
    if (strategy === "3" || strategy === "6" || strategy === "7") {
      if (strategy !== "7") {
        const news = await fetchNewsForSymbol(symbol);
        newsSentiment = news.aggregateSentiment;
        newsArticles = news.articles;
      }
    }

    const HTF_MAP: Record<Timeframe, Timeframe | null> = {
      "1m": "1h", "5m": "1h", "1h": "4h", "4h": "1d", "1d": null,
    };
    let htfCandles: OHLCV[] = [];
    let crossAssetCandles: OHLCV[] | null = null;
    let crossAssetInverse = false;
    if (strategy === "7" || strategy === "8") {
      const htfTf = HTF_MAP[tf!];
      if (htfTf) htfCandles = await fetchHistory(symbol, htfTf);
      const crossPair = CROSS_ASSET_PAIRS[symbol];
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

    const result = await runBacktest(symbol, tf);
    if (!result) {
      return res.status(503).json({ error: "Insufficient data for backtest (need 60+ candles)" });
    }
    return res.json(result);
  });

  // GET /api/trading/news/:symbol
  router.get("/news/:symbol", async (req: Request, res: Response) => {
    const symbol = paramStr(req.params.symbol);
    const result = await fetchNewsForSymbol(symbol);
    return res.json(result);
  });

  return router;
}
