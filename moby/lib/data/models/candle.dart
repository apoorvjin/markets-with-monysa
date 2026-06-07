class Candle {
  const Candle({
    required this.time,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    this.volume,
  });

  final DateTime time;
  final double open;
  final double high;
  final double low;
  final double close;
  final double? volume;

  factory Candle.fromJson(Map<String, dynamic> j) => Candle(
        time: _parseTime(j['time']),
        open: (j['open'] as num).toDouble(),
        high: (j['high'] as num).toDouble(),
        low: (j['low'] as num).toDouble(),
        close: (j['close'] as num).toDouble(),
        volume: (j['volume'] as num?)?.toDouble(),
      );

  bool get isGreen => close >= open;

  static DateTime _parseTime(Object? raw) {
    if (raw is String) return DateTime.parse(raw).toUtc();
    if (raw is num) {
      return DateTime.fromMillisecondsSinceEpoch(raw.toInt() * 1000,
          isUtc: true);
    }
    throw FormatException('Candle.time: unexpected type ${raw.runtimeType}');
  }
}

class SupportResistanceLevel {
  const SupportResistanceLevel({
    required this.price,
    required this.type,
    required this.strength,
    required this.firstTouched,
    required this.lastTouched,
  });

  final double price;
  final SrType type;
  final int strength;
  final DateTime firstTouched;
  final DateTime lastTouched;

  factory SupportResistanceLevel.fromJson(Map<String, dynamic> j) =>
      SupportResistanceLevel(
        price: (j['price'] as num).toDouble(),
        type: (j['type'] as String) == 'support'
            ? SrType.support
            : SrType.resistance,
        strength: (j['strength'] as num).toInt(),
        firstTouched: DateTime.parse(j['firstTouched'] as String).toUtc(),
        lastTouched: DateTime.parse(j['lastTouched'] as String).toUtc(),
      );
}

enum SrType { support, resistance }

class ChartPayload {
  const ChartPayload({
    required this.candles,
    required this.levels,
    required this.lastUpdated,
  });

  final List<Candle> candles;
  final List<SupportResistanceLevel> levels;
  final DateTime lastUpdated;

  factory ChartPayload.fromJson(Map<String, dynamic> j) => ChartPayload(
        candles: (j['candles'] as List? ?? [])
            .map((e) => Candle.fromJson(e as Map<String, dynamic>))
            .toList(),
        levels: (j['levels'] as List? ?? [])
            .map((e) =>
                SupportResistanceLevel.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated: j['lastUpdated'] is String
            ? DateTime.parse(j['lastUpdated'] as String).toUtc()
            : DateTime.now().toUtc(),
      );
}
