import 'package:dio/dio.dart';
import '../models/heatmap_data.dart';
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

  void invalidateCache() {
    _heatmapFetchedAt = null;
    _assetsCache.clear();
    _assetsFetchedAt.clear();
  }
}
