class QuoteItem {
  const QuoteItem({
    required this.symbol,
    required this.name,
    required this.category,
    this.flag = '',
    this.currency = 'USD',
    this.price,
    this.change,
    this.changePercent,
    this.preMarketPrice,
    this.preMarketChangePercent,
  });

  final String symbol;
  final String name;
  final String category;
  final String flag;
  final String currency;
  final double? price;
  final double? change;
  final double? changePercent;
  final double? preMarketPrice;
  final double? preMarketChangePercent;

  factory QuoteItem.fromJson(Map<String, dynamic> j) => QuoteItem(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        category: j['category'] as String,
        flag: j['flag'] as String? ?? '',
        currency: j['currency'] as String? ?? 'USD',
        price: (j['price'] as num?)?.toDouble(),
        change: (j['change'] as num?)?.toDouble(),
        changePercent: (j['changePercent'] as num?)?.toDouble(),
        preMarketPrice: (j['preMarketPrice'] as num?)?.toDouble(),
        preMarketChangePercent:
            (j['preMarketChangePercent'] as num?)?.toDouble(),
      );
}

class TradingSignal {
  const TradingSignal({
    required this.symbol,
    required this.direction,
    required this.confidence,
    required this.strategy,
    required this.entry,
    required this.stopLoss,
    required this.takeProfit,
    required this.riskReward,
    required this.riskPct,
    required this.reasoning,
    required this.timeframe,
    required this.indicators,
    required this.generatedAt,
    this.analystNote,
    this.ivPercentile,
    this.vwap,
    this.vwapDeviation,
    this.vixAtSignal,
    this.dynamicThreshold,
  });

  final String symbol;
  final String direction; // BUY | HOLD | SELL
  final double confidence;
  final String strategy;
  final double entry;
  final double stopLoss;
  final double takeProfit;
  final double riskReward;
  final double riskPct;
  final List<String> reasoning;
  final String timeframe;
  final Map<String, double?> indicators;
  final DateTime generatedAt;
  final String? analystNote;
  final double? ivPercentile;
  final double? vwap;
  final double? vwapDeviation;
  final double? vixAtSignal;
  final double? dynamicThreshold;

  factory TradingSignal.fromJson(Map<String, dynamic> j) => TradingSignal(
        symbol: j['symbol'] as String,
        direction: j['direction'] as String,
        confidence: (j['confidence'] as num).toDouble(),
        strategy: j['strategy'] as String,
        entry: (j['entry'] as num).toDouble(),
        stopLoss: (j['stopLoss'] as num).toDouble(),
        takeProfit: (j['takeProfit'] as num).toDouble(),
        riskReward: (j['riskReward'] as num).toDouble(),
        riskPct: (j['riskPct'] as num? ?? 0).toDouble(),
        reasoning: (j['reasoning'] as List).cast<String>(),
        timeframe: j['timeframe'] as String,
        indicators: (j['indicators'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, (v as num?)?.toDouble()),
        ),
        generatedAt: j['timestamp'] != null
            ? DateTime.parse(j['timestamp'] as String).toLocal()
            : DateTime.now(),
        analystNote: j['analystNote'] as String?,
        ivPercentile: (j['ivPercentile'] as num?)?.toDouble(),
        vwap: (j['vwap'] as num?)?.toDouble(),
        vwapDeviation: (j['vwapDeviation'] as num?)?.toDouble(),
        vixAtSignal: (j['vixAtSignal'] as num?)?.toDouble(),
        dynamicThreshold: (j['dynamicThreshold'] as num?)?.toDouble(),
      );
}

class SignalTracePair {
  const SignalTracePair({
    required this.baseId,
    required this.enhId,
    this.baseDir,
    this.enhDir,
  });

  final String baseId;   // "1"–"9"
  final String enhId;    // "10"–"18"
  final String? baseDir; // "BUY" | "SELL" | "HOLD" | null
  final String? enhDir;

  factory SignalTracePair.fromJson(Map<String, dynamic> j) {
    final base = j['base'] as Map<String, dynamic>?;
    final enh  = j['enhanced'] as Map<String, dynamic>?;
    return SignalTracePair(
      baseId:  j['baseId'] as String,
      enhId:   j['enhancedId'] as String,
      baseDir: base?['direction'] as String?,
      enhDir:  enh?['direction'] as String?,
    );
  }
}

class TradeRecord {
  const TradeRecord({
    required this.n,
    required this.direction,
    required this.entryPrice,
    required this.exitPrice,
    required this.returnPct,
    required this.win,
    this.date,
    this.stopLoss,
    this.takeProfit,
    this.exitReason,
    this.holdBars,
  });

  final int n;
  final String? date;           // YYYY-MM-DD
  final String direction;
  final double entryPrice;
  final double? stopLoss;
  final double? takeProfit;
  final double exitPrice;
  final String? exitReason;     // "SL" | "TP" | "TIMEOUT"
  final int? holdBars;
  final double returnPct;
  final bool win;

