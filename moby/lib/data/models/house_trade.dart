// ── Amount midpoints ──────────────────────────────────────────────────────────

const _amountMid = <String, double>{
  r'$1,001 - $15,000':            8000,
  r'$15,001 - $50,000':          32500,
  r'$50,001 - $100,000':         75000,
  r'$100,001 - $250,000':       175000,
  r'$250,001 - $500,000':       375000,
  r'$500,001 - $1,000,000':     750000,
  r'$1,000,001 - $5,000,000': 2500000,
  r'$5,000,001 - $25,000,000': 15000000,
  r'$25,000,001 - $50,000,000': 37500000,
};

double getAmountMid(String amount) => _amountMid[amount] ?? 0;

// ── Raw record from S3 ────────────────────────────────────────────────────────

class HouseTradeRecord {
  const HouseTradeRecord({
    required this.disclosureYear,
    required this.disclosureDate,
    required this.transactionDate,
    required this.owner,
    required this.ticker,
    required this.assetDescription,
    required this.type,
    required this.amount,
    required this.representative,
    required this.district,
    required this.state,
    required this.ptrLink,
    required this.capGainsOver200,
  });

  final int disclosureYear;
  final String disclosureDate;
  final String transactionDate;
  final String owner;
  final String ticker;
  final String assetDescription;
  final String type;
  final String amount;
  final String representative;
  final String district;
  final String state;
  final String ptrLink;
  final bool capGainsOver200;

  factory HouseTradeRecord.fromJson(Map<String, dynamic> j) => HouseTradeRecord(
        disclosureYear:   (j['disclosure_year'] as num?)?.toInt() ?? 0,
        disclosureDate:   j['disclosure_date'] as String? ?? '',
        transactionDate:  j['transaction_date'] as String? ?? '',
        owner:            j['owner'] as String? ?? '',
        ticker:           j['ticker'] as String? ?? '--',
        assetDescription: j['asset_description'] as String? ?? '',
        type:             j['type'] as String? ?? '',
        amount:           j['amount'] as String? ?? '',
        representative:   j['representative'] as String? ?? '',
        district:         j['district'] as String? ?? '',
        state:            j['state'] as String? ?? '',
        ptrLink:          j['ptr_link'] as String? ?? '',
        capGainsOver200:  j['cap_gains_over_200_usd'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'disclosure_year':      disclosureYear,
        'disclosure_date':      disclosureDate,
        'transaction_date':     transactionDate,
        'owner':                owner,
        'ticker':               ticker,
        'asset_description':    assetDescription,
        'type':                 type,
        'amount':               amount,
        'representative':       representative,
        'district':             district,
        'state':                state,
        'ptr_link':             ptrLink,
        'cap_gains_over_200_usd': capGainsOver200,
      };
}

// ── Enriched trade (computed once, stored in cache) ───────────────────────────

class EnrichedHouseTrade extends HouseTradeRecord {
  const EnrichedHouseTrade({
    required super.disclosureYear,
    required super.disclosureDate,
    required super.transactionDate,
    required super.owner,
    required super.ticker,
    required super.assetDescription,
    required super.type,
    required super.amount,
    required super.representative,
    required super.district,
    required super.state,
    required super.ptrLink,
    required super.capGainsOver200,
    required this.txDate,
    required this.discDate,
    required this.amountMid,
    required this.cleanTicker,
    required this.isBuy,
    required this.isSell,
  });

  final DateTime? txDate;
  final DateTime? discDate;
  final double amountMid;
  final String cleanTicker;
  final bool isBuy;
  final bool isSell;

  factory EnrichedHouseTrade.enrich(HouseTradeRecord r) {
    final clean = r.ticker.trim().toUpperCase();
    final ct = (clean == '--' || clean.isEmpty) ? '' : clean;
    final t = r.type.toLowerCase();
    return EnrichedHouseTrade(
      disclosureYear:   r.disclosureYear,
      disclosureDate:   r.disclosureDate,
      transactionDate:  r.transactionDate,
      owner:            r.owner,
      ticker:           r.ticker,
      assetDescription: r.assetDescription,
      type:             r.type,
      amount:           r.amount,
      representative:   r.representative,
      district:         r.district,
      state:            r.state,
      ptrLink:          r.ptrLink,
      capGainsOver200:  r.capGainsOver200,
      txDate:   _parseDate(r.transactionDate),
      discDate: _parseDate(r.disclosureDate),
      amountMid: getAmountMid(r.amount),
      cleanTicker: ct,
      isBuy:  t.contains('purchase'),
      isSell: t.contains('sale') || t.contains('sold'),
    );
  }

