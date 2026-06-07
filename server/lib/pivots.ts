import type { OHLCVCandle } from "../providers/types";

export interface SupportResistanceLevel {
  price: number;
  type: "support" | "resistance";
  strength: number;
  firstTouched: string;
  lastTouched: string;
}

interface FindPivotsOpts {
  lookback?: number;
  cluster?: number;
}

/**
 * Detects support/resistance levels by:
 *   1. Finding pivot highs and pivot lows over a rolling window of `lookback`
 *      candles on each side.
 *   2. Clustering pivots whose prices fall within `cluster` (fractional, e.g.
 *      0.005 = 0.5%) of each other.
 *   3. Returning the median price of each cluster, with `strength` = touch
 *      count and the first/last timestamps the cluster was tested.
 *
 * Pure function. Empty array on insufficient data.
 */
export function findPivots(
  candles: OHLCVCandle[],
  opts: FindPivotsOpts = {},
): SupportResistanceLevel[] {
  const lookback = opts.lookback ?? 5;
  const cluster = opts.cluster ?? 0.005;

  if (candles.length < lookback * 2 + 1) return [];

  type Pivot = { price: number; type: "support" | "resistance"; time: string };
  const pivots: Pivot[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const candle = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candle.high) isHigh = false;
      if (candles[j].low <= candle.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    const time = toIso(candle.time);
    if (isHigh) pivots.push({ price: candle.high, type: "resistance", time });
    if (isLow) pivots.push({ price: candle.low, type: "support", time });
  }

  pivots.sort((a, b) => a.price - b.price);

  type Cluster = {
    type: "support" | "resistance";
    prices: number[];
    first: string;
    last: string;
  };
  const clusters: Cluster[] = [];
  for (const p of pivots) {
    const existing = clusters.find(
      (c) =>
        c.type === p.type &&
        Math.abs(median(c.prices) - p.price) / median(c.prices) <= cluster,
    );
    if (existing) {
      existing.prices.push(p.price);
      if (p.time < existing.first) existing.first = p.time;
      if (p.time > existing.last) existing.last = p.time;
    } else {
      clusters.push({
        type: p.type,
        prices: [p.price],
        first: p.time,
        last: p.time,
      });
    }
  }

  return clusters
    .filter((c) => c.prices.length >= 2)
    .map((c) => ({
      price: round(median(c.prices)),
      type: c.type,
      strength: c.prices.length,
      firstTouched: c.first,
      lastTouched: c.last,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIso(time: string | number): string {
  if (typeof time === "number") return new Date(time * 1000).toISOString();
  return time;
}