  factory TradeRecord.fromJson(Map<String, dynamic> j) => TradeRecord(
        n: (j['n'] as num).toInt(),
        date: j['date'] as String?,
        direction: j['direction'] as String,
        entryPrice: (j['entryPrice'] as num).toDouble(),
        stopLoss: (j['stopLoss'] as num?)?.toDouble(),
        takeProfit: (j['takeProfit'] as num?)?.toDouble(),
        exitPrice: (j['exitPrice'] as num).toDouble(),
        exitReason: j['exitReason'] as String?,
        holdBars: (j['holdBars'] as num?)?.toInt(),
        returnPct: (j['returnPct'] as num).toDouble(),
        win: j['win'] as bool,
      );
}

class BacktestResult {
  const BacktestResult({
    required this.strategy,
    required this.winRate,
    required this.totalReturn,
    required this.maxDrawdown,
    required this.sharpeRatio,
    required this.totalTrades,
    this.tradeLog = const [],
    this.backtestNote,
  });

  final String strategy;
  final double winRate;
  final double totalReturn;
  final double maxDrawdown;
  final double sharpeRatio;
  final int totalTrades;
  final List<TradeRecord> tradeLog;
  final String? backtestNote;

  factory BacktestResult.fromJson(Map<String, dynamic> j) => BacktestResult(
        strategy: j['strategy'] as String,
        winRate: (j['winRate'] as num).toDouble(),
        totalReturn: (j['totalReturn'] as num).toDouble(),
        maxDrawdown: (j['maxDrawdown'] as num).toDouble(),
        sharpeRatio: (j['sharpe'] as num).toDouble(),
        totalTrades: (j['trades'] as num).toInt(),
        tradeLog: (j['tradeLog'] as List? ?? [])
            .map((e) => TradeRecord.fromJson(e as Map<String, dynamic>))
            .toList(),
        backtestNote: j['backtestNote'] as String?,
      );
}

class NewsArticle {
  const NewsArticle({
    required this.title,
    required this.publisher,
    required this.url,
    this.publishedAt,
    this.sentiment,
  });

  final String title;
  final String publisher;
  final String url;
  final String? publishedAt;
  final double? sentiment;

  factory NewsArticle.fromJson(Map<String, dynamic> j) => NewsArticle(
        title: j['title'] as String,
        publisher: j['publisher'] as String,
        url: j['url'] as String? ?? '',
        publishedAt: j['publishedAt'] as String?,
        sentiment: (j['sentiment'] as num?)?.toDouble(),
      );
}

class NewsResult {
  const NewsResult({required this.articles, required this.aggregateSentiment});
  final List<NewsArticle> articles;
  final double aggregateSentiment;
}

class StockSearchResult {
  const StockSearchResult({
    required this.symbol,
    required this.name,
    this.exchange = '',
    this.type = 'EQUITY',
  });

  final String symbol;
  final String name;
  final String exchange;
  final String type;

  factory StockSearchResult.fromJson(Map<String, dynamic> j) =>
      StockSearchResult(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        exchange: j['exchange'] as String? ?? '',
        type: j['type'] as String? ?? 'EQUITY',
      );
}

class CrisisEvent {
  const CrisisEvent({
    required this.id,
    required this.name,
    required this.period,
    required this.vixPeak,
    required this.status,
    required this.outcome,
    required this.description,
  });

  final String id;
  final String name;
  final String period;
  final double vixPeak;
  // 'historical' | 'recent' | 'ongoing'
  final String status;
  final String outcome;
  final String description;

  factory CrisisEvent.fromJson(Map<String, dynamic> j) => CrisisEvent(
        id: j['id'] as String,
        name: j['name'] as String,
        period: j['period'] as String,
        vixPeak: (j['vixPeak'] as num).toDouble(),
        status: j['status'] as String,
        outcome: j['outcome'] as String,
        description: j['description'] as String,
      );
}

class TenXScanResult {
  const TenXScanResult({
    required this.symbol,
    required this.name,
    required this.flag,
    required this.category,
    required this.price,
    required this.changePercent,
    required this.volumeRatio,
    required this.volumeSpike,
    required this.volumeGreen,
    required this.heartbeat,
    required this.consolidationRangePct,
    required this.nearBreakout,
    required this.recordQuarter,
    required this.epsHistory,
    required this.epsApplicable,
    required this.trendUp,
    required this.signalsActive,
    this.thrust = false,
    this.base = false,
    this.uptrend = false,
    this.newHighReclaim = false,
    this.regimeBreakout = false,
  });

  final String symbol;
  final String name;
  final String flag;
  final String category;
  final double price;
  final double changePercent;
  final double volumeRatio;
  final bool volumeSpike;
  final bool volumeGreen;
  final bool heartbeat;
  final double consolidationRangePct;
  final bool nearBreakout;
  final bool recordQuarter;
  final List<double> epsHistory;
  final bool epsApplicable;
  final bool trendUp;
  final int signalsActive;