  factory EnrichedHouseTrade.fromJson(Map<String, dynamic> j) {
    final base = HouseTradeRecord.fromJson(j);
    final txDateStr  = j['_txDate'] as String?;
    final discDateStr = j['_discDate'] as String?;
    return EnrichedHouseTrade(
      disclosureYear:   base.disclosureYear,
      disclosureDate:   base.disclosureDate,
      transactionDate:  base.transactionDate,
      owner:            base.owner,
      ticker:           base.ticker,
      assetDescription: base.assetDescription,
      type:             base.type,
      amount:           base.amount,
      representative:   base.representative,
      district:         base.district,
      state:            base.state,
      ptrLink:          base.ptrLink,
      capGainsOver200:  base.capGainsOver200,
      txDate:    txDateStr != null ? DateTime.tryParse(txDateStr) : null,
      discDate:  discDateStr != null ? DateTime.tryParse(discDateStr) : null,
      amountMid: (j['_amountMid'] as num?)?.toDouble() ?? getAmountMid(base.amount),
      cleanTicker: j['_cleanTicker'] as String? ?? '',
      isBuy:  j['_isBuy']  as bool? ?? false,
      isSell: j['_isSell'] as bool? ?? false,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
        ...super.toJson(),
        '_txDate':     txDate?.toIso8601String(),
        '_discDate':   discDate?.toIso8601String(),
        '_amountMid':  amountMid,
        '_cleanTicker': cleanTicker,
        '_isBuy':      isBuy,
        '_isSell':     isSell,
      };
}

DateTime? _parseDate(String s) {
  if (s.isEmpty) return null;
  final src = s.length > 10 ? s.substring(0, 10) : s;
  // YYYY-MM-DD
  final iso = DateTime.tryParse(src);
  if (iso != null) return iso;
  // MM/DD/YYYY
  final parts = src.split('/');
  if (parts.length == 3) {
    final y = int.tryParse(parts[2]);
    final m = int.tryParse(parts[0]);
    final d = int.tryParse(parts[1]);
    if (y != null && m != null && d != null) {
      return DateTime.tryParse('$y-${m.toString().padLeft(2,'0')}-${d.toString().padLeft(2,'0')}');
    }
  }
  return null;
}

// ── Aggregation output types ──────────────────────────────────────────────────

class HouseTradesOverview {
  const HouseTradesOverview({
    required this.total,
    required this.buys,
    required this.sells,
    required this.buyRatio,
    required this.memberCount,
    required this.tickerCount,
    required this.estVolume,
    required this.earliest,
    required this.latest,
  });

  final int total;
  final int buys;
  final int sells;
  final double buyRatio;
  final int memberCount;
  final int tickerCount;
  final double estVolume;
  final DateTime? earliest;
  final DateTime? latest;
}

class TopTrader {
  const TopTrader({
    required this.name,
    required this.count,
    required this.buys,
    required this.sells,
    required this.estVolume,
  });

  final String name;
  final int count;
  final int buys;
  final int sells;
  final double estVolume;
}

class TopTicker {
  const TopTicker({
    required this.ticker,
    required this.count,
    required this.buys,
    required this.sells,
    required this.estVolume,
    required this.sentiment,
  });

  final String ticker;
  final int count;
  final int buys;
  final int sells;
  final double estVolume;
  final String sentiment; // 'BUY' | 'SELL' | 'FLAT'
}

// ── Repository result ─────────────────────────────────────────────────────────

class HouseTradesResult {
  const HouseTradesResult({
    required this.trades,
    this.lastFetch,
    this.staleError,
  });

  final List<EnrichedHouseTrade> trades;
  final DateTime? lastFetch;
  final String? staleError;
}

// ── Filter options ────────────────────────────────────────────────────────────

class HouseTradeFilter {
  const HouseTradeFilter({
    this.member = '',
    this.ticker = '',
    this.tradeType = '',
    this.days = 30,
  });

  final String member;
  final String ticker;
  final String tradeType; // '' | 'purchase' | 'sale' | 'exchange'
  final int days;

