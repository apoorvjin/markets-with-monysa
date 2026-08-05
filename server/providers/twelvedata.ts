// Twelve Data spot-price provider — supplies real SPOT prices for commodities that
// Yahoo only serves as futures (gold/silver/oil/copper). Free tier: 800 credits/day,
// 8/min. One time_series?interval=1day call per symbol yields BOTH the live spot
// price (latest bar close) AND the daily candle history for signal indicators, so a
// single credit per symbol per poll covers quotes + 1d signals. Degrades to null when
// TWELVE_DATA_API_KEY is absent — callers then fall back to the Yahoo futures feed.
// Reuses the SAME key already used for Twelve Data earnings (fetchTwelveDataEarnings).

const TD_KEY = process.env.TWELVE_DATA_API_KEY ?? null;
const TD_BASE = "https://api.twelvedata.com";
const TIMEOUT_MS = 10_000;

export const twelveDataConfigured = TD_KEY != null;

export interface SpotDaily {
  price: number;
  change: number;
  changePercent: number;
  // Daily OHLC candles, ascending by time (unix seconds) — matches Yahoo's OHLCV shape.
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

/**
 * Fetch daily spot OHLC + derive the live price from the latest bar.
 * Returns null on missing key, HTTP error, API error, or thin data.
 */
export async function fetchSpotDaily(tdSymbol: string, outputsize = 250): Promise<SpotDaily | null> {
  if (!TD_KEY) return null;
  try {
    const url =
      `${TD_BASE}/time_series?symbol=${encodeURIComponent(tdSymbol)}` +
      `&interval=1day&outputsize=${outputsize}&order=ASC&apikey=${TD_KEY}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    // Twelve Data signals errors (bad symbol, plan-gated, rate-limited) via status:"error".
    if (data?.status === "error" || !Array.isArray(data?.values)) return null;

    const candles = data.values
      .map((v: any) => ({
        time: Math.floor(Date.parse(v.datetime) / 1000),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: v.volume != null ? parseFloat(v.volume) : 0,
      }))
      .filter((c: SpotDaily["candles"][number]) => Number.isFinite(c.close) && c.close > 0);

    if (candles.length < 2) return null;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const change = last.close - prev.close;
    const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;
    return { price: last.close, change, changePercent, candles };
  } catch {
    return null;
  }
}