  // V3 "Super Pine" — Indices only; absent on v1/v2 responses
  final bool thrust;
  final bool base;
  final bool uptrend;
  final bool newHighReclaim;
  final bool regimeBreakout;

  factory TenXScanResult.fromJson(Map<String, dynamic> j) => TenXScanResult(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        flag: j['flag'] as String? ?? '',
        category: j['category'] is String ? j['category'] as String : (j['category']?.toString() ?? 'Stocks'),
        price: (j['price'] as num).toDouble(),
        changePercent: (j['changePercent'] as num).toDouble(),
        volumeRatio: (j['volumeRatio'] as num).toDouble(),
        volumeSpike: j['volumeSpike'] as bool? ?? false,
        volumeGreen: j['volumeGreen'] as bool? ?? false,
        heartbeat: j['heartbeat'] as bool? ?? false,
        consolidationRangePct: (j['consolidationRangePct'] as num).toDouble(),
        nearBreakout: j['nearBreakout'] as bool? ?? false,
        recordQuarter: j['recordQuarter'] as bool? ?? false,
        epsHistory: (j['epsHistory'] as List? ?? [])
            .map((e) => (e as num).toDouble())
            .toList(),
        epsApplicable: j['epsApplicable'] as bool? ?? false,
        trendUp: j['trendUp'] as bool? ?? false,
        signalsActive: (j['signalsActive'] as num).toInt(),
        thrust: j['thrust'] as bool? ?? false,
        base: j['base'] as bool? ?? false,
        uptrend: j['uptrend'] as bool? ?? false,
        newHighReclaim: j['newHighReclaim'] as bool? ?? false,
        regimeBreakout: j['regimeBreakout'] as bool? ?? false,
      );
}

class TenXSingleScanResult {
  const TenXSingleScanResult({
    required this.v1,
    required this.v2,
    required this.lastUpdated,
  });
  final TenXScanResult v1;
  final TenXScanResult v2;
  final String lastUpdated;

  factory TenXSingleScanResult.fromJson(Map<String, dynamic> j) =>
      TenXSingleScanResult(
        v1: TenXScanResult.fromJson(j['v1'] as Map<String, dynamic>),
        v2: TenXScanResult.fromJson(j['v2'] as Map<String, dynamic>),
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );
}

class BacktestForwardReturns {
  const BacktestForwardReturns({
    this.d5,
    this.d21,
    this.d63,
    this.d126,
    this.d252,
    this.d756,
  });

  final double? d5;
  final double? d21;
  final double? d63;
  final double? d126;
  final double? d252;
  final double? d756; // ~3 years; null for signals fired within last 3 years

  factory BacktestForwardReturns.fromJson(Map<String, dynamic> j) =>
      BacktestForwardReturns(
        d5: (j['d5'] as num?)?.toDouble(),
        d21: (j['d21'] as num?)?.toDouble(),
        d63: (j['d63'] as num?)?.toDouble(),
        d126: (j['d126'] as num?)?.toDouble(),
        d252: (j['d252'] as num?)?.toDouble(),
        d756: (j['d756'] as num?)?.toDouble(),
      );
}

class BacktestSignalEvent {
  const BacktestSignalEvent({
    required this.date,
    required this.signalCount,
    required this.volumeSpike,
    required this.heartbeat,
    required this.recordQuarter,
    required this.trendUp,
    required this.epsApplicable,
    required this.priceAtSignal,
    required this.returns,
  });

  final String date;
  final int signalCount;
  final bool volumeSpike;
  final bool heartbeat;
  final bool recordQuarter;
  final bool trendUp;
  final bool epsApplicable;
  final double priceAtSignal;
  final BacktestForwardReturns returns;

  factory BacktestSignalEvent.fromJson(Map<String, dynamic> j) =>
      BacktestSignalEvent(
        date: j['date'] as String,
        signalCount: (j['signalCount'] as num).toInt(),
        volumeSpike: j['volumeSpike'] as bool? ?? true,
        heartbeat: j['heartbeat'] as bool? ?? false,
        recordQuarter: j['recordQuarter'] as bool? ?? false,
        trendUp: j['trendUp'] as bool? ?? false,
        epsApplicable: j['epsApplicable'] as bool? ?? false,
        priceAtSignal: (j['priceAtSignal'] as num).toDouble(),
        returns: BacktestForwardReturns.fromJson(
            j['returns'] as Map<String, dynamic>),
      );
}

