import 'dart:math' as math;
import '../data/models/candle.dart';

class IndicatorPoint {
  const IndicatorPoint(this.time, this.value);
  final DateTime time;
  final double value;
}

/// Simple moving average over `close` for `period` bars. Returns one
/// `IndicatorPoint` per candle starting at index `period - 1` (earlier indices
/// are skipped since the window isn't full yet).
List<IndicatorPoint> sma(List<Candle> candles, int period) {
  if (period <= 0 || candles.length < period) return const [];
  final out = <IndicatorPoint>[];
  double sum = 0;
  for (var i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  out.add(IndicatorPoint(candles[period - 1].time, sum / period));
  for (var i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    out.add(IndicatorPoint(candles[i].time, sum / period));
  }
  return out;
}

/// Exponential moving average over `close`. Returns one point per candle
/// starting at index `period - 1`. Seeded with the SMA of the first `period`
/// bars so the series matches conventional charting tools.
List<IndicatorPoint> ema(List<Candle> candles, int period) {
  if (period <= 0 || candles.length < period) return const [];
  final k = 2 / (period + 1);
  final out = <IndicatorPoint>[];
  double sum = 0;
  for (var i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  double prev = sum / period;
  out.add(IndicatorPoint(candles[period - 1].time, prev));
  for (var i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.add(IndicatorPoint(candles[i].time, prev));
  }
  return out;
}

/// EMA over an arbitrary numeric series (used by MACD's signal-line
/// computation, where the input is the MACD line itself rather than candles).
List<double> emaOfSeries(List<double> values, int period) {
  if (period <= 0 || values.length < period) return const [];
  final k = 2 / (period + 1);
  double sum = 0;
  for (var i = 0; i < period; i++) {
    sum += values[i];
  }
  final out = <double>[sum / period];
  for (var i = period; i < values.length; i++) {
    out.add(values[i] * k + out.last * (1 - k));
  }
  return out;
}

/// Volume-weighted average price. Cumulative typical-price × volume divided by
/// cumulative volume. Candles with null/zero volume are folded in without
/// contribution to the denominator.
List<IndicatorPoint> vwap(List<Candle> candles) {
  if (candles.isEmpty) return const [];
  final out = <IndicatorPoint>[];
  double cumPv = 0;
  double cumVol = 0;
  for (final c in candles) {
    final typical = (c.high + c.low + c.close) / 3;
    final v = c.volume ?? 0;
    cumPv += typical * v;
    cumVol += v;
    if (cumVol > 0) {
      out.add(IndicatorPoint(c.time, cumPv / cumVol));
    }
  }
  return out;
}

/// Anchored VWAP starting from the first candle whose time >= `anchor`.
/// Identical math to `vwap` but the cumulative window resets at the anchor.
List<IndicatorPoint> anchoredVwap(List<Candle> candles, DateTime anchor) {
  if (candles.isEmpty) return const [];
  final out = <IndicatorPoint>[];
  double cumPv = 0;
  double cumVol = 0;
  for (final c in candles) {
    if (c.time.isBefore(anchor)) continue;
    final typical = (c.high + c.low + c.close) / 3;
    final v = c.volume ?? 0;
    cumPv += typical * v;
    cumVol += v;
    if (cumVol > 0) {
      out.add(IndicatorPoint(c.time, cumPv / cumVol));
    }
  }
  return out;
}

class BollingerBands {
  const BollingerBands(this.upper, this.mid, this.lower);
  final List<IndicatorPoint> upper;
  final List<IndicatorPoint> mid;
  final List<IndicatorPoint> lower;
}

/// Bollinger Bands: middle = SMA(period), upper = mid + k*σ, lower = mid - k*σ,
/// where σ is the population standard deviation over the window. Matches the
/// TradingView default (population, not sample, stddev).
BollingerBands bollinger(List<Candle> candles,
    {int period = 20, double stddev = 2.0}) {
  if (candles.length < period) {
    return const BollingerBands([], [], []);
  }
  final upper = <IndicatorPoint>[];
  final mid = <IndicatorPoint>[];
  final lower = <IndicatorPoint>[];
  for (var i = period - 1; i < candles.length; i++) {
    double sum = 0;
    for (var k = i - period + 1; k <= i; k++) {
      sum += candles[k].close;
    }
    final m = sum / period;
    double variance = 0;
    for (var k = i - period + 1; k <= i; k++) {
      final d = candles[k].close - m;
      variance += d * d;
    }
    variance /= period;
    final sd = math.sqrt(variance);
    final t = candles[i].time;
    mid.add(IndicatorPoint(t, m));
    upper.add(IndicatorPoint(t, m + stddev * sd));
    lower.add(IndicatorPoint(t, m - stddev * sd));
  }
  return BollingerBands(upper, mid, lower);
}

/// Wilder's RSI. Standard textbook implementation: average gain/loss seeded
/// over the first `period` bars, then smoothed via Wilder's recursive
/// formula: avg = (prev_avg * (period - 1) + new) / period.
/// Returns one point per bar starting at index `period`.
List<IndicatorPoint> rsi(List<Candle> candles, {int period = 14}) {
  if (candles.length < period + 1) return const [];
  double avgGain = 0;
  double avgLoss = 0;
  for (var i = 1; i <= period; i++) {
    final d = candles[i].close - candles[i - 1].close;
    if (d > 0) {
      avgGain += d;
    } else {
      avgLoss += -d;
    }
  }
  avgGain /= period;
  avgLoss /= period;

  final out = <IndicatorPoint>[];
  double value(double g, double l) =>
      l == 0 ? 100 : 100 - 100 / (1 + g / l);
  out.add(IndicatorPoint(candles[period].time, value(avgGain, avgLoss)));

  for (var i = period + 1; i < candles.length; i++) {
    final d = candles[i].close - candles[i - 1].close;
    final gain = d > 0 ? d : 0.0;
    final loss = d < 0 ? -d : 0.0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.add(IndicatorPoint(candles[i].time, value(avgGain, avgLoss)));
  }
  return out;
}

class MacdSeries {
  const MacdSeries(this.macd, this.signal, this.histogram);
  final List<IndicatorPoint> macd;
  final List<IndicatorPoint> signal;
  final List<IndicatorPoint> histogram;
}

/// MACD = EMA(fast) − EMA(slow); signal = EMA(MACD, signalPeriod);
/// histogram = MACD − signal. Series are aligned to the candle that produced
/// each value (so the signal line starts at index `slow - 1 + signalPeriod - 1`).
MacdSeries macd(List<Candle> candles,
    {int fast = 12, int slow = 26, int signal = 9}) {
  if (candles.length < slow + signal) {
    return const MacdSeries([], [], []);
  }
  final fastArr = ema(candles, fast);
  final slowArr = ema(candles, slow);
  // Align: fast series starts at index `fast - 1`, slow at index `slow - 1`.
  // Difference of fast and slow at the same candle time:
  final offset = fastArr.length - slowArr.length;
  final macdPoints = <IndicatorPoint>[
    for (var i = 0; i < slowArr.length; i++)
      IndicatorPoint(slowArr[i].time, fastArr[i + offset].value - slowArr[i].value),
  ];
  final signalRaw =
      emaOfSeries(macdPoints.map((p) => p.value).toList(), signal);
  // signalRaw starts at macdPoints[signal - 1].
  final signalPoints = <IndicatorPoint>[
    for (var i = 0; i < signalRaw.length; i++)
      IndicatorPoint(macdPoints[i + signal - 1].time, signalRaw[i]),
  ];
  final histogram = <IndicatorPoint>[
    for (var i = 0; i < signalPoints.length; i++)
      IndicatorPoint(
          signalPoints[i].time,
          macdPoints[i + signal - 1].value - signalPoints[i].value),
  ];
  return MacdSeries(macdPoints, signalPoints, histogram);
}

class IchimokuLines {
  const IchimokuLines({
    required this.tenkan,
    required this.kijun,
    required this.senkouA,
    required this.senkouB,
    required this.chikou,
  });
  final List<IndicatorPoint> tenkan;
  final List<IndicatorPoint> kijun;
  /// Already projected forward by `displacement` bars (time stamps point at
  /// future candles synthesised by extending the last bar's interval).
  final List<IndicatorPoint> senkouA;
  final List<IndicatorPoint> senkouB;
  /// Already projected backward by `displacement` bars (close prices time-
  /// stamped with the bar from `displacement` positions earlier).
  final List<IndicatorPoint> chikou;
}

/// Computes (highest high + lowest low) / 2 over the previous `period`
/// candles ending at index `i` inclusive. Returns null when the window
/// isn't full.
double? _ichiMidpoint(List<Candle> candles, int i, int period) {
  if (i < period - 1) return null;
  var hi = -double.infinity;
  var lo = double.infinity;
  for (var k = i - period + 1; k <= i; k++) {
    if (candles[k].high > hi) hi = candles[k].high;
    if (candles[k].low < lo) lo = candles[k].low;
  }
  return (hi + lo) / 2;
}

/// Ichimoku Kinkō Hyō. Default periods (9, 26, 52) match the original
/// Hosoda specification.
IchimokuLines ichimoku(
  List<Candle> candles, {
  int tenkanPeriod = 9,
  int kijunPeriod = 26,
  int senkouBPeriod = 52,
  int displacement = 26,
}) {
  if (candles.length < senkouBPeriod) {
    return const IchimokuLines(
      tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [],
    );
  }
  final tenkan = <IndicatorPoint>[];
  final kijun = <IndicatorPoint>[];
  final senkouA = <IndicatorPoint>[];
  final senkouB = <IndicatorPoint>[];
  final chikou = <IndicatorPoint>[];

  // Average bar interval — used to project Senkou A/B `displacement` bars
  // forward beyond the last candle.
  final barIntervalMs = candles.length > 1
      ? (candles.last.time.millisecondsSinceEpoch -
              candles.first.time.millisecondsSinceEpoch) ~/
          (candles.length - 1)
      : Duration.millisecondsPerDay;

  for (var i = 0; i < candles.length; i++) {
    final t = candles[i].time;
    final tenkanV = _ichiMidpoint(candles, i, tenkanPeriod);
    final kijunV = _ichiMidpoint(candles, i, kijunPeriod);
    final senkouBV = _ichiMidpoint(candles, i, senkouBPeriod);
    if (tenkanV != null) tenkan.add(IndicatorPoint(t, tenkanV));
    if (kijunV != null) kijun.add(IndicatorPoint(t, kijunV));

    // Senkou A = (Tenkan + Kijun) / 2, projected `displacement` bars forward.
    if (tenkanV != null && kijunV != null) {
      final projT = DateTime.fromMillisecondsSinceEpoch(
        t.millisecondsSinceEpoch + displacement * barIntervalMs,
        isUtc: t.isUtc,
      );
      senkouA.add(IndicatorPoint(projT, (tenkanV + kijunV) / 2));
    }
    if (senkouBV != null) {
      final projT = DateTime.fromMillisecondsSinceEpoch(
        t.millisecondsSinceEpoch + displacement * barIntervalMs,
        isUtc: t.isUtc,
      );
      senkouB.add(IndicatorPoint(projT, senkouBV));
    }

    // Chikou = close[i] projected `displacement` bars backward.
    if (i - displacement >= 0) {
      chikou.add(IndicatorPoint(candles[i - displacement].time, candles[i].close));
    }
  }
  return IchimokuLines(
    tenkan: tenkan, kijun: kijun, senkouA: senkouA, senkouB: senkouB,
    chikou: chikou,
  );
}
