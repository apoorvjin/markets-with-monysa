import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class VolatilityRepository {
  const VolatilityRepository();
  static const VolatilityRepository instance = VolatilityRepository();

  Future<Map<String, dynamic>> fetchAssets() async {
    final data = await ApiClient.instance.get(ApiEndpoints.volatilityAssets);
    return data as Map<String, dynamic>;
  }

  Future<String> fetchBriefing(Map<String, Object?> params) async {
    final data = await ApiClient.instance.post(
      ApiEndpoints.volatilityBriefing,
      data: params,
    );
    return (data['briefing'] ?? '') as String;
  }
}
