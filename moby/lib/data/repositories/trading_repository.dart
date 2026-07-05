import 'package:dio/dio.dart';
import '../models/trading_signal.dart';
import '../models/candle.dart';
import '../models/adv_correlation_models.dart';
import '../../core/cache/disk_cache.dart';
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

class _InstFlowEntry {
  _InstFlowEntry(this.data) : _cachedAt = DateTime.now();
  final InstitutionalFlowResult data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inMinutes < 30;
}

// Adv Correlation — new, additive tab (see adv_correlation_tab.dart). Fully
// separate cache from any of the above; matches server TTLs (base matrix 4h,
// custom basket 45m, pair history 4h).
class _AdvCorrelationEntry {
  _AdvCorrelationEntry(this.data) : _cachedAt = DateTime.now();
  final AdvCorrelationData data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inHours < 4;
}

class _AdvCorrelationCustomEntry {
  _AdvCorrelationCustomEntry(this.data) : _cachedAt = DateTime.now();
  final AdvCorrelationData data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inMinutes < 45;
}

class _AdvCorrelationHistoryEntry {
  _AdvCorrelationHistoryEntry(this.data) : _cachedAt = DateTime.now();
  final CorrelationHistoryData data;
  final DateTime _cachedAt;
  bool get isValid => DateTime.now().difference(_cachedAt).inHours < 4;
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

  // Institutional flow cache — keyed by type ("accumulation"|"distribution"|"vwap").
  static final _instFlowCache = <String, _InstFlowEntry>{};
  static final _instFlowInFlight = <String, Future<InstitutionalFlowResult>>{};

  // Adv Correlation caches — keyed by window ("1m"|"3m"|"6m"|"1y"), by
  // "window:sortedSymbolsCsv" for custom baskets, and by "SYM1|SYM2" for
  // pair-history drill-downs.
  static final _advCorrelationCache = <String, _AdvCorrelationEntry>{};
  static final _advCorrelationCustomCache = <String, _AdvCorrelationCustomEntry>{};
  static final _advCorrelationHistoryCache = <String, _AdvCorrelationHistoryEntry>{};

  Future<List<TenXScanResult>> _cachedFetch(
      String cacheKey, String endpoint) {
    final entry = _scannerCache[cacheKey];
    if (entry != null && entry.isValid) return Future.value(entry.data);
    if (_inFlight.containsKey(cacheKey)) return _inFlight[cacheKey]!;

    final future = _fetchAndCacheScanner(cacheKey, endpoint);
    _inFlight[cacheKey] = future;
    return future;
  }

  Future<List<TenXScanResult>> _fetchAndCacheScanner(
      String cacheKey, String endpoint) async {
    final diskKey = 'scanner.$cacheKey';

    // Hydrate from disk on cold start while the network fetch runs — the
    // caller gets either the disk value (if the network fails) or the fresh
    // network value, with no blank state in between.
    List<TenXScanResult>? diskHydrated;
    if (_scannerCache[cacheKey] == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(hours: 6),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        diskHydrated = (disk['assets'] as List)
            .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
            .toList();
        _scannerCache[cacheKey] = _ScannerCacheEntry(diskHydrated);
      }
    }

