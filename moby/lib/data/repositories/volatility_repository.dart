import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../models/trading_signal.dart';

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

  Future<Map<String, dynamic>> fetchVixTermStructure() async {
    final data = await ApiClient.instance.get(ApiEndpoints.vixTermStructure);
    return data as Map<String, dynamic>;
  }

  Future<({List<CrisisEvent> crises, String dataAsOf})> fetchCrises() async {
    final data = await ApiClient.instance.get(ApiEndpoints.crises) as Map<String, dynamic>;
    final list = (data['crises'] as List).cast<Map<String, dynamic>>();
    return (
      crises: list.map(CrisisEvent.fromJson).toList(),
      dataAsOf: data['dataAsOf'] as String? ?? '',
    );
  }
}
