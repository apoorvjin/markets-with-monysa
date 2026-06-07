import 'package:dio/dio.dart';
import '../models/trading_signal.dart';
import '../models/candle.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class _ScannerCacheEntry {
  _ScannerCacheEntry(this.data) : _cachedAt = DateTime.now();
  final List<TenXScanResult> data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inMinutes < 30;
}

class _BestSetupsEntry {
  _BestSetupsEntry(this.data) : _cachedAt = DateTime.now();
  final BestSetupsResponse data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inMinutes < 30;
}

class _BestSectorEntry {
  _BestSectorEntry(this.data) : _cachedAt = DateTime.now();
  final SectorBestSetupsResponse data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inMinutes < 30;
}

class TradingRepository {
  const TradingRepository();

  static const TradingRepository instance = TradingRepository();

  // Cache keyed by "$country-$version" (e.g. "us-v1", "india-v2").
  static final _scannerCache = <String, _ScannerCacheEntry>{};
  // Deduplicates concurrent requests for the same key so pre-warming and the
  // active provider share a single in-flight HTTP request instead of doubling up.
  static final _inFlight = <String, Future<List<TenXScanResult>>>{};

  // Best-setups cache — keyed by "$version-$type" (e.g. "v1-assets").
  // Only caches warm responses; cacheWarm:false is never stored so the next
  // request goes to the network and picks up the server result once it's ready.
  static final _bestSetupsCache = <String, _BestSetupsEntry>{};
  static final _bestSetupsInFlight = <String, Future<BestSetupsResponse>>{};

  // Sector best-setups cache — keyed by version (e.g. "v1").
  static final _bestSectorCache = <String, _BestSectorEntry>{};
  static final _bestSectorInFlight =
      <String, Future<SectorBestSetupsResponse>>{};

  Future<List<TenXScanResult>> _cachedFetch(
      String cacheKey, String endpoint) {
    final entry = _scannerCache[cacheKey];
    if (entry != null && entry.isValid) return Future.value(entry.data);
    if (_inFlight.containsKey(cacheKey)) return _inFlight[cacheKey]!;

    final future = ApiClient.instance
        .get(endpoint)
        .then((raw) {
          final results = ((raw as Map<String, dynamic>)['assets'] as List)
              .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
              .toList();
          _scannerCache[cacheKey] = _ScannerCacheEntry(results);
          _inFlight.remove(cacheKey);
          return results;
        })
        .catchError((Object e) {
          _inFlight.remove(cacheKey);
          throw e;
        });
    _inFlight[cacheKey] = future;
    return future;
  }

  void clearScannerCache(String cacheKey) => _scannerCache.remove(cacheKey);

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

