import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class VolatilityRepository {
  const VolatilityRepository();
  static const VolatilityRepository instance = VolatilityRepository();

  Future<Map<String, dynamic>> fetchAssets() async {
    final data = await ApiClient.instance.get(ApiEndpoints.volatilityAssets);
    return data as Map<String, dynamic>;
  }

  Future<String> fetchBriefing() async {
    final data = await ApiClient.instance.post(ApiEndpoints.volatilityBriefing);
    return (data['briefing'] ?? data['summary'] ?? '') as String;
  }
}
