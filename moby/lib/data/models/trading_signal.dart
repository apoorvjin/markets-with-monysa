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
