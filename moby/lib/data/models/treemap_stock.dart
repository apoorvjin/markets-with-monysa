class TreemapStock {
  final String symbol;
  final String name;
  final String sector;
  final double marketCap;       // native-currency value (e.g. INR for Nifty 50)
  final double changePercent;
  final double price;
  final double? dayHigh;
  final double? dayLow;
  final double? fiftyTwoWeekHigh;
  final double? fiftyTwoWeekLow;
  final List<double>? sparkline;
  final double? preMarketPrice;
  final double? preMarketChangePercent;
  final double? postMarketPrice;
  final double? postMarketChangePercent;
  // FX normalisation (US-005)
  final String nativeCurrency;  // "USD" | "GBP" | "JPY" | "HKD" | "INR"
  final double? marketCapUsd;   // null only when non-USD + FX fetch failed
  final double? fxRateUsed;     // null for USD indices

  /// USD market cap when available; falls back to native for tile sizing.
  double get effectiveMarketCap => marketCapUsd ?? marketCap;

  const TreemapStock({
    required this.symbol,
    required this.name,
    required this.sector,
    required this.marketCap,
    required this.changePercent,
    required this.price,
    this.dayHigh,
    this.dayLow,
    this.fiftyTwoWeekHigh,
    this.fiftyTwoWeekLow,
    this.sparkline,
    this.preMarketPrice,
    this.preMarketChangePercent,
    this.postMarketPrice,
    this.postMarketChangePercent,
    this.nativeCurrency = 'USD',
    this.marketCapUsd,
    this.fxRateUsed,
  });

  factory TreemapStock.fromJson(Map<String, dynamic> json) {
    double? n(dynamic v) => v == null ? null : (v as num).toDouble();
    return TreemapStock(
      symbol: json['symbol'] as String,
      name: json['name'] as String,
      sector: json['sector'] as String,
      marketCap: (json['marketCap'] as num).toDouble(),
      changePercent: (json['changePercent'] as num).toDouble(),
      price: (json['price'] as num).toDouble(),
      dayHigh: n(json['dayHigh']),
      dayLow: n(json['dayLow']),
      fiftyTwoWeekHigh: n(json['fiftyTwoWeekHigh']),
      fiftyTwoWeekLow: n(json['fiftyTwoWeekLow']),
      sparkline: (json['sparkline'] as List<dynamic>?)
          ?.map((e) => (e as num).toDouble())
          .toList(),
      preMarketPrice: n(json['preMarketPrice']),
      preMarketChangePercent: n(json['preMarketChangePercent']),
      postMarketPrice: n(json['postMarketPrice']),
      postMarketChangePercent: n(json['postMarketChangePercent']),
      nativeCurrency: json['nativeCurrency'] as String? ?? 'USD',
      marketCapUsd: n(json['marketCapUsd']),
      fxRateUsed: n(json['fxRateUsed']),
    );
  }
}

class TreemapHeatmapData {
  final String index;
  final String timeframe;
  final int limit;
  final int total;
  final List<TreemapStock> stocks;
  final DateTime lastUpdated;
  final String? marketState;

  const TreemapHeatmapData({
    required this.index,
    required this.timeframe,
    required this.limit,
    required this.total,
    required this.stocks,
    required this.lastUpdated,
    required this.marketState,
  });

  factory TreemapHeatmapData.fromJson(Map<String, dynamic> json) =>
      TreemapHeatmapData(
        index: json['index'] as String? ?? 'sp500',
        timeframe: json['timeframe'] as String? ?? '1d',
        limit: (json['limit'] as num?)?.toInt() ?? 100,
        total: (json['total'] as num?)?.toInt() ?? 0,
        stocks: ((json['stocks'] as List<dynamic>?) ?? const [])
            .map((e) => TreemapStock.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated: DateTime.tryParse(json['lastUpdated'] as String? ?? '')
                ?.toLocal() ??
            DateTime.now(),
        marketState: json['marketState'] as String?,
      );

  bool get isLive => marketState == 'REGULAR';
  bool get isPreMarket => marketState == 'PRE';
  bool get isPostMarket => marketState == 'POST' || marketState == 'POSTPOST';
}
