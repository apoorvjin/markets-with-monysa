import '../models/heatmap_data.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class HeatmapRepository {
  HeatmapRepository._();
  static final HeatmapRepository instance = HeatmapRepository._();

  HeatmapData? _heatmapCache;
  DateTime? _heatmapFetchedAt;
  static const _heatmapTtl = Duration(minutes: 15);

  List<HeatmapTile>? _assetsCache;
  DateTime? _assetsFetchedAt;
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

  Future<List<HeatmapTile>> fetchAssets() async {
    if (_assetsCache != null &&
        _assetsFetchedAt != null &&
        DateTime.now().difference(_assetsFetchedAt!) < _assetsTtl) {
      return _assetsCache!;
    }
    final data = await ApiClient.instance.get(ApiEndpoints.heatmapAssets)
        as Map<String, dynamic>;
    _assetsCache = (data['assets'] as List)
        .map((e) => HeatmapTile.fromJson(e as Map<String, dynamic>))
        .toList();
    _assetsFetchedAt = DateTime.now();
    return _assetsCache!;
  }

  void invalidateCache() {
    _heatmapFetchedAt = null;
    _assetsFetchedAt = null;
  }
}