    try {
      final raw =
          await ApiClient.instance.get(endpoint) as Map<String, dynamic>;
      final results = (raw['assets'] as List)
          .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
          .toList();
      _scannerCache[cacheKey] = _ScannerCacheEntry(results);
      _inFlight.remove(cacheKey);
      await DiskCache.instance.write(diskKey, raw);
      return results;
    } catch (e) {
      _inFlight.remove(cacheKey);
      // Offline fallback: use whatever disk has, regardless of age.
      if (diskHydrated != null) return diskHydrated;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final results = (stale['assets'] as List)
            .map((e) => TenXScanResult.fromJson(e as Map<String, dynamic>))
            .toList();
        _scannerCache[cacheKey] = _ScannerCacheEntry(results);
        return results;
      }
      rethrow;
    }
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

  Future<List<SignalTracePair>> fetchSignalsCompare(
    String symbol, {
    String timeframe = '1d',
    CancelToken? cancelToken,
  }) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.tradingSignalsCompare(symbol),
      params: {'timeframe': timeframe},
      cancelToken: cancelToken,
    );
    return (data['pairs'] as List)
        .map((p) => SignalTracePair.fromJson(p as Map<String, dynamic>))
        .toList();
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

  Future<List<BacktestResult>> fetchBacktest(String symbol, {String? timeframe}) async {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingBacktest(symbol, timeframe: timeframe)) as Map<String, dynamic>;
    // Server returns { symbol, timeframe, strategies: { "1": {...}, ... }, backtestNotes: { "3": "...", "6": "..." }, timestamp }
    final strategies = data['strategies'] as Map<String, dynamic>;
    final notes = (data['backtestNotes'] as Map<String, dynamic>?) ?? {};
    return ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18']
        .where((k) => strategies.containsKey(k))
        .map((k) {
          final n = int.parse(k);
          final label = n <= 9 ? 'S$k' : 'S${n - 9}+';
          return BacktestResult.fromJson({
            ...(strategies[k] as Map<String, dynamic>),
            'strategy': label,
            if (notes.containsKey(k)) 'backtestNote': notes[k],
          });
        })
        .toList();
  }

  Future<NewsResult> fetchNews(String symbol) async {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingNews(symbol));
    final articles = (data['articles'] as List)
        .map((e) => NewsArticle.fromJson(e as Map<String, dynamic>))
        .toList();
    final agg = (data['aggregateSentiment'] as num?)?.toDouble() ?? 0.0;
    return NewsResult(articles: articles, aggregateSentiment: agg);
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
  }) async {
    final key = version;
    final diskKey = 'best-sector.$key';
    final entry = _bestSectorCache[key];
    if (entry != null && entry.isValid) return entry.data;
    if (_bestSectorInFlight.containsKey(key)) return _bestSectorInFlight[key]!;

    // Hydrate memory from disk on cold start before the network fetch, so we
    // have something to return as offline fallback if the network fails.
    if (entry == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        // 6h is generous; data freshness recovers on next successful warm fetch.
        ttl: const Duration(hours: 6),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        final hydrated = SectorBestSetupsResponse.fromJson(disk);
        _bestSectorCache[key] = _BestSectorEntry(hydrated);
      }
    }

    final future = ApiClient.instance
        .get(ApiEndpoints.bestSetupsSector(version: version))
        .then((raw) async {
          final json = raw as Map<String, dynamic>;
          final resp = SectorBestSetupsResponse.fromJson(json);
          if (resp.cacheWarm) {
            _bestSectorCache[key] = _BestSectorEntry(resp);
            // Persist warm payloads only — never overwrite disk with a skeleton.
            await DiskCache.instance.write(diskKey, json);
          } else {
            // Server returned skeleton (cacheWarm:false). If we have a warm
            // disk-hydrated entry from earlier, prefer it over the empty
            // skeleton so the user sees real (slightly stale) data while the
            // server recomputes in the background.
            final hydrated = _bestSectorCache[key];
            if (hydrated != null && hydrated.data.cacheWarm) {
              _bestSectorInFlight.remove(key);
              return hydrated.data;
            }
          }
          _bestSectorInFlight.remove(key);
          return resp;
        })
        .catchError((Object e) async {
          _bestSectorInFlight.remove(key);
          // Offline fallback: serve stale disk if available, regardless of age.
          final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
            diskKey,
            decode: (j) => Map<String, dynamic>.from(j as Map),
          );
          if (stale != null) {
            return SectorBestSetupsResponse.fromJson(stale);
          }
          throw e;
        });
    _bestSectorInFlight[key] = future;
    return future;
  }

  void clearBestSectorCache(String key) => _bestSectorCache.remove(key);

  Future<QuiverScanResponse> fetchQuiverLobbying() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverLobbying) as Map<String, dynamic>;
    return QuiverScanResponse.fromJson(data);
  }

  Future<QuiverScanResponse> fetchQuiverInsider() async {
    final data = await ApiClient.instance.get(ApiEndpoints.quiverInsider) as Map<String, dynamic>;
    return QuiverScanResponse.fromJson(data);
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

  // The base matrix returns 503 { cacheWarm: false } for the ~2.5 minutes
  // right after a fresh deploy/restart, before the leader-gated warm job (and
  // its Redis snapshot) is populated. The global Dio retry interceptor
  // doesn't retry 503s (by design, for other endpoints), so this endpoint
  // gets its own short, bounded retry rather than surfacing a scary "failed
  // to load" the first time someone opens the tab right after a deploy.
  Future<Map<String, dynamic>> _fetchAdvCorrelationWithWarmupRetry(
    String window,
  ) async {
    const delays = [Duration(seconds: 5), Duration(seconds: 10)];
    for (var attempt = 0; ; attempt++) {
      try {
        return await ApiClient.instance.get(
          ApiEndpoints.advCorrelation(window: window),
        ) as Map<String, dynamic>;
      } on DioException catch (e) {
        final isWarmingUp = e.response?.statusCode == 503;
        if (!isWarmingUp || attempt >= delays.length) rethrow;
        await Future<void>.delayed(delays[attempt]);
      }
    }
  }

  Future<AdvCorrelationData> fetchAdvCorrelation({String window = '3m'}) async {
    final cached = _advCorrelationCache[window];
    if (cached != null && cached.isValid) return cached.data;

    final diskKey = 'adv_correlation.$window';
    AdvCorrelationData? diskHydrated;
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(hours: 6),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        diskHydrated = AdvCorrelationData.fromJson(disk);
        _advCorrelationCache[window] = _AdvCorrelationEntry(diskHydrated);
      }
    }

    try {
      final raw = await _fetchAdvCorrelationWithWarmupRetry(window);
      final data = AdvCorrelationData.fromJson(raw);
      _advCorrelationCache[window] = _AdvCorrelationEntry(data);
      await DiskCache.instance.write(diskKey, raw);
      return data;
    } catch (e) {
      if (diskHydrated != null) return diskHydrated;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final data = AdvCorrelationData.fromJson(stale);
        _advCorrelationCache[window] = _AdvCorrelationEntry(data);
        return data;
      }
      rethrow;
    }
  }

  Future<AdvCorrelationData> fetchAdvCorrelationCustom({
    required List<String> symbols,
    String window = '3m',
  }) async {
    final sorted = List<String>.from(symbols)..sort();
    final key = '$window:${sorted.join(",")}';
    final cached = _advCorrelationCustomCache[key];
    if (cached != null && cached.isValid) return cached.data;

    final raw = await ApiClient.instance.get(
      ApiEndpoints.advCorrelationCustom(symbols: symbols, window: window),
    ) as Map<String, dynamic>;
    final data = AdvCorrelationData.fromJson(raw);
    _advCorrelationCustomCache[key] = _AdvCorrelationCustomEntry(data);
    return data;
  }

  Future<CorrelationHistoryData> fetchAdvCorrelationHistory({
    required String a,
    required String b,
  }) async {
    final key = ([a, b]..sort()).join('|');
    final cached = _advCorrelationHistoryCache[key];
    if (cached != null && cached.isValid) return cached.data;

    final raw = await ApiClient.instance.get(
      ApiEndpoints.advCorrelationHistory(a: a, b: b),
    ) as Map<String, dynamic>;
    final data = CorrelationHistoryData.fromJson(raw);
    _advCorrelationHistoryCache[key] = _AdvCorrelationHistoryEntry(data);
    return data;
  }

  Future<InstitutionalFlowResult> fetchInstitutionalFlow(String type) {
    final entry = _instFlowCache[type];
    if (entry != null && entry.isValid) return Future.value(entry.data);
    if (_instFlowInFlight.containsKey(type)) return _instFlowInFlight[type]!;

    final future = ApiClient.instance
        .get(ApiEndpoints.institutionalFlow(type: type))
        .then((raw) {
          final resp =
              InstitutionalFlowResult.fromJson(raw as Map<String, dynamic>);
          _instFlowCache[type] = _InstFlowEntry(resp);
          _instFlowInFlight.remove(type);
          return resp;
        })
        .catchError((Object e) {
          _instFlowInFlight.remove(type);
          throw e;
        });
    _instFlowInFlight[type] = future;
    return future;
  }
}
