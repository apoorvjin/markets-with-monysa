import 'package:dio/dio.dart';
import '../models/heatmap_data.dart';
import '../models/movers_data.dart';
import '../models/treemap_stock.dart';
import '../../core/cache/disk_cache.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class HeatmapRepository {
  HeatmapRepository._();
  static final HeatmapRepository instance = HeatmapRepository._();

  HeatmapData? _heatmapCache;
  DateTime? _heatmapFetchedAt;
  static const _heatmapTtl = Duration(minutes: 15);

  final Map<String, List<HeatmapTile>> _assetsCache = {};
  final Map<String, DateTime> _assetsFetchedAt = {};
  static const _assetsTtl = Duration(minutes: 30);

  Future<HeatmapData> fetchHeatmap() async {
    if (_heatmapCache != null &&
        _heatmapFetchedAt != null &&
        DateTime.now().difference(_heatmapFetchedAt!) < _heatmapTtl) {
      return _heatmapCache!;
    }
    final data = await ApiClient.instance.get(ApiEndpoints.heatmap);
    _heatmapCache = HeatmapData.fromJson(data as Map<String, dynamic>);
    _heatmapFetchedAt = DateTime.now();
    return _heatmapCache!;
  }

  Future<List<HeatmapTile>> fetchAssets(String category) async {
    final cached = _assetsCache[category];
    final fetchedAt = _assetsFetchedAt[category];
    if (cached != null && fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _assetsTtl) {
      return cached;
    }
    final data = await ApiClient.instance.get(
      ApiEndpoints.heatmapAssets,
      params: {'category': category},
      options: Options(receiveTimeout: const Duration(seconds: 90)),
    ) as Map<String, dynamic>;
    final tiles = (data['assets'] as List)
        .map((e) => HeatmapTile.fromJson(e as Map<String, dynamic>))
        .toList();
    _assetsCache[category] = tiles;
    _assetsFetchedAt[category] = DateTime.now();
    return tiles;
  }

  final Map<String, TreemapHeatmapData> _treemapCache = {};
  final Map<String, DateTime> _treemapFetchedAt = {};
  static const _treemapTtl = Duration(minutes: 5);

  Future<TreemapHeatmapData> fetchTreemap({
    String index = 'sp500',
    int limit = 100,
    String timeframe = '1d',
  }) async {
    final cacheKey = '$index:$timeframe:$limit';
    final diskKey = 'treemap.$cacheKey';
    final cached = _treemapCache[cacheKey];
    final fetchedAt = _treemapFetchedAt[cacheKey];
    if (cached != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _treemapTtl) {
      return cached;
    }

    // Cold start: hydrate from disk if we have a recent payload (≤ 30m old).
    // Quotes refresh every 5m server-side but constituents are 24h-cached;
    // showing 30m-old prices is better than a blank screen during fetch.
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(minutes: 30),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        _treemapCache[cacheKey] = TreemapHeatmapData.fromJson(disk);
        _treemapFetchedAt[cacheKey] = DateTime.now()
            .subtract(_treemapTtl); // mark as stale so we still revalidate
      }
    }

    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.heatmapTreemap(
            index: index, limit: limit, timeframe: timeframe),
        options: Options(receiveTimeout: const Duration(seconds: 120)),
      ) as Map<String, dynamic>;
      final parsed = TreemapHeatmapData.fromJson(data);
      _treemapCache[cacheKey] = parsed;
      _treemapFetchedAt[cacheKey] = DateTime.now();
      await DiskCache.instance.write(diskKey, data);
      return parsed;
    } catch (e) {
      // Network failure — serve the (possibly stale) memory entry hydrated
      // from disk above, so the user still sees data with a freshness indicator.
      final fallback = _treemapCache[cacheKey];
      if (fallback != null) return fallback;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final parsed = TreemapHeatmapData.fromJson(stale);
        _treemapCache[cacheKey] = parsed;
        _treemapFetchedAt[cacheKey] = DateTime.now().subtract(_treemapTtl);
        return parsed;
      }
      rethrow;
    }
  }

  // ── Movers (pre/regular/post top gainers + losers) ─────────────────────────

  final Map<String, MoversData> _moversCache = {};
  final Map<String, DateTime> _moversFetchedAt = {};
  static const _moversTtl = Duration(minutes: 5);

  Future<MoversData> fetchMovers({String index = 'sp500'}) async {
    final cached = _moversCache[index];
    final fetchedAt = _moversFetchedAt[index];
    if (cached != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _moversTtl) {
      return cached;
    }

    final diskKey = 'movers.$index';
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(minutes: 30),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        _moversCache[index] = MoversData.fromJson(disk);
        _moversFetchedAt[index] = DateTime.now().subtract(_moversTtl);
      }
    }

    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.heatmapMovers(index: index),
        options: Options(receiveTimeout: const Duration(seconds: 90)),
      ) as Map<String, dynamic>;
      final parsed = MoversData.fromJson(data);
      _moversCache[index] = parsed;
      _moversFetchedAt[index] = DateTime.now();
      await DiskCache.instance.write(diskKey, data);
      return parsed;
    } catch (_) {
      final fallback = _moversCache[index];
      if (fallback != null) return fallback;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final parsed = MoversData.fromJson(stale);
        _moversCache[index] = parsed;
        _moversFetchedAt[index] = DateTime.now().subtract(_moversTtl);
        return parsed;
      }
      rethrow;
    }
  }

  void invalidateCache() {
    _heatmapFetchedAt = null;
    _assetsCache.clear();
    _assetsFetchedAt.clear();
    _treemapCache.clear();
    _treemapFetchedAt.clear();
    _moversCache.clear();
    _moversFetchedAt.clear();
  }
}
