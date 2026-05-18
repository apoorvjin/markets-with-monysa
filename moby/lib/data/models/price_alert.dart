class PriceAlert {
  PriceAlert({
    required this.id,
    required this.symbol,
    required this.name,
    required this.targetPrice,
    required this.direction,
  });

  final String id;
  final String symbol;
  final String name;
  final double targetPrice;
  final String direction; // 'above' | 'below'

  Map<String, dynamic> toJson() => {
        'id': id,
        'symbol': symbol,
        'name': name,
        'targetPrice': targetPrice,
        'direction': direction,
      };

  factory PriceAlert.fromJson(Map<String, dynamic> j) => PriceAlert(
        id: j['id'] as String,
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        targetPrice: (j['targetPrice'] as num).toDouble(),
        direction: j['direction'] as String,
      );
}
