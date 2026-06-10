import 'treemap_stock.dart';

class MoversData {
  final String index;
  final String session; // "pre" | "regular" | "post"
  final String marketState;
  final List<TreemapStock> gainers;
  final List<TreemapStock> losers;
  final DateTime lastUpdated;

  const MoversData({
    required this.index,
    required this.session,
    required this.marketState,
    required this.gainers,
    required this.losers,
    required this.lastUpdated,
  });

  factory MoversData.fromJson(Map<String, dynamic> json) => MoversData(
        index: json['index'] as String? ?? 'sp500',
        session: json['session'] as String? ?? 'regular',
        marketState: json['marketState'] as String? ?? 'REGULAR',
        gainers: ((json['gainers'] as List<dynamic>?) ?? const [])
            .map((e) => TreemapStock.fromJson(e as Map<String, dynamic>))
            .toList(),
        losers: ((json['losers'] as List<dynamic>?) ?? const [])
            .map((e) => TreemapStock.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated:
            DateTime.tryParse(json['lastUpdated'] as String? ?? '')?.toLocal() ??
                DateTime.now(),
      );
}
