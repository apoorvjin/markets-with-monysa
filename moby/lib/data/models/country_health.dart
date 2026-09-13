class CountryHealthMetric {
  const CountryHealthMetric({
    required this.key,
    required this.label,
    required this.available,
    required this.value,
    required this.unit,
    required this.change3m,
    required this.change12m,
    required this.deviation10y,
    required this.tag,
    required this.asOf,
  });

  final String key;
  final String label;
  final bool available;
  final double? value;
  final String unit;
  final double? change3m;
  final double? change12m;
  final double? deviation10y;
  final String? tag;
  final String? asOf;

  factory CountryHealthMetric.fromJson(Map<String, dynamic> j) =>
      CountryHealthMetric(
        key: j['key'] as String,
        label: j['label'] as String,
        available: j['available'] as bool? ?? false,
        value: (j['value'] as num?)?.toDouble(),
        unit: j['unit'] as String? ?? '',
        change3m: (j['change3m'] as num?)?.toDouble(),
        change12m: (j['change12m'] as num?)?.toDouble(),
        deviation10y: (j['deviation10y'] as num?)?.toDouble(),
        tag: j['tag'] as String?,
        asOf: j['asOf'] as String?,
      );
}

/// A plain COUNT of stressed metrics (0-N), never a weighted score — see
/// server/lib/bis/bis-derive.ts's summarizeCountryHealthFlags comment.
class CountryHealthRanking {
  const CountryHealthRanking({
    required this.countryCode,
    required this.countryName,
    required this.flaggedCount,
    required this.availableCount,
  });

  final String countryCode;
  final String countryName;
  final int flaggedCount;
  final int availableCount;

  factory CountryHealthRanking.fromJson(Map<String, dynamic> j) =>
      CountryHealthRanking(
        countryCode: j['countryCode'] as String,
        countryName: j['countryName'] as String,
        flaggedCount: (j['flaggedCount'] as num).toInt(),
        availableCount: (j['availableCount'] as num).toInt(),
      );
}

class CountryHealthData {
  const CountryHealthData({
    required this.countryCode,
    required this.metrics,
    required this.lastUpdated,
  });

  final String countryCode;
  final List<CountryHealthMetric> metrics;
  final String lastUpdated;

  factory CountryHealthData.fromJson(Map<String, dynamic> j) =>
      CountryHealthData(
        countryCode: j['countryCode'] as String,
        metrics: (j['metrics'] as List)
            .map((m) => CountryHealthMetric.fromJson(m as Map<String, dynamic>))
            .toList(),
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );
}
