import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class DebtRepository {
  const DebtRepository();
  static const DebtRepository instance = DebtRepository();

  Future<Map<String, dynamic>> fetchDebt() async {
    final data = await ApiClient.instance.get(ApiEndpoints.usaDebt);
    return data as Map<String, dynamic>;
  }
}
