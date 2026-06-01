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

  // Sentinel returned when the server rejects due to plan limits.
  // The UI checks for this value to show the upgrade sheet instead of an error.
  static const planLimitSentinel = '__plan_limit__';

  Future<String?> fetchAnalystNote(
    String symbol, {
    required String strategy,
    required String direction,
    required double confidence,
  }) async {
    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.tradingAnalystNote(symbol),
        params: {
          'strategy': strategy,
          'direction': direction,
          'confidence': confidence.toStringAsFixed(1),
        },
      ) as Map<String, dynamic>;
      return data['note'] as String?;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 429 || status == 403) return planLimitSentinel;
      rethrow;
    }
  }

  Future<List<TenXScanResult>> fetchTenXAssets() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXAssets)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXIndiaStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXIndiaStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2IndiaStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2IndiaStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXUKStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXUKStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2UKStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2UKStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXJapanStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXJapanStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2JapanStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2JapanStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXHKStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXHKStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2HKStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2HKStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXChinaStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXChinaStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2ChinaStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2ChinaStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXEuronextStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXEuronextStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2EuronextStocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2EuronextStocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2Assets() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2Assets)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TenXScanResult>> fetchTenXV2Stocks() async {
    final data = await ApiClient.instance.get(ApiEndpoints.tenXV2Stocks)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ScannerBacktestResponse> fetchScannerBacktest({
    required String type,
    required String version,
  }) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.tenXBacktest(type: type, version: version),
    ) as Map<String, dynamic>;
    return ScannerBacktestResponse.fromJson(data);
  }

  Future<BestSetupsResponse> fetchBestSetups({
    required String version,
    required String type,
  }) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.bestSetups(version: version, type: type),
    ) as Map<String, dynamic>;
    return BestSetupsResponse.fromJson(data);
  }

  Future<QuiverScanResponse> fetchQuiverCongress() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverCongress) as Map<String, dynamic>;
    return QuiverScanResponse.fromJson(data);
  }

  Future<QuiverScanResponse> fetchQuiverLobbying() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverLobbying) as Map<String, dynamic>;
    return QuiverScanResponse.fromJson(data);
  }

  Future<QuiverScanResponse> fetchQuiverInsider() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverInsider) as Map<String, dynamic>;
    return QuiverScanResponse.fromJson(data);
  }

  Future<CongressTradesResponse> fetchCongressTrades() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverCongressTrades) as Map<String, dynamic>;
    return CongressTradesResponse.fromJson(data);
  }

  Future<OgeTransactionsResponse> fetchTrumpTransactions() async {
    final data = await ApiClient.instance.get(ApiEndpoints.ogeTrumpTransactions) as Map<String, dynamic>;
    return OgeTransactionsResponse.fromJson(data);
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