  /// Fetches OHLCV (and optionally S/R levels) for the chart screen.
  ///
  /// The renderer choice flows over the wire via `X-Chart-Renderer` (stamped by
  /// `ChartRendererInterceptor`); the server branches its payload shape on
  /// that. This method is renderer-agnostic — `levels` is empty for the
  /// WebView renderers and populated for in-house.
  Future<ChartPayload> fetchChart(String symbol, {String range = '3mo'}) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.chart(symbol),
      params: {'range': range},
    ) as Map<String, dynamic>;
    return ChartPayload.fromJson(data);
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

  Future<List<TenXScanResult>> fetchTenXAssets() =>
      _cachedFetch('assets-v1', ApiEndpoints.tenXAssets);

  Future<List<TenXScanResult>> fetchTenXStocks() =>
      _cachedFetch('us-v1', ApiEndpoints.tenXStocks);

  Future<List<TenXScanResult>> fetchTenXIndiaStocks() =>
      _cachedFetch('india-v1', ApiEndpoints.tenXIndiaStocks);

  Future<List<TenXScanResult>> fetchTenXV2IndiaStocks() =>
      _cachedFetch('india-v2', ApiEndpoints.tenXV2IndiaStocks);

  Future<List<TenXScanResult>> fetchTenXUKStocks() =>
      _cachedFetch('uk-v1', ApiEndpoints.tenXUKStocks);

  Future<List<TenXScanResult>> fetchTenXV2UKStocks() =>
      _cachedFetch('uk-v2', ApiEndpoints.tenXV2UKStocks);

  Future<List<TenXScanResult>> fetchTenXJapanStocks() =>
      _cachedFetch('japan-v1', ApiEndpoints.tenXJapanStocks);

  Future<List<TenXScanResult>> fetchTenXV2JapanStocks() =>
      _cachedFetch('japan-v2', ApiEndpoints.tenXV2JapanStocks);

  Future<List<TenXScanResult>> fetchTenXHKStocks() =>
      _cachedFetch('hongkong-v1', ApiEndpoints.tenXHKStocks);

  Future<List<TenXScanResult>> fetchTenXV2HKStocks() =>
      _cachedFetch('hongkong-v2', ApiEndpoints.tenXV2HKStocks);

  Future<List<TenXScanResult>> fetchTenXChinaStocks() =>
      _cachedFetch('china-v1', ApiEndpoints.tenXChinaStocks);

  Future<List<TenXScanResult>> fetchTenXV2ChinaStocks() =>
      _cachedFetch('china-v2', ApiEndpoints.tenXV2ChinaStocks);

  Future<List<TenXScanResult>> fetchTenXEuronextStocks() =>
      _cachedFetch('euronext-v1', ApiEndpoints.tenXEuronextStocks);

  Future<List<TenXScanResult>> fetchTenXV2EuronextStocks() =>
      _cachedFetch('euronext-v2', ApiEndpoints.tenXV2EuronextStocks);

  Future<List<TenXScanResult>> fetchTenXV3Assets() =>
      _cachedFetch('assets-v3', ApiEndpoints.tenXV3Assets);

  Future<List<TenXScanResult>> fetchTenXV3CommoditiesAssets() =>
      _cachedFetch('commodities-v3', ApiEndpoints.tenXV3CommoditiesAssets);

  Future<List<TenXScanResult>> fetchTenXV3ForexAssets() =>
      _cachedFetch('forex-v3', ApiEndpoints.tenXV3ForexAssets);

  Future<List<TenXScanResult>> fetchTenXV3CryptoAssets() =>
      _cachedFetch('crypto-v3', ApiEndpoints.tenXV3CryptoAssets);

  Future<List<TenXScanResult>> fetchTenXV2Assets() =>
      _cachedFetch('assets-v2', ApiEndpoints.tenXV2Assets);

  Future<List<TenXScanResult>> fetchTenXV2Stocks() =>
      _cachedFetch('us-v2', ApiEndpoints.tenXV2Stocks);

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
  }) {
    final key = '$version-$type';
    final entry = _bestSetupsCache[key];
    if (entry != null && entry.isValid) return Future.value(entry.data);
    if (_bestSetupsInFlight.containsKey(key)) return _bestSetupsInFlight[key]!;

    final future = ApiClient.instance
        .get(ApiEndpoints.bestSetups(version: version, type: type))
        .then((raw) {
          final resp =
              BestSetupsResponse.fromJson(raw as Map<String, dynamic>);
          // Only cache warm responses — a cold-cache miss must not be locked in
          // for 30 min or the user would never see real data without restarting.
          if (resp.cacheWarm) _bestSetupsCache[key] = _BestSetupsEntry(resp);
          _bestSetupsInFlight.remove(key);
          return resp;
        })
        .catchError((Object e) {
          _bestSetupsInFlight.remove(key);
          throw e;
        });
    _bestSetupsInFlight[key] = future;
    return future;
  }

  void clearBestSetupsCache(String key) => _bestSetupsCache.remove(key);

  Future<SectorBestSetupsResponse> fetchSectorBestSetups({
    required String version,
  }) {
    final key = version;
    final entry = _bestSectorCache[key];
    if (entry != null && entry.isValid) return Future.value(entry.data);
    if (_bestSectorInFlight.containsKey(key)) return _bestSectorInFlight[key]!;

    final future = ApiClient.instance
        .get(ApiEndpoints.bestSetupsSector(version: version))
        .then((raw) {
          final resp =
              SectorBestSetupsResponse.fromJson(raw as Map<String, dynamic>);
          if (resp.cacheWarm) _bestSectorCache[key] = _BestSectorEntry(resp);
          _bestSectorInFlight.remove(key);
          return resp;
        })
        .catchError((Object e) {
          _bestSectorInFlight.remove(key);
          throw e;
        });
    _bestSectorInFlight[key] = future;
    return future;
  }

  void clearBestSectorCache(String key) => _bestSectorCache.remove(key);

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

  Future<TenXSingleScanResult> fetchTenXSingleScan({
    required String symbol,
    String? name,
  }) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.tenXSingleScan(symbol: symbol, name: name),
    ) as Map<String, dynamic>;
    return TenXSingleScanResult.fromJson(data);
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
