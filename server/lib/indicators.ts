import type { OHLCVCandle } from "../providers/types";

// Server-side indicator math, ported 1:1 from moby/lib/utils/indicators.dart
// so web and mobile can consume identical values. Computed on demand from the
// route's already-cached candles — O(n) per request, no extra caching layer.
//
// Series values are aligned to the candle `time` that produced them; leading
// candles whose window isn't full yet are skipped (same convention as Dart).

export interface IndicatorPoint {
  time: string | number;
  value: number;
}

export function sma(candles: OHLCVCandle[], period: number): IndicatorPoint[] {
  if (period <= 0 || candles.length < period) return [];
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  out.push({ time: candles[period - 1].time, value: sum / period });
  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: OHLCVCandle[], period: number): IndicatorPoint[] {
  if (period <= 0 || candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let prev = sum / period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

function emaOfSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  const out = [sum / period];
  for (let i = period; i < values.length; i++) {
    out.push(values[i] * k + out[out.length - 1] * (1 - k));
  }
  return out;
}

export function vwap(candles: OHLCVCandle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let cumPv = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume ?? 0;
    cumPv += typical * v;
    cumVol += v;
    if (cumVol > 0) out.push({ time: c.time, value: cumPv / cumVol });
  }
  return out;
}

export interface BollingerBands {
  upper: IndicatorPoint[];
  mid: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export function bollinger(
  candles: OHLCVCandle[],
  period = 20,
  stddev = 2.0,
): BollingerBands {
  if (candles.length < period) return { upper: [], mid: [], lower: [] };
  const upper: IndicatorPoint[] = [];
  const mid: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let k = i - period + 1; k <= i; k++) sum += candles[k].close;
    const m = sum / period;
    let variance = 0;
    for (let k = i - period + 1; k <= i; k++) {
      const d = candles[k].close - m;
      variance += d * d;
    }
    variance /= period; // population stddev — matches TradingView default
    const sd = Math.sqrt(variance);
    const t = candles[i].time;
    mid.push({ time: t, value: m });
    upper.push({ time: t, value: m + stddev * sd });
    lower.push({ time: t, value: m - stddev * sd });
  }
  return { upper, mid, lower };
}

export function rsi(candles: OHLCVCandle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;
  const value = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  const out: IndicatorPoint[] = [
    { time: candles[period].time, value: value(avgGain, avgLoss) },
  ];
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: value(avgGain, avgLoss) });
  }
  return out;
}

export interface MacdSeries {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

export function macd(
  candles: OHLCVCandle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdSeries {
  if (candles.length < slow + signal) return { macd: [], signal: [], histogram: [] };
  const fastArr = ema(candles, fast);
  const slowArr = ema(candles, slow);
  const offset = fastArr.length - slowArr.length;
  const macdPoints: IndicatorPoint[] = slowArr.map((p, i) => ({
    time: p.time,
    value: fastArr[i + offset].value - p.value,
  }));
  const signalRaw = emaOfSeries(macdPoints.map((p) => p.value), signal);
  const signalPoints: IndicatorPoint[] = signalRaw.map((v, i) => ({
    time: macdPoints[i + signal - 1].time,
    value: v,
  }));
  const histogram: IndicatorPoint[] = signalPoints.map((p, i) => ({
    time: p.time,
    value: macdPoints[i + signal - 1].value - p.value,
  }));
  return { macd: macdPoints, signal: signalPoints, histogram };
}

export interface StochasticSeries {
  k: IndicatorPoint[];
  d: IndicatorPoint[];
}

export function stochastic(
  candles: OHLCVCandle[],
  kPeriod = 14,
  smooth = 3,
  dPeriod = 3,
): StochasticSeries {
  if (candles.length < kPeriod + smooth + dPeriod - 2) return { k: [], d: [] };
  const fastK: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = i - kPeriod + 1; k <= i; k++) {
      if (candles[k].high > hi) hi = candles[k].high;
      if (candles[k].low < lo) lo = candles[k].low;
    }
    const range = hi - lo;
    fastK.push({
      time: candles[i].time,
      value: range === 0 ? 50 : (100 * (candles[i].close - lo)) / range,
    });
  }
  const smaOfPoints = (pts: IndicatorPoint[], period: number): IndicatorPoint[] => {
    if (pts.length < period) return [];
    const out: IndicatorPoint[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += pts[i].value;
    out.push({ time: pts[period - 1].time, value: sum / period });
    for (let i = period; i < pts.length; i++) {
      sum += pts[i].value - pts[i - period].value;
      out.push({ time: pts[i].time, value: sum / period });
    }
    return out;
  };
  const slowK = smaOfPoints(fastK, smooth);
  const d = smaOfPoints(slowK, dPeriod);
  return { k: slowK, d };
}

export function atr(candles: OHLCVCandle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];
  const tr = (i: number) => {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  };
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr(i);
  let prev = sum / period;
  const out: IndicatorPoint[] = [{ time: candles[period].time, value: prev }];
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr(i)) / period;
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export interface AdxSeries {
  adx: IndicatorPoint[];
  plusDi: IndicatorPoint[];
  minusDi: IndicatorPoint[];
}