class BacktestSummaryStats {
  const BacktestSummaryStats({
    required this.events,
    required this.winRate1m,
    required this.winRate3m,
    required this.winRate6m,
    required this.winRate1y,
    required this.winRate3y,
    required this.avgReturn1m,
    required this.avgReturn3m,
    required this.avgReturn6m,
    required this.avgReturn3y,
    required this.sampleSize3y,
    this.byDayOfWeek,
    this.byVixBucket,
    this.winRateLower95,
    this.winRateUpper95,
  });

  final int events;
  final double winRate1m;
  final double winRate3m;
  final double winRate6m;
  final double winRate1y;
  final double winRate3y;
  final double avgReturn1m;
  final double avgReturn3m;
  final double avgReturn6m;
  final double avgReturn3y;
  final int sampleSize3y; // events with ≥3y of forward data available
  final Map<String, Map<String, dynamic>>? byDayOfWeek; // {"Mon": {events, winRate1m}}
  final Map<String, Map<String, dynamic>>? byVixBucket; // {"0-15": {events, winRate1m}}
  final double? winRateLower95;
  final double? winRateUpper95;

  factory BacktestSummaryStats.fromJson(Map<String, dynamic> j) =>
      BacktestSummaryStats(
        events: (j['events'] as num).toInt(),
        winRate1m: (j['winRate1m'] as num).toDouble(),
        winRate3m: (j['winRate3m'] as num).toDouble(),
        winRate6m: (j['winRate6m'] as num? ?? j['winRate3m'] as num).toDouble(),
        winRate1y: (j['winRate1y'] as num? ?? j['winRate3m'] as num).toDouble(),
        winRate3y: (j['winRate3y'] as num? ?? 0).toDouble(),
        avgReturn1m: (j['avgReturn1m'] as num).toDouble(),
        avgReturn3m: (j['avgReturn3m'] as num).toDouble(),
        avgReturn6m: (j['avgReturn6m'] as num).toDouble(),
        avgReturn3y: (j['avgReturn3y'] as num).toDouble(),
        sampleSize3y: (j['sampleSize3y'] as num).toInt(),
        byDayOfWeek: (j['byDayOfWeek'] as Map<String, dynamic>?)?.map(
          (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
        ),
        byVixBucket: (j['byVixBucket'] as Map<String, dynamic>?)?.map(
          (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
        ),
        winRateLower95: (j['winRateLower95'] as num?)?.toDouble(),
        winRateUpper95: (j['winRateUpper95'] as num?)?.toDouble(),
      );
}

class BacktestAssetResult {
  const BacktestAssetResult({
    required this.symbol,
    required this.name,
    required this.category,
    required this.flag,
    required this.totalEvents,
    required this.bySignalCount,
    required this.events,
  });

  final String symbol;
  final String name;
  final String category;
  final String flag;
  final int totalEvents;
  final Map<String, BacktestSummaryStats> bySignalCount;
  final List<BacktestSignalEvent> events;

  factory BacktestAssetResult.fromJson(Map<String, dynamic> j) =>
      BacktestAssetResult(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        category: j['category'] as String? ?? '',
        flag: j['flag'] as String? ?? '',
        totalEvents: (j['totalEvents'] as num).toInt(),
        bySignalCount: (j['bySignalCount'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(
              k, BacktestSummaryStats.fromJson(v as Map<String, dynamic>)),
        ),
        events: (j['events'] as List? ?? [])
            .map((e) =>
                BacktestSignalEvent.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ScannerBacktestResponse {
  const ScannerBacktestResponse({
    required this.version,
    required this.type,
    required this.fromDate,
    required this.toDate,
    required this.assets,
    required this.aggregate,
    required this.lastUpdated,
  });

  final String version;
  final String type;
  final String fromDate;
  final String toDate;
  final List<BacktestAssetResult> assets;
  final Map<String, BacktestSummaryStats> aggregate;
  final String lastUpdated;

  factory ScannerBacktestResponse.fromJson(Map<String, dynamic> j) =>
      ScannerBacktestResponse(
        version: j['version'] as String,
        type: j['type'] as String,
        fromDate: j['fromDate'] as String,
        toDate: j['toDate'] as String,
        assets: (j['assets'] as List)
            .map((e) =>
                BacktestAssetResult.fromJson(e as Map<String, dynamic>))
            .toList(),
        aggregate: ((j['aggregate'] as Map<String, dynamic>)['bySignalCount']
                as Map<String, dynamic>)
            .map((k, v) => MapEntry(
                k, BacktestSummaryStats.fromJson(v as Map<String, dynamic>))),
        lastUpdated: j['lastUpdated'] as String,
      );
}

class BestSetup {
  const BestSetup({
    required this.symbol,
    required this.name,
    required this.flag,
    required this.category,
    required this.signalsActive,
    required this.price,
    required this.changePercent,
    required this.volumeRatio,
    required this.winRate1m,
    required this.winRate3m,
    required this.winRate6m,
    required this.winRate1y,
    required this.winRate3y,
    required this.sampleSize3y,
    required this.avgReturn3m,
  });

  final String symbol;
  final String name;
  final String flag;
  final String category;
  final int signalsActive;
  final double price;
  final double changePercent;
  final double volumeRatio;
  final double winRate1m;
  final double winRate3m;
  final double winRate6m;
  final double winRate1y;
  final double winRate3y;
  final int sampleSize3y;
  final double avgReturn3m;

  factory BestSetup.fromJson(Map<String, dynamic> j) => BestSetup(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        flag: j['flag'] as String? ?? '',
        category: j['category'] as String? ?? '',
        signalsActive: (j['signalsActive'] as num).toInt(),
        price: (j['price'] as num).toDouble(),
        changePercent: (j['changePercent'] as num).toDouble(),
        volumeRatio: (j['volumeRatio'] as num).toDouble(),
        winRate1m: (j['winRate1m'] as num).toDouble(),
        winRate3m: (j['winRate3m'] as num).toDouble(),
        winRate6m: (j['winRate6m'] as num? ?? j['winRate3m'] as num).toDouble(),
        winRate1y: (j['winRate1y'] as num? ?? j['winRate3m'] as num).toDouble(),
        winRate3y: (j['winRate3y'] as num? ?? 0).toDouble(),
        sampleSize3y: (j['sampleSize3y'] as num? ?? 0).toInt(),
        avgReturn3m: (j['avgReturn3m'] as num).toDouble(),
      );
}

class BestSetupsResponse {
  const BestSetupsResponse({
    required this.setups,
    required this.cacheWarm,
    this.lastUpdated,
  });

  final List<BestSetup> setups;
  final bool cacheWarm;
  final String? lastUpdated;

  factory BestSetupsResponse.fromJson(Map<String, dynamic> j) =>
      BestSetupsResponse(
        setups: (j['setups'] as List? ?? [])
            .map((e) => BestSetup.fromJson(e as Map<String, dynamic>))
            .toList(),
        cacheWarm: j['cacheWarm'] as bool? ?? false,
        lastUpdated: j['lastUpdated'] as String?,
      );
}

// ── Sector Best Setups models ─────────────────────────────────────────────────

class SectorStockEntry {
  const SectorStockEntry({
    required this.symbol,
    required this.name,
    required this.price,
    required this.changePercent,
    required this.volumeRatio,
    required this.signalsActive,
    this.winRate1m,
  });

  final String symbol;
  final String name;
  final double price;
  final double changePercent;
  final double volumeRatio;
  final int signalsActive;
  final double? winRate1m;

  factory SectorStockEntry.fromJson(Map<String, dynamic> j) => SectorStockEntry(
        symbol: j['symbol'] as String,
        name: j['name'] as String,
        price: (j['price'] as num).toDouble(),
        changePercent: (j['changePercent'] as num).toDouble(),
        volumeRatio: (j['volumeRatio'] as num? ?? 0).toDouble(),
        signalsActive: (j['signalsActive'] as num).toInt(),
        winRate1m: (j['winRate1m'] as num?)?.toDouble(),
      );
}

class SectorBestSetupsGroup {
  const SectorBestSetupsGroup({
    required this.sector,
    required this.emoji,
    required this.stocks,
  });

  final String sector;
  final String emoji;
  final List<SectorStockEntry> stocks;

  factory SectorBestSetupsGroup.fromJson(Map<String, dynamic> j) =>
      SectorBestSetupsGroup(
        sector: j['sector'] as String,
        emoji: j['emoji'] as String? ?? '',
        stocks: (j['stocks'] as List? ?? [])
            .map((e) => SectorStockEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SectorBestSetupsResponse {
  const SectorBestSetupsResponse({
    required this.leading,
    required this.improving,
    required this.cacheWarm,
    this.lastUpdated,
  });

  final List<SectorBestSetupsGroup> leading;
  final List<SectorBestSetupsGroup> improving;
  final bool cacheWarm;
  final String? lastUpdated;

  factory SectorBestSetupsResponse.fromJson(Map<String, dynamic> j) =>
      SectorBestSetupsResponse(
        leading: (j['leading'] as List? ?? [])
            .map((e) => SectorBestSetupsGroup.fromJson(e as Map<String, dynamic>))
            .toList(),
        improving: (j['improving'] as List? ?? [])
            .map((e) => SectorBestSetupsGroup.fromJson(e as Map<String, dynamic>))
            .toList(),
        cacheWarm: j['cacheWarm'] as bool? ?? false,
        lastUpdated: j['lastUpdated'] as String?,
      );
}

const kCrisisDataAsOf = '';

const kCrisisEvents = [
  CrisisEvent(
    id: 'tariff-war-2025',
    name: 'US Tariff War',
    period: 'Apr 2025–Present',
    vixPeak: 52.3,
    status: 'ongoing',
    outcome: 'S&P -15% in 3 days, Gold +12%, USD volatile',
    description: 'Trump 145% tariffs on China, 90-day pause on others; global trade rerouting and supply chain repricing underway',
  ),
  CrisisEvent(
    id: 'middle-east-2024',
    name: 'Middle East Escalation',
    period: 'Oct 2023–Present',
    vixPeak: 23.1,
    status: 'ongoing',
    outcome: 'Oil +8%, Gold +18%, shipping costs +40%',
    description: 'Hamas attack, Israeli ground offensive, Houthi Red Sea disruptions and Iran-Israel direct exchanges raised regional risk premium',
  ),
  CrisisEvent(
    id: 'japan-carry-2024',
    name: 'Japan Carry Unwind',
    period: 'Aug 2024',
    vixPeak: 65.7,
    status: 'recent',
    outcome: 'Nikkei -12% in one day, USD/JPY -8%, S&P -6%',
    description: 'BoJ surprise rate hike unwound years of yen-funded carry trades in a single session — VIX briefly hit 65 intraday',
  ),
  CrisisEvent(
    id: 'banking-crisis-2023',
    name: 'US Banking Crisis',
    period: 'Mar 2023',
    vixPeak: 26.5,
    status: 'recent',
    outcome: 'Banks -30%, Gold +10%, 2Y Treasury -100bps in days',
    description: 'SVB, Signature, and First Republic collapsed; Fed launched BTFP to backstop \$620B in unrealised bond losses across the sector',
  ),
  CrisisEvent(
    id: 'ftx-collapse-2022',
    name: 'FTX Collapse',
    period: 'Nov 2022',
    vixPeak: 27.1,
    status: 'recent',
    outcome: 'BTC -24% in 3 days, Crypto sector -70% from ATH',
    description: 'FTX filed for bankruptcy with \$8B in missing customer funds; cascading contagion froze crypto lending markets',
  ),
  CrisisEvent(
    id: 'rate-shock-2022',
    name: 'Fed Rate Shock',
    period: '2022',
    vixPeak: 34.5,
    status: 'recent',
    outcome: 'S&P -25%, Bonds worst year since 1788, DXY +14%',
    description: 'Fastest Fed hiking cycle in 40 years (0 → 4.5% in 12 months) crushed both stock and bond portfolios simultaneously',
  ),
  CrisisEvent(
    id: 'ukraine-2022',
    name: 'Ukraine Invasion',
    period: 'Feb 2022',
    vixPeak: 38.9,
    status: 'recent',
    outcome: 'Oil +80%, Wheat +60%, EUR -15%',
    description: "Russia's full-scale invasion triggered commodity shock, European energy crisis, and fastest Western sanctions response in history",
  ),
  CrisisEvent(
    id: 'covid-2020',
    name: 'COVID-19 Crash',
    period: 'Mar 2020',
    vixPeak: 85.5,
    status: 'historical',
    outcome: 'S&P -34%, BTC -65% then +1000%, Gold +25%',
    description: '\$8T in global stimulus following pandemic lockdowns drove a historic recovery from the fastest bear market ever',
  ),
  CrisisEvent(
    id: 'china-crash-2015',
    name: 'China Stock Crash',
    period: 'Aug 2015',
    vixPeak: 53.3,
    status: 'historical',
    outcome: 'Shanghai -45%, EM currencies -20%, Oil -30%',
    description: "Chinese margin bubble burst and PBoC's surprise yuan devaluation sparked a global EM selloff and commodity rout",
  ),
  CrisisEvent(
    id: 'euro-crisis-2012',
    name: 'Euro Debt Crisis',
    period: '2010–2012',
    vixPeak: 48.2,
    status: 'historical',
    outcome: "EUR -25%, PIIGS bond yields spiked, ECB 'whatever it takes'",
    description: "Greece, Ireland, Portugal required bailouts; sovereign debt contagion threatened eurozone breakup until Draghi's July 2012 pledge",
  ),
  CrisisEvent(
    id: 'gfc-2008',
    name: 'Global Financial Crisis',
    period: '2008–2009',
    vixPeak: 89.5,
    status: 'historical',
    outcome: 'S&P -57%, Gold +25%, Oil -77% then +150%',
    description: 'Lehman Brothers collapse froze global credit markets and triggered the worst recession since the 1930s Great Depression',
  ),
  CrisisEvent(
    id: 'dotcom-2000',
    name: 'Dot-com Bust',
    period: '2000–2002',
    vixPeak: 42.7,
    status: 'historical',
    outcome: 'NASDAQ -78%, S&P -49%, Gold +15%',
    description: 'Tech bubble burst destroyed \$5T in market cap; 9/11 deepened the downturn and triggered a global recession',
  ),
  CrisisEvent(
    id: 'asian-crisis-1997',
    name: 'Asian Financial Crisis',
    period: '1997–1998',
    vixPeak: 45.7,
    status: 'historical',
    outcome: 'EM currencies -50–80%, Nikkei -35%, Gold -25%',
    description: 'Currency peg collapses swept Thailand, Indonesia and Korea; IMF bailouts with harsh austerity conditions reshaped EM debt markets',
  ),
  CrisisEvent(
    id: 'oil-crisis-1973',
    name: '1973 Oil Crisis',
    period: '1973–1974',
    vixPeak: 0,
    status: 'historical',
    outcome: 'S&P -48%, Oil +400%, Gold surged post-Bretton Woods',
    description: 'OPEC embargo following Yom Kippur War triggered stagflation, ended Bretton Woods, and permanently changed energy policy',
  ),
];

// ── Quiver Strategy Screener ───────────────────────────────────────────────────

class QuiverScanItem {
  const QuiverScanItem({
    required this.symbol,
    required this.name,
    required this.price,
    required this.changePercent,
    required this.weight,
    required this.rank,
    required this.badge,
    required this.badgeLabel,
    this.lobbyingGrowth,
  });

  final String symbol;
  final String name;
  final double? price;
  final double? changePercent;
  final double weight;
  final int rank;
  final String badge;      // "$3.4M" | "+42%" | "8 buys"
  final String badgeLabel; // "disclosed" | "QoQ spend" | "insiders"
  final String? lobbyingGrowth; // "+42%" QoQ when this ticker also tops the lobbying list

  factory QuiverScanItem.fromJson(Map<String, dynamic> j) => QuiverScanItem(
        symbol:        j['symbol'] as String,
        name:          j['name'] as String,
        price:         (j['price'] as num?)?.toDouble(),
        changePercent: (j['changePercent'] as num?)?.toDouble(),
        weight:        (j['weight'] as num).toDouble(),
        rank:          j['rank'] as int,
        badge:         j['badge'] as String,
        badgeLabel:    j['badgeLabel'] as String,
        lobbyingGrowth: j['lobbyingGrowth'] as String?,
      );
}

class QuiverScanResponse {
  const QuiverScanResponse({
    required this.items,
    required this.label,
    required this.rebalance,
    required this.lastUpdated,
  });

  final List<QuiverScanItem> items;
  final String label;
  final String rebalance;
  final String lastUpdated;

  factory QuiverScanResponse.fromJson(Map<String, dynamic> j) {
    final meta = j['meta'] as Map<String, dynamic>? ?? {};
    return QuiverScanResponse(
      items: (j['items'] as List)
          .map((e) => QuiverScanItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      label:       meta['label'] as String? ?? '',
      rebalance:   meta['rebalance'] as String? ?? '',
      lastUpdated: j['lastUpdated'] as String? ?? '',
    );
  }
}

// ── Congress Trade (raw individual STOCK Act disclosure) ──────────────────────

class CongressTrade {
  const CongressTrade({
    required this.memberName,
    required this.chamber,
    required this.ticker,
    required this.assetDescription,
    required this.type,
    required this.transactionDate,
    required this.filingDate,
    required this.amount,
    this.name,
    this.amountMidpoint,
    this.party,
    this.state,
    this.lobbyingGrowth,
  });

  final String memberName;
  final String chamber;         // "Senate" | "House"
  final String ticker;
  final String? name;           // Company name e.g. "NVIDIA Corp"
  final String assetDescription;
  final String type;            // "buy" | "sell"
  final String transactionDate; // YYYY-MM-DD
  final String filingDate;      // YYYY-MM-DD
  final String amount;          // STOCK Act range e.g. "$1,001 - $15,000"
  final double? amountMidpoint; // Numeric midpoint for sorting
  final String? party;          // "D" | "R" | "I"
  final String? state;          // "CA", "TX", etc.
  final String? lobbyingGrowth; // "+42%" QoQ when this ticker also tops the lobbying list

  String get displayName => name?.isNotEmpty == true ? name! : ticker;

  factory CongressTrade.fromJson(Map<String, dynamic> j) => CongressTrade(
        memberName:       j['memberName'] as String? ?? '',
        chamber:          j['chamber'] as String? ?? '',
        ticker:           j['ticker'] as String? ?? '',
        name:             j['name'] as String?,
        assetDescription: j['assetDescription'] as String? ?? '',
        type:             j['type'] as String? ?? 'buy',
        transactionDate:  j['transactionDate'] as String? ?? '',
        filingDate:       j['filingDate'] as String? ?? '',
        amount:           j['amount'] as String? ?? '',
        amountMidpoint:   (j['amountMidpoint'] as num?)?.toDouble(),
        party:            j['party'] as String?,
        state:            j['state'] as String?,
        lobbyingGrowth:   j['lobbyingGrowth'] as String?,
      );
}

class CongressTradesResponse {
  const CongressTradesResponse({
    required this.trades,
    required this.total,
    required this.lastUpdated,
  });

  final List<CongressTrade> trades;
  final int total;
  final String lastUpdated;

  factory CongressTradesResponse.fromJson(Map<String, dynamic> j) =>
      CongressTradesResponse(
        trades: (j['trades'] as List? ?? [])
            .map((e) => CongressTrade.fromJson(e as Map<String, dynamic>))
            .toList(),
        total:       (j['total'] as num?)?.toInt() ?? 0,
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );
}

// ── OGE Form 278-T Transaction (executive branch — President) ─────────────────

class OgeTransaction {
  const OgeTransaction({
    required this.description,
    required this.type,
    required this.date,
    required this.amount,
    required this.amountMidpoint,
    required this.filingDate,
    required this.source,
  });

  final String description;
  final String type;           // "purchase" | "sale" | "exchange"
  final String date;           // YYYY-MM-DD (best-effort from PDF)
  final String amount;         // "$100,001 - $250,000"
  final double amountMidpoint;
  final String filingDate;     // ISO date from OGE API
  final String source;         // PDF filename

  bool get isPurchase => type == 'purchase' || type == 'exchange';

  factory OgeTransaction.fromJson(Map<String, dynamic> j) => OgeTransaction(
        description:     j['description'] as String? ?? '',
        type:            j['type'] as String? ?? 'purchase',
        date:            j['date'] as String? ?? '',
        amount:          j['amount'] as String? ?? '',
        amountMidpoint:  (j['amountMidpoint'] as num?)?.toDouble() ?? 0,
        filingDate:      j['filingDate'] as String? ?? '',
        source:          j['source'] as String? ?? '',
      );
}

class OgeTransactionsResponse {
  const OgeTransactionsResponse({
    required this.transactions,
    required this.total,
    required this.lastUpdated,
    this.loading = false,
  });

  final List<OgeTransaction> transactions;
  final int total;
  final String lastUpdated;
  final bool loading; // true when server pipeline is still running

  factory OgeTransactionsResponse.fromJson(Map<String, dynamic> j) =>
      OgeTransactionsResponse(
        transactions: (j['transactions'] as List? ?? [])
            .map((e) => OgeTransaction.fromJson(e as Map<String, dynamic>))
            .toList(),
        total:       (j['total'] as num?)?.toInt() ?? 0,
        lastUpdated: j['lastUpdated'] as String? ?? '',
        loading:     j['loading'] as bool? ?? false,
      );
}

// ── Institutional Flow ────────────────────────────────────────────────────────

class InstitutionalFlowStock {
  const InstitutionalFlowStock({
    required this.symbol,
    required this.name,
    required this.price,
    required this.changePercent,
    required this.volumeRatio,
    this.vwapDeviation,
    this.obvSlopeRatio,
    this.periodChangePercent,
    this.shortPercentFloat,
    this.shortRatio,
    this.insiderCount,
    this.filingCount,
  });

  final String symbol;
  final String name;
  final double price;
  final double changePercent;
  final double volumeRatio;
  final double? vwapDeviation;
  final double? obvSlopeRatio;       // OBV 14-bar slope in days of avg volume
  final double? periodChangePercent; // 14-bar price change (obv type)
  final double? shortPercentFloat;   // % of float sold short (short type)
  final double? shortRatio;          // days to cover (short type)
  final int? insiderCount;           // distinct Form 4 filers (insider type)
  final int? filingCount;            // total Form 4 filings (insider type)

  factory InstitutionalFlowStock.fromJson(Map<String, dynamic> j) =>
      InstitutionalFlowStock(
        symbol:        j['symbol'] as String,
        name:          j['name'] as String,
        price:         (j['price'] as num).toDouble(),
        changePercent: (j['changePercent'] as num).toDouble(),
        volumeRatio:   (j['volumeRatio'] as num).toDouble(),
        vwapDeviation: (j['vwapDeviation'] as num?)?.toDouble(),
        obvSlopeRatio: (j['obvSlopeRatio'] as num?)?.toDouble(),
        periodChangePercent: (j['periodChangePercent'] as num?)?.toDouble(),
        shortPercentFloat:   (j['shortPercentFloat'] as num?)?.toDouble(),
        shortRatio:    (j['shortRatio'] as num?)?.toDouble(),
        insiderCount:  (j['insiderCount'] as num?)?.toInt(),
        filingCount:   (j['filingCount'] as num?)?.toInt(),
      );
}

class InstitutionalFlowResult {
  const InstitutionalFlowResult({
    required this.assets,
    required this.type,
    required this.lastUpdated,
  });

  final List<InstitutionalFlowStock> assets;
  final String type;
  final String lastUpdated;

  factory InstitutionalFlowResult.fromJson(Map<String, dynamic> j) =>
      InstitutionalFlowResult(
        assets: (j['assets'] as List? ?? [])
            .map((e) => InstitutionalFlowStock.fromJson(e as Map<String, dynamic>))
            .toList(),
        type:        j['type'] as String? ?? '',
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );
}
