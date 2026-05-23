class CbRateInfo {
  const CbRateInfo({required this.label, required this.rate});
  final String label;
  final double rate;
  factory CbRateInfo.fromJson(Map<String, dynamic> j) => CbRateInfo(
        label: j['label'] as String,
        rate: (j['rate'] as num).toDouble(),
      );
}

class MarketItem {
  const MarketItem({
    required this.symbol,
    required this.name,
    this.price,
    this.change,
    this.changePercent,
    this.currency,
    this.flag,
    this.region,
    this.category,
    this.unit,
    this.base,
    this.quote,
  });

  final String symbol;
  final String name;
  final double? price;
  final double? change;
  final double? changePercent;
  final String? currency;
  final String? flag;
  final String? region;
  final String? category;
  final String? unit;
  final String? base;
  final String? quote;

  factory MarketItem.fromJson(Map<String, dynamic> j) => MarketItem(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        price: (j['price'] as num?)?.toDouble(),
        change: (j['change'] as num?)?.toDouble(),
        changePercent: (j['changePercent'] as num?)?.toDouble(),
        currency: j['currency'] as String?,
        flag: j['flag'] as String?,
        region: j['region'] as String?,
        category: j['category'] as String?,
        unit: j['unit'] as String?,
        base: j['base'] as String?,
        quote: j['quote'] as String?,
      );
}

class CotMetal {
  const CotMetal({
    required this.name,
    required this.emoji,
    required this.symbol,
    required this.longContracts,
    required this.shortContracts,
    required this.netPosition,
    required this.longPct,
    required this.sentiment,
    this.weekNetChange,
    this.weekNetChangePct,
    this.reportDate,
    this.vsUsd = false,
    this.usdBias,
  });

  final String name;
  final String emoji;
  final String symbol;
  final int longContracts;
  final int shortContracts;
  final int netPosition;
  final double longPct;
  final String sentiment;
  final double? weekNetChange;
  final double? weekNetChangePct;
  final String? reportDate;
  final bool vsUsd;
  final String? usdBias;

  factory CotMetal.fromJson(Map<String, dynamic> j) => CotMetal(
        name: j['name'] as String,
        emoji: j['emoji'] as String? ?? '',
        symbol: j['symbol'] as String,
        longContracts: (j['longContracts'] as num).toInt(),
        shortContracts: (j['shortContracts'] as num).toInt(),
        netPosition: (j['netPosition'] as num).toInt(),
        longPct: (j['longPct'] as num).toDouble(),
        sentiment: j['sentiment'] as String,
        weekNetChange: (j['weekNetChange'] as num?)?.toDouble(),
        weekNetChangePct: (j['weekNetChangePct'] as num?)?.toDouble(),
        reportDate: j['reportDate'] as String?,
        vsUsd: j['vsUsd'] as bool? ?? false,
        usdBias: j['usdBias'] as String?,
      );
}

class CotData {
  const CotData({
    required this.metals,
    required this.indicesRates,
    required this.currencies,
    required this.energy,
    required this.agriculture,
    this.reportDate,
  });

  final List<CotMetal> metals;
  final List<CotMetal> indicesRates;
  final List<CotMetal> currencies;
  final List<CotMetal> energy;
  final List<CotMetal> agriculture;
  final String? reportDate;

  static List<CotMetal> _parseList(dynamic raw) =>
      (raw as List? ?? []).map((e) => CotMetal.fromJson(e as Map<String, dynamic>)).toList();

  factory CotData.fromJson(Map<String, dynamic> j) => CotData(
        metals: _parseList(j['metals']),
        indicesRates: _parseList(j['indicesRates']),
        currencies: _parseList(j['currencies']),
        energy: _parseList(j['energy']),
        agriculture: _parseList(j['agriculture']),
        reportDate: j['reportDate'] as String?,
      );
}