export function adx(candles: OHLCVCandle[], period = 14): AdxSeries {
  if (candles.length < 2 * period + 1) return { adx: [], plusDi: [], minusDi: [] };
  const tr = (i: number) => {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  };
  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    smTr += tr(i);
    smPlus += upMove > downMove && upMove > 0 ? upMove : 0;
    smMinus += downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const plusDi: IndicatorPoint[] = [];
  const minusDi: IndicatorPoint[] = [];
  const dxValues: number[] = [];
  const adxOut: IndicatorPoint[] = [];
  const emitDi = (i: number) => {
    const p = smTr === 0 ? 0 : (100 * smPlus) / smTr;
    const m = smTr === 0 ? 0 : (100 * smMinus) / smTr;
    plusDi.push({ time: candles[i].time, value: p });
    minusDi.push({ time: candles[i].time, value: m });
    const sum = p + m;
    dxValues.push(sum === 0 ? 0 : (100 * Math.abs(p - m)) / sum);
  };
  emitDi(period);
  for (let i = period + 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    smTr = smTr - smTr / period + tr(i);
    smPlus = smPlus - smPlus / period + plusDm;
    smMinus = smMinus - smMinus / period + minusDm;
    emitDi(i);
  }
  if (dxValues.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += dxValues[i];
    let prev = sum / period;
    adxOut.push({ time: candles[2 * period - 1].time, value: prev });
    for (let j = period; j < dxValues.length; j++) {
      prev = (prev * (period - 1) + dxValues[j]) / period;
      adxOut.push({ time: candles[period + j].time, value: prev });
    }
  }
  return { adx: adxOut, plusDi, minusDi };
}

export interface PivotLevel {
  label: string;
  price: number;
}

function candleDate(t: string | number): Date {
  return typeof t === "number" ? new Date(t * 1000) : new Date(t);
}

export function pivotPoints(
  candles: OHLCVCandle[],
  type: "classic" | "camarilla" = "classic",
): PivotLevel[] {
  if (candles.length < 2) return [];
  const firstMs = candleDate(candles[0].time).getTime();
  const lastMs = candleDate(candles[candles.length - 1].time).getTime();
  const barIntervalMs = (lastMs - firstMs) / (candles.length - 1);
  const intraday = barIntervalMs < 24 * 60 * 60 * 1000;

  const periodOf = (t: string | number) => {
    const d = candleDate(t);
    return intraday
      ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  };

  const current = periodOf(candles[candles.length - 1].time);
  let hi = -Infinity;
  let lo = Infinity;
  let close: number | null = null;
  let found: string | null = null;
  for (let i = candles.length - 1; i >= 0; i--) {
    const p = periodOf(candles[i].time);
    if (p === current) continue;
    if (found === null) found = p;
    else if (p !== found) break;
    if (candles[i].high > hi) hi = candles[i].high;
    if (candles[i].low < lo) lo = candles[i].low;
    if (close === null) close = candles[i].close;
  }
  if (found === null || close === null) return [];

  const c = close;
  const range = hi - lo;
  if (type === "classic") {
    const p = (hi + lo + c) / 3;
    return [
      { label: "P", price: p },
      { label: "R1", price: 2 * p - lo },
      { label: "S1", price: 2 * p - hi },
      { label: "R2", price: p + range },
      { label: "S2", price: p - range },
      { label: "R3", price: hi + 2 * (p - lo) },
      { label: "S3", price: lo - 2 * (hi - p) },
    ];
  }
  return [
    { label: "R4", price: c + (range * 1.1) / 2 },
    { label: "R3", price: c + (range * 1.1) / 4 },
    { label: "R2", price: c + (range * 1.1) / 6 },
    { label: "R1", price: c + (range * 1.1) / 12 },
    { label: "S1", price: c - (range * 1.1) / 12 },
    { label: "S2", price: c - (range * 1.1) / 6 },
    { label: "S3", price: c - (range * 1.1) / 4 },
    { label: "S4", price: c - (range * 1.1) / 2 },
  ];
}

// ─── Spec parser ──────────────────────────────────────────────────────────────
//
// `?indicators=sma:20,sma:50,ema:21,bb:20:2,rsi:14,macd:12:26:9,vwap,
//   stoch:14:3:3,atr:14,adx:14,pivots:classic`
// Colors/visibility are client rendering concerns and never appear here.
// Unknown or malformed entries are skipped, never an error.

const MAX_SPECS = 16;

export function computeIndicators(
  candles: OHLCVCandle[],
  spec: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const entries = spec.split(",").slice(0, MAX_SPECS);
  for (const entry of entries) {
    const parts = entry.trim().split(":");
    const name = parts[0];
    const num = (i: number, dflt: number) => {
      const v = Number(parts[i]);
      return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), 500) : dflt;
    };
    const key = entry.trim();
    if (key in out) continue;
    switch (name) {
      case "sma":
        out[key] = sma(candles, num(1, 20));
        break;
      case "ema":
        out[key] = ema(candles, num(1, 21));
        break;
      case "vwap":
        out[key] = vwap(candles);
        break;
      case "bb": {
        const sd = Number(parts[2]);
        out[key] = bollinger(
          candles,
          num(1, 20),
          Number.isFinite(sd) && sd > 0 ? Math.min(sd, 10) : 2.0,
        );
        break;
      }
      case "rsi":
        out[key] = rsi(candles, num(1, 14));
        break;
      case "macd":
        out[key] = macd(candles, num(1, 12), num(2, 26), num(3, 9));
        break;
      case "stoch":
        out[key] = stochastic(candles, num(1, 14), num(2, 3), num(3, 3));
        break;
      case "atr":
        out[key] = atr(candles, num(1, 14));
        break;
      case "adx":
        out[key] = adx(candles, num(1, 14));
        break;
      case "pivots":
        out[key] = pivotPoints(candles, parts[1] === "camarilla" ? "camarilla" : "classic");
        break;
      default:
        break; // unknown indicator — skip silently
    }
  }
  return out;
}
