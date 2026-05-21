import 'package:dio/dio.dart';
import '../models/trading_signal.dart';
import '../models/candle.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class TradingRepository {
  const TradingRepository();

  static const TradingRepository instance = TradingRepository();

  Future<List<QuoteItem>> fetchQuotes() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingQuotes);
    final quotes = data['quotes'] as List;
    return quotes.map((e) => QuoteItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<TradingSignal> fetchSignal(
    String symbol, {
    String timeframe = '1d',
    String strategy = '1',
    CancelToken? cancelToken,
  }) async {
    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.tradingSignal(symbol),
        params: {'timeframe': timeframe, 'strategy': strategy},
        cancelToken: cancelToken,
      );
      return TradingSignal.fromJson(data as Map<String, dynamic>);
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) {
        throw Exception(body['error'] as String);
      }
      rethrow;
    }
  }

  Future<List<Candle>> fetchHistory(String symbol, {String timeframe = '1d'}) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.tradingHistory(symbol),
      params: {'timeframe': timeframe},
    );
    final candles = data['candles'] as List? ?? data as List;
    return candles.map((e) => Candle.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<BacktestResult>> fetchBacktest(String symbol) async {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingBacktest(symbol)) as Map<String, dynamic>;
    // Server returns { symbol, timeframe, strategies: { "1": {...}, ... }, backtestNotes: { "3": "...", "6": "..." }, timestamp }
    final strategies = data['strategies'] as Map<String, dynamic>;
    final notes = (data['backtestNotes'] as Map<String, dynamic>?) ?? {};
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9']
        .where((k) => strategies.containsKey(k))
        .map((k) => BacktestResult.fromJson({
              ...(strategies[k] as Map<String, dynamic>),
              'strategy': 'S$k',
              if (notes.containsKey(k)) 'backtestNote': notes[k],
            }))
        .toList();
  }

  Future<List<NewsArticle>> fetchNews(String symbol) async {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingNews(symbol));
    final articles = data['articles'] as List;
    return articles.map((e) => NewsArticle.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<String?> fetchAnalystNote(
    String symbol, {
    required String strategy,
    required String direction,
    required double confidence,
  }) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.tradingAnalystNote(symbol),
      params: {
        'strategy': strategy,
        'direction': direction,
        'confidence': confidence.toStringAsFixed(1),
      },
    ) as Map<String, dynamic>;
    return data['note'] as String?;
  }

  Future<List<StockSearchResult>> searchStocks(String query) async {
    if (query.trim().isEmpty) return [];
    final data = await ApiClient.instance.get(
      ApiEndpoints.stockSearch,
      params: {'q': query.trim(), 'limit': '15'},
    ) as Map<String, dynamic>;
    final results = data['results'] as List;
    return results
        .map((e) => StockSearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
