import '../models/heatmap_data.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class HeatmapRepository {
  const HeatmapRepository();

  static const HeatmapRepository instance = HeatmapRepository();

  Future<HeatmapData> fetchHeatmap() async {
    final data = await ApiClient.instance.get(ApiEndpoints.heatmap);
    return HeatmapData.fromJson(data as Map<String, dynamic>);
  }

  Future<List<HeatmapTile>> fetchAssets() async {
    final data = await ApiClient.instance.get(ApiEndpoints.heatmapAssets)
        as Map<String, dynamic>;
    return (data['assets'] as List)
        .map((e) => HeatmapTile.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
