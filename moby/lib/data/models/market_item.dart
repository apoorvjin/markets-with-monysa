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
    this.sparkline,
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
  /// 1-month daily-close trend (see WORLD_INDICES/COMMODITIES/fetchSparklineBatch
  /// server-side) — indices and commodities only; null for forex, which doesn't fetch this.
  final List<double>? sparkline;

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
        sparkline: (j['sparkline'] as List?)
            ?.map((e) => (e as num).toDouble())
            .toList(),
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

// Not a COT category — CFTC has no jurisdiction outside US-regulated
// exchanges, so this is a different metric entirely (NSE cash-market
// FII/DII net buy/sell, in ₹ crores) kept in its own section rather than
// folded into CotMetal's long/short-contract shape.
class RegionalFlowItem {
  const RegionalFlowItem({
    required this.category,
    required this.label,
    required this.buyValue,
    required this.sellValue,
    required this.netValue,
    required this.netBias,
  });

  final String category;
  final String label;
  final double buyValue;
  final double sellValue;
  final double netValue;
  final String netBias;

  factory RegionalFlowItem.fromJson(Map<String, dynamic> j) => RegionalFlowItem(
        category: j['category'] as String,
        label: j['label'] as String,
        buyValue: (j['buyValue'] as num).toDouble(),
        sellValue: (j['sellValue'] as num).toDouble(),
        netValue: (j['netValue'] as num).toDouble(),
        netBias: j['netBias'] as String,
      );
}

class RegionalFlowGroup {
  const RegionalFlowGroup({
    required this.region,
    required this.flag,
    required this.market,
    required this.date,
    required this.unit,
    required this.items,
    this.source,
  });

  final String region;
  final String? flag;
  final String market;
  final String? date;
  final String unit;
  final List<RegionalFlowItem> items;
  final String? source;

  factory RegionalFlowGroup.fromJson(Map<String, dynamic> j) => RegionalFlowGroup(
        region: j['region'] as String,
        flag: j['flag'] as String?,
        market: j['market'] as String,
        date: j['date'] as String?,
        unit: j['unit'] as String,
        items: (j['items'] as List? ?? [])
            .map((e) => RegionalFlowItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        source: j['source'] as String?,
      );
}

class CotData {
  const CotData({
    required this.metals,
    required this.indicesRates,
    required this.currencies,
    required this.energy,
    required this.agriculture,
    required this.regionalFlows,
    this.reportDate,
  });

  final List<CotMetal> metals;
  final List<CotMetal> indicesRates;
  final List<CotMetal> currencies;
  final List<CotMetal> energy;
  final List<CotMetal> agriculture;
  final List<RegionalFlowGroup> regionalFlows;
  final String? reportDate;

  static List<CotMetal> _parseList(dynamic raw) =>
      (raw as List? ?? []).map((e) => CotMetal.fromJson(e as Map<String, dynamic>)).toList();

  factory CotData.fromJson(Map<String, dynamic> j) => CotData(
        metals: _parseList(j['metals']),
        indicesRates: _parseList(j['indicesRates']),
        currencies: _parseList(j['currencies']),
        energy: _parseList(j['energy']),
        agriculture: _parseList(j['agriculture']),
        regionalFlows: (j['regionalFlows'] as List? ?? [])
            .map((e) => RegionalFlowGroup.fromJson(e as Map<String, dynamic>))
            .toList(),
        reportDate: j['reportDate'] as String?,
      );
}
