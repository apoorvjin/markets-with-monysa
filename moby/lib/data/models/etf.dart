// ── ETF list ───────────────────────────────────────────────────────────────

class EtfItem {
  const EtfItem({
    required this.symbol,
    required this.name,
    required this.emoji,
    required this.category,
    this.risk,
    this.price,
    this.changePercent,
    this.preMarketPrice,
    this.preMarketChangePercent,
  });

  final String symbol;
  final String name;
  final String emoji;
  final String category;
  final String? risk;
  final double? price;
  final double? changePercent;
  final double? preMarketPrice;
  final double? preMarketChangePercent;

  bool get isLeveraged => risk == 'leveraged';

  factory EtfItem.fromJson(Map<String, dynamic> j) => EtfItem(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        emoji: j['emoji'] as String? ?? '',
        category: j['category'] as String? ?? '',
        risk: j['risk'] as String?,
        price: (j['price'] as num?)?.toDouble(),
        changePercent: (j['changePercent'] as num?)?.toDouble(),
        preMarketPrice: (j['preMarketPrice'] as num?)?.toDouble(),
        preMarketChangePercent: (j['preMarketChangePercent'] as num?)?.toDouble(),
      );
}

class EtfListData {
  const EtfListData({required this.category, required this.items, this.lastUpdated});

  final String category;
  final List<EtfItem> items;
  final DateTime? lastUpdated;

  factory EtfListData.fromJson(Map<String, dynamic> j) => EtfListData(
        category: j['category'] as String? ?? 'all',
        items: (j['items'] as List<dynamic>? ?? [])
            .map((e) => EtfItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated: j['lastUpdated'] != null
            ? DateTime.tryParse(j['lastUpdated'] as String)
            : null,
      );
}

// ── Fund profile (holdings, sector weights, expense ratio, AUM) ────────────

class EtfHolding {
  const EtfHolding({this.symbol, this.name, this.weightPct});

  final String? symbol;
  final String? name;
  final double? weightPct;

  factory EtfHolding.fromJson(Map<String, dynamic> j) => EtfHolding(
        symbol: j['symbol'] as String?,
        name: j['name'] as String?,
        weightPct: (j['weightPct'] as num?)?.toDouble(),
      );
}

class EtfSectorWeighting {
  const EtfSectorWeighting({required this.sector, this.weightPct});

  final String sector;
  final double? weightPct;

  factory EtfSectorWeighting.fromJson(Map<String, dynamic> j) => EtfSectorWeighting(
        sector: j['sector'] as String? ?? '',
        weightPct: (j['weightPct'] as num?)?.toDouble(),
      );
}

class EtfProfile {
  const EtfProfile({
    required this.symbol,
    this.expenseRatio,
    this.aum,
    this.family,
    required this.holdings,
    required this.sectorWeightings,
  });

  final String symbol;
  final double? expenseRatio;
  final double? aum;
  final String? family;
  final List<EtfHolding> holdings;
  final List<EtfSectorWeighting> sectorWeightings;

  factory EtfProfile.fromJson(Map<String, dynamic> j) => EtfProfile(
        symbol: j['symbol'] as String,
        expenseRatio: (j['expenseRatio'] as num?)?.toDouble(),
        aum: (j['aum'] as num?)?.toDouble(),
        family: j['family'] as String?,
        holdings: (j['holdings'] as List<dynamic>? ?? [])
            .map((e) => EtfHolding.fromJson(e as Map<String, dynamic>))
            .toList(),
        sectorWeightings: (j['sectorWeightings'] as List<dynamic>? ?? [])
            .map((e) => EtfSectorWeighting.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ── Rotation / RRG ───────────────────────────────────────────────────────────

class EtfRotationItem {
  const EtfRotationItem({
    required this.symbol,
    required this.name,
    required this.emoji,
    this.category,
    this.rsRatio,
    this.rsMomentum,
    this.quadrant,
  });

  final String symbol;
  final String name;
  final String emoji;
  final String? category;
  final double? rsRatio;
  final double? rsMomentum;
  final String? quadrant; // Leading | Improving | Weakening | Lagging

  factory EtfRotationItem.fromJson(Map<String, dynamic> j) => EtfRotationItem(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        emoji: j['emoji'] as String? ?? '',
        category: j['category'] as String?,
        rsRatio: (j['rsRatio'] as num?)?.toDouble(),
        rsMomentum: (j['rsMomentum'] as num?)?.toDouble(),
        quadrant: j['quadrant'] as String?,
      );
}

class EtfRotationData {
  const EtfRotationData({required this.items, this.lastUpdated});

  final List<EtfRotationItem> items;
  final DateTime? lastUpdated;

  factory EtfRotationData.fromJson(Map<String, dynamic> j) => EtfRotationData(
        items: (j['items'] as List<dynamic>? ?? [])
            .map((e) => EtfRotationItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastUpdated: j['lastUpdated'] != null
            ? DateTime.tryParse(j['lastUpdated'] as String)
            : null,
      );
}
