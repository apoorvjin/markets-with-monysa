import { yahooProvider } from "../providers";
import type { PriceData, RangeData } from "../providers/types";

export type { PriceData, RangeData };

export async function fetchYahooPrice(symbol: string): Promise<PriceData | null> {
  return yahooProvider.fetchCurrentPrice(symbol);
}

export async function fetchRangeData(symbol: string, range: string): Promise<RangeData | null> {
  return yahooProvider.fetchRangeData(symbol, range);
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
