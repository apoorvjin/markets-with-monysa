// Models for the new, additive "Adv Correlation" tab
// (GET /api/trading/correlation/advanced*). Separate from the plain
// correlation types embedded in correlation_tab.dart — that endpoint/tab
// is untouched.

class AdvCorrelationSymbol {
  const AdvCorrelationSymbol({
    required this.symbol,
    required this.name,
    required this.flag,
    required this.category,
  });

  final String symbol;
  final String name;
  final String flag;
  final String category;

  factory AdvCorrelationSymbol.fromJson(Map<String, dynamic> j) =>
      AdvCorrelationSymbol(
        symbol:   j['symbol'] as String? ?? '',
        name:     j['name'] as String? ?? '',
        flag:     j['flag'] as String? ?? '',
        category: j['category'] as String? ?? '',
      );
}

class AdvCorrelationData {
  const AdvCorrelationData({
    required this.symbols,
    required this.matrix,
    required this.window,
    required this.cacheWarm,
    required this.staleSymbols,
    required this.lastUpdated,
  });

  final List<AdvCorrelationSymbol> symbols;
  final List<List<double>> matrix;
  final String window;
  final bool cacheWarm;
  final List<String> staleSymbols;
  final String lastUpdated;

  factory AdvCorrelationData.fromJson(Map<String, dynamic> j) {
    final symbols = (j['symbols'] as List? ?? [])
        .map((e) => AdvCorrelationSymbol.fromJson(e as Map<String, dynamic>))
        .toList();
    final matrix = (j['matrix'] as List? ?? [])
        .map((row) => (row as List).map((v) => (v as num).toDouble()).toList())
        .toList();
    return AdvCorrelationData(
      symbols: symbols,
      matrix: matrix,
      window: j['window'] as String? ?? '3m',
      cacheWarm: j['cacheWarm'] as bool? ?? true,
      staleSymbols: (j['staleSymbols'] as List? ?? []).cast<String>(),
      lastUpdated: j['lastUpdated'] as String? ?? '',
    );
  }
}

class CorrelationHistoryPoint {
  const CorrelationHistoryPoint({required this.date, required this.r});
  final String date;
  final double r;

  factory CorrelationHistoryPoint.fromJson(Map<String, dynamic> j) =>
      CorrelationHistoryPoint(
        date: j['date'] as String? ?? '',
        r: (j['r'] as num?)?.toDouble() ?? 0,
      );
}

class CorrelationHistoryData {
  const CorrelationHistoryData({
    required this.symbolA,
    required this.symbolB,
    required this.points,
    required this.windowDays,
    required this.lastUpdated,
  });

  final String symbolA;
  final String symbolB;
  final List<CorrelationHistoryPoint> points;
  final int windowDays;
  final String lastUpdated;

  factory CorrelationHistoryData.fromJson(Map<String, dynamic> j) {
    final a = j['a'] as Map<String, dynamic>? ?? {};
    final b = j['b'] as Map<String, dynamic>? ?? {};
    return CorrelationHistoryData(
      symbolA: a['symbol'] as String? ?? '',
      symbolB: b['symbol'] as String? ?? '',
      points: (j['points'] as List? ?? [])
          .map((e) => CorrelationHistoryPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      windowDays: (j['windowDays'] as num?)?.toInt() ?? 30,
      lastUpdated: j['lastUpdated'] as String? ?? '',
    );
  }
}