  HouseTradeFilter copyWith({
    String? member,
    String? ticker,
    String? tradeType,
    int? days,
  }) => HouseTradeFilter(
        member:    member    ?? this.member,
        ticker:    ticker    ?? this.ticker,
        tradeType: tradeType ?? this.tradeType,
        days:      days      ?? this.days,
      );
}

// ── Aggregation functions ─────────────────────────────────────────────────────

List<EnrichedHouseTrade> filterTrades(
    List<EnrichedHouseTrade> trades, HouseTradeFilter opts) {
  final now = DateTime.now();
  final cutoff = now.subtract(Duration(days: opts.days));
  final memberLower = opts.member.toLowerCase();
  final tickerUpper = opts.ticker.toUpperCase();
  final typeLower   = opts.tradeType.toLowerCase();

  return trades.where((t) {
    if (memberLower.isNotEmpty &&
        !t.representative.toLowerCase().contains(memberLower)) { return false; }
    if (tickerUpper.isNotEmpty && t.cleanTicker != tickerUpper) { return false; }
    if (typeLower.isNotEmpty) {
      if (typeLower == 'purchase' && !t.isBuy)  { return false; }
      if (typeLower == 'sale'     && !t.isSell) { return false; }
      if (typeLower == 'exchange' &&
          !t.type.toLowerCase().contains('exchange')) { return false; }
    }
    // Use txDate, fall back to discDate; only exclude if we know it's before the cutoff
    final effectiveDate = t.txDate ?? t.discDate;
    if (effectiveDate != null && effectiveDate.isBefore(cutoff)) return false;
    return true;
  }).toList();
}

HouseTradesOverview buildOverview(List<EnrichedHouseTrade> trades) {
  int buys = 0, sells = 0;
  double vol = 0;
  DateTime? earliest, latest;
  final members = <String>{};
  final tickers = <String>{};

  for (final t in trades) {
    if (t.isBuy) buys++;
    if (t.isSell) sells++;
    vol += t.amountMid;
    members.add(t.representative);
    if (t.cleanTicker.isNotEmpty) tickers.add(t.cleanTicker);
    if (t.txDate != null) {
      if (earliest == null || t.txDate!.isBefore(earliest)) earliest = t.txDate;
      if (latest   == null || t.txDate!.isAfter(latest))    latest   = t.txDate;
    }
  }

  return HouseTradesOverview(
    total:       trades.length,
    buys:        buys,
    sells:       sells,
    buyRatio:    sells == 0 ? double.infinity : buys / sells,
    memberCount: members.length,
    tickerCount: tickers.length,
    estVolume:   vol,
    earliest:    earliest,
    latest:      latest,
  );
}

List<TopTrader> buildTopTraders(List<EnrichedHouseTrade> trades, {int n = 15}) {
  final map = <String, (int count, int buys, int sells, double vol)>{};
  for (final t in trades) {
    final e = map[t.representative];
    if (e == null) {
      map[t.representative] = (1, t.isBuy ? 1 : 0, t.isSell ? 1 : 0, t.amountMid);
    } else {
      map[t.representative] = (
        e.$1 + 1,
        e.$2 + (t.isBuy ? 1 : 0),
        e.$3 + (t.isSell ? 1 : 0),
        e.$4 + t.amountMid,
      );
    }
  }
  final list = map.entries
      .map((e) => TopTrader(
            name:      e.key,
            count:     e.value.$1,
            buys:      e.value.$2,
            sells:     e.value.$3,
            estVolume: e.value.$4,
          ))
      .toList()
    ..sort((a, b) => b.count.compareTo(a.count));
  return list.take(n).toList();
}

List<TopTicker> buildTopTickers(List<EnrichedHouseTrade> trades, {int n = 20}) {
  final map = <String, (int count, int buys, int sells, double vol)>{};
  for (final t in trades) {
    if (t.cleanTicker.isEmpty) continue;
    final e = map[t.cleanTicker];
    if (e == null) {
      map[t.cleanTicker] = (1, t.isBuy ? 1 : 0, t.isSell ? 1 : 0, t.amountMid);
    } else {
      map[t.cleanTicker] = (
        e.$1 + 1,
        e.$2 + (t.isBuy ? 1 : 0),
        e.$3 + (t.isSell ? 1 : 0),
        e.$4 + t.amountMid,
      );
    }
  }
  final list = map.entries.map((e) {
    final buys  = e.value.$2;
    final sells = e.value.$3;
    final sentiment = buys > sells ? 'BUY' : sells > buys ? 'SELL' : 'FLAT';
    return TopTicker(
      ticker:    e.key,
      count:     e.value.$1,
      buys:      buys,
      sells:     sells,
      estVolume: e.value.$4,
      sentiment: sentiment,
    );
  }).toList()
    ..sort((a, b) => b.count.compareTo(a.count));
  return list.take(n).toList();
}

List<EnrichedHouseTrade> buildRecentTrades(
    List<EnrichedHouseTrade> trades, {int days = 30}) {
  final cutoff = DateTime.now().subtract(Duration(days: days));
  final result = trades
      .where((t) => t.txDate != null && t.txDate!.isAfter(cutoff))
      .toList()
    ..sort((a, b) {
      if (a.txDate == null && b.txDate == null) return 0;
      if (a.txDate == null) return 1;
      if (b.txDate == null) return -1;
      return b.txDate!.compareTo(a.txDate!);
    });
  return result;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

String fmtMoney(double n) {
  if (n >= 1000000000) return '\$${(n / 1000000000).toStringAsFixed(1)}B';
  if (n >= 1000000)    return '\$${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000)       return '\$${(n / 1000).round()}K';
  return '\$${n.toStringAsFixed(0)}';
}

String fmtDate(DateTime d) {
  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

String fmtMonth(DateTime d) {
  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  return '${months[d.month - 1]} ${d.year}';
}

String fmtAge(Duration elapsed) {
  final mins = elapsed.inMinutes;
  if (mins < 2)  return 'just now';
  if (mins < 60) return '${mins}m ago';
  final hrs = elapsed.inHours;
  if (hrs < 24)  return '${hrs}h ago';
  return '${elapsed.inDays}d ago';
}

String shortenAmountRange(String s) {
  if (s.isEmpty) return s;
  return s
      .replaceAllMapped(RegExp(r'\$(\d{1,3}(?:,\d{3})*)'), (m) {
        final n = int.tryParse(m.group(1)!.replaceAll(',', '')) ?? 0;
        if (n >= 1000000) return '\$${(n / 1000000).toStringAsFixed(n % 1000000 == 0 ? 0 : 1)}M';
        if (n >= 1000)    return '\$${n ~/ 1000}K';
        return m.group(0)!;
      })
      .replaceAll(' - ', '–');
}

