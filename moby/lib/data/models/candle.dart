class Candle {
  const Candle({
    required this.time,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    this.volume,
  });

  final int time; // Unix seconds
  final double open;
  final double high;
  final double low;
  final double close;
  final double? volume;

  factory Candle.fromJson(Map<String, dynamic> j) => Candle(
        time: (j['time'] as num).toInt(),
        open: (j['open'] as num).toDouble(),
        high: (j['high'] as num).toDouble(),
        low: (j['low'] as num).toDouble(),
        close: (j['close'] as num).toDouble(),
        volume: (j['volume'] as num?)?.toDouble(),
      );

  bool get isGreen => close >= open;
}
