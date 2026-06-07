import 'package:purchases_flutter/purchases_flutter.dart';

enum Plan { free, pro, insight, enterprise }

abstract final class EntitlementService {
  // Pass --dart-define=DEV_PLAN=pro (or insight/enterprise) to bypass gates
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
      case 'insight':
        return Plan.insight;
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
    } else if (active.containsKey('insight')) {
      newPlan = Plan.insight;
    } else if (active.containsKey('pro')) {
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
    'signals_advanced': {Plan.pro, Plan.insight, Plan.enterprise},
    'analyst_notes_unlimited': {Plan.pro, Plan.insight, Plan.enterprise},
    'alerts_unlimited': {Plan.pro, Plan.insight, Plan.enterprise},
    'push_notifications': {Plan.pro, Plan.insight, Plan.enterprise},
    'exposure_ai': {Plan.insight, Plan.enterprise},
    'api_access': {Plan.insight, Plan.enterprise},
    'best_setups': {Plan.pro, Plan.insight, Plan.enterprise},
    'backtest_filter': {Plan.insight, Plan.enterprise},
    'treemap_heatmap': {Plan.pro, Plan.insight, Plan.enterprise},
  };

  static String get requiredPlanLabel {
    return current == Plan.free ? 'Pro' : 'Insight';
  }
}
