import 'package:purchases_flutter/purchases_flutter.dart';

enum Plan { free, pro, enterprise }

abstract final class EntitlementService {
  // Pass --dart-define=DEV_PLAN=pro (or enterprise) to bypass gates
  // during development and TestFlight builds. Production builds ship without it.
  static const _devPlan = String.fromEnvironment('DEV_PLAN');

  static Plan _runtimePlan = Plan.free;
  static bool _rcConfigured = false;

  // Temporary in-app plan simulator — set via Profile screen dev section.
  // Persisted to SharedPreferences under 'dev_simulated_plan'.
  static Plan? _simulatedPlan;
  static void setSimulatedPlan(Plan? plan) => _simulatedPlan = plan;

  static Plan get current {
    if (_simulatedPlan != null) return _simulatedPlan!;
    switch (_devPlan) {
      case 'pro':
        return Plan.pro;
      case 'enterprise':
        return Plan.enterprise;
    }
    return _runtimePlan;
  }

  static bool get isRevenueCatConfigured => _rcConfigured;

  static void markRevenueCatConfigured() => _rcConfigured = true;

  /// Called on app launch and whenever RevenueCat notifies of a plan change.
  static void updateFromCustomerInfo(CustomerInfo info) {
    Plan newPlan = Plan.free;
    final active = info.entitlements.active;
    if (active.containsKey('enterprise')) {
      newPlan = Plan.enterprise;
    } else if (active.containsKey('pro') || active.containsKey('insight')) {
      newPlan = Plan.pro;
    }
    _runtimePlan = newPlan;
  }

  static bool can(String feature) {
    final allowed = _rules[feature];
    assert(allowed != null, 'Unknown entitlement feature: $feature');
    return allowed?.contains(current) ?? false;
  }

  static const _rules = <String, Set<Plan>>{
    'signals_advanced': {Plan.pro, Plan.enterprise},
    'analyst_notes_unlimited': {Plan.pro, Plan.enterprise},
    'alerts_unlimited': {Plan.pro, Plan.enterprise},
    'push_notifications': {Plan.pro, Plan.enterprise},
    'exposure_ai': {Plan.pro, Plan.enterprise},
    'api_access': {Plan.pro, Plan.enterprise},
    'best_setups': {Plan.pro, Plan.enterprise},
    'backtest_filter': {Plan.pro, Plan.enterprise},
    'treemap_heatmap': {Plan.pro, Plan.enterprise},
  };

  static String get requiredPlanLabel => 'Pro';
}
