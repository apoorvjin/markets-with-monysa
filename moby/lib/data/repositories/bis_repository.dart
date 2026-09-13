import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../models/country_health.dart';
import '../models/currency_valuation.dart';

class BisRepository {
  BisRepository._();
  static final BisRepository instance = BisRepository._();

  /// Free, unauthenticated — which country codes have at least one BIS series.
  Future<List<String>> fetchCoverage() async {
    final data = await ApiClient.instance
        .get(ApiEndpoints.countryHealthCoverage) as Map<String, dynamic>;
    return (data['countries'] as List).cast<String>();
  }

  /// Pro-gated server-side (403 for free devices) — callers must check
  /// EntitlementService.can('country_financial_conditions') before calling
  /// this, same as the AI Macro Briefing pattern, so a free device never
  /// burns a request that's guaranteed to 403.
  Future<CountryHealthData> fetchCountryHealth(String code) async {
    final data = await ApiClient.instance.get(ApiEndpoints.countryHealth(code))
        as Map<String, dynamic>;
    return CountryHealthData.fromJson(data);
  }

  /// Pro-gated server-side (403 for free devices) — same caller obligation as
  /// fetchCountryHealth: check the entitlement before calling.
  Future<List<CountryHealthRanking>> fetchRanking() async {
    final data = await ApiClient.instance.get(ApiEndpoints.countryHealthRanking)
        as Map<String, dynamic>;
    return (data['rankings'] as List)
        .map((r) => CountryHealthRanking.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  /// FIN-21 — free, unauthenticated. REER-based valuation for every currency
  /// in FOREX_PAIRS (Markets → Forex).
  Future<List<CurrencyValuation>> fetchCurrencyValuation() async {
    final data = await ApiClient.instance.get(ApiEndpoints.currencyValuation)
        as Map<String, dynamic>;
    return (data['currencies'] as List)
        .map((c) => CurrencyValuation.fromJson(c as Map<String, dynamic>))
        .toList();
  }
}
