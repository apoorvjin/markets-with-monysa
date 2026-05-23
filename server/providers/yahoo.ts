import type { ChartProvider, OHLCVCandle, PriceData, RangeData } from "./types";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
};
const TIMEOUT_MS = 10_000;

async function yfGet(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: YF_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`YF fetch failed: ${resp.status}`);
  return resp.json();
}

export const yahooProvider: ChartProvider = {
  name: "yahoo",
  label: "Yahoo Finance",

  async fetchCurrentPrice(symbol: string): Promise<PriceData | null> {
    try {
      const data = await yfGet(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      );
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price = meta.regularMarketPrice as number;
      const prevClose = (meta.chartPreviousClose ?? meta.previousClose ?? price) as number;
      const change = price - prevClose;
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
      return {
        price,
        change,
        changePercent,
        prevClose,
        preMarketPrice: (meta.preMarketPrice as number | undefined) ?? null,
        preMarketChangePercent: (meta.preMarketChangePercent as number | undefined) ?? null,
      };
    } catch {
      return null;
    }
  },

  async fetchRangeData(symbol: string, range: string): Promise<RangeData | null> {
    try {
      const data = await yfGet(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const rawCloses = result.indicators?.quote?.[0]?.close as (number | null)[] | undefined;
      if (!rawCloses) return null;
      const closes = rawCloses.filter((c): c is number => c != null && !isNaN(c));
      if (closes.length < 2) return null;
      const first = closes[0];
      const last = closes[closes.length - 1];
      const change = last - first;
      const changePercent = (change / first) * 100;
      return { change, changePercent, sparkline: closes, lastPrice: last };
    } catch {
      return null;
    }
  },

  async fetchChartCandles(symbol: string, range: string, interval: string): Promise<OHLCVCandle[]> {
    const data = await yfGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    );
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No data for symbol");

    const timestamps = (result.timestamp ?? []) as number[];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens   = (quote.open   ?? []) as (number | null)[];
    const highs   = (quote.high   ?? []) as (number | null)[];
    const lows    = (quote.low    ?? []) as (number | null)[];
    const closes  = (quote.close  ?? []) as (number | null)[];
    const volumes = (quote.volume ?? []) as (number | null)[];

    return timestamps
      .map((ts, i) => ({
        time:   new Date(ts * 1000).toISOString().split("T")[0],
        open:   opens[i]   as number,
        high:   highs[i]   as number,
        low:    lows[i]    as number,
        close:  closes[i]  as number,
        volume: volumes[i] ?? null,
      }))
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null);
  },

  async fetchHistoryCandles(symbol: string, interval: string, range: string): Promise<OHLCVCandle[]> {
    try {
      const data = await yfGet(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      );
      const result = data?.chart?.result?.[0];
      if (!result) return [];

      const timestamps: number[] = result.timestamp ?? [];
      const quotes = result.indicators?.quote?.[0] ?? { open: [], high: [], low: [], close: [], volume: [] };

      return timestamps
        .map((t, i) => ({
          time:   t,
          open:   (quotes.open[i]   as number | null) ?? 0,
          high:   (quotes.high[i]   as number | null) ?? 0,
          low:    (quotes.low[i]    as number | null) ?? 0,
          close:  (quotes.close[i]  as number | null) ?? 0,
          volume: (quotes.volume[i] as number | null) ?? 0,
        }))
        .filter(c => c.open && c.high && c.low && c.close);
    } catch {
      return [];
    }
  },
};
