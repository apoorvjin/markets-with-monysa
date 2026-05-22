class HeatmapTile {
  const HeatmapTile({
    required this.name,
    required this.emoji,
    this.symbol,
    this.category,
    this.changePercent,
    this.perf1W,
    this.perf1M,
    this.perf3M,
    this.perf6M,
    this.perf1Y,
  });

  final String name;
  final String emoji;
  final String? symbol;    // present on individual asset tiles only
  final String? category;  // "Commodities" | "Indices" | "Crypto" on asset tiles
  final double? changePercent;
  final double? perf1W;
  final double? perf1M;
  final double? perf3M;
  final double? perf6M;
  final double? perf1Y;

  factory HeatmapTile.fromJson(Map<String, dynamic> j) => HeatmapTile(
        name: j['name'] as String,
        emoji: j['emoji'] as String? ?? '',
        symbol: j['symbol'] as String?,
        category: j['category'] as String?,
        changePercent: (j['changePercent'] as num?)?.toDouble(),
        perf1W: (j['perf1W'] as num?)?.toDouble(),
        perf1M: (j['perf1M'] as num?)?.toDouble(),
        perf3M: (j['perf3M'] as num?)?.toDouble(),
        perf6M: (j['perf6M'] as num?)?.toDouble(),
        perf1Y: (j['perf1Y'] as num?)?.toDouble(),
      );
}

class HeatmapData {
  const HeatmapData({
    required this.regions,
    required this.assetClasses,
    required this.lastUpdated,
  });

  final List<HeatmapTile> regions;
  final List<HeatmapTile> assetClasses;
  final String lastUpdated;

  factory HeatmapData.fromJson(Map<String, dynamic> j) => HeatmapData(
        regions: (j['regions'] as List)
            .map((e) => HeatmapTile.fromJson(e as Map<String, dynamic>))
            .toList(),
        assetClasses: (j['assetClasses'] as List)
            .map((e) => HeatmapTile.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );
}
