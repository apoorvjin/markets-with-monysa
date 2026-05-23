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
      );
}

class TradeRecord {
  const TradeRecord({
    required this.n,
    required this.direction,
    required this.entryPrice,
    required this.exitPrice,
    required this.returnPct,
    required this.win,
  });

  final int n;
  final String direction;
  final double entryPrice;
  final double exitPrice;
  final double returnPct;
  final bool win;

  factory TradeRecord.fromJson(Map<String, dynamic> j) => TradeRecord(
        n: (j['n'] as num).toInt(),
        direction: j['direction'] as String,
        entryPrice: (j['entryPrice'] as num).toDouble(),
        exitPrice: (j['exitPrice'] as num).toDouble(),
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

const kCrisisDataAsOf = 'May 2026';

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
