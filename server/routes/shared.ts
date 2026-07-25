import { yahooProvider } from "../providers";
import type { PriceData, RangeData, OHLCVCandle } from "../providers/types";

export type { PriceData, RangeData, OHLCVCandle };

export async function fetchYahooPrice(symbol: string): Promise<PriceData | null> {
  return yahooProvider.fetchCurrentPrice(symbol);
}

export async function fetchRangeData(symbol: string, range: string): Promise<RangeData | null> {
  return yahooProvider.fetchRangeData(symbol, range);
}

/** Intraday OHLCV candles (default 1-minute bars over the current session). */
export async function fetchIntradayCandles(
  symbol: string,
  interval = "1m",
  range = "1d",
): Promise<OHLCVCandle[]> {
  return yahooProvider.fetchChartCandles(symbol, range, interval);
}

export async function fetchBatch(
  symbols: string[],
): Promise<Map<string, { price?: number; change?: number; changePercent?: number }>> {
  const results = new Map<string, { price?: number; change?: number; changePercent?: number }>();
  const BATCH = 10;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(s => yahooProvider.fetchCurrentPrice(s).then(r => ({ s, r }))),
    );
    for (const { s, r } of fetched) {
      if (r) results.set(s, r);
    }
  }
  return results;
}
