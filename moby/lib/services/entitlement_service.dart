import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

/// The app sells exactly two tiers: Free and Pro. There is no Insight or
/// Enterprise tier — do not re-introduce them (see server plan-enforcement.ts,
/// which mirrors this two-tier model).
enum Plan { free, pro }

abstract final class EntitlementService {
  // Pass --dart-define=DEV_PLAN=pro to bypass gates during development and
  // TestFlight builds. Production builds ship without it. Any non-empty value
  // other than 'free' unlocks Pro (tolerates legacy 'insight'/'enterprise').
  static const _devPlan = String.fromEnvironment('DEV_PLAN');

  /// Dev tooling (the Profile plan simulator) only exists in debug builds or
  /// builds that explicitly pass DEV_PLAN. Release builds without it must
  /// never render the simulator nor honour a stale simulated-plan pref — a
  /// simulated 'free' would mask a real purchase, and a simulated 'pro' would
  /// hand out Pro without payment.
  static const bool devToolsEnabled = kDebugMode || _devPlan != '';

  static Plan _runtimePlan = Plan.free;
  static bool _rcConfigured = false;

  // Temporary in-app plan simulator — set via Profile screen dev section.
  // Persisted to SharedPreferences under 'dev_simulated_plan'.
  static Plan? _simulatedPlan;
  static void setSimulatedPlan(Plan? plan) => _simulatedPlan = plan;

  static Plan get current {
    if (_simulatedPlan != null) return _simulatedPlan!;
    if (_devPlan.isNotEmpty && _devPlan != 'free') return Plan.pro;
    return _runtimePlan;
  }

  static bool get isRevenueCatConfigured => _rcConfigured;

  static void markRevenueCatConfigured() => _rcConfigured = true;

  /// Called on app launch and whenever RevenueCat notifies of a plan change.
  ///
  /// ANY active entitlement unlocks Pro. We deliberately do NOT match a specific
  /// entitlement identifier: if the RevenueCat dashboard entitlement is renamed,
  /// a paying user must never silently drop back to Free.
  static void updateFromCustomerInfo(CustomerInfo info) {
    _runtimePlan = info.entitlements.active.isNotEmpty ? Plan.pro : Plan.free;
  }

  /// Restores previously-purchased entitlements for the current RevenueCat
  /// user (Firebase UID). This is the cross-device path — a user who bought on
  /// one device gets their plan back after signing in on another. Also required
  /// by App Store Guideline 3.1.1. Returns the resulting plan.
  static Future<Plan> restorePurchases() async {
    if (!_rcConfigured) return current;
    final info = await Purchases.restorePurchases();
    updateFromCustomerInfo(info);
    return current;
  }

  static bool can(String feature) {
    final allowed = _rules[feature];
    assert(allowed != null, 'Unknown entitlement feature: $feature');
    return allowed?.contains(current) ?? false;
  }

  static const _rules = <String, Set<Plan>>{
    'signals_advanced': {Plan.pro},
    'analyst_notes_unlimited': {Plan.pro},
    'alerts_unlimited': {Plan.pro},
    'push_notifications': {Plan.pro},
    'exposure_ai': {Plan.pro},
    'api_access': {Plan.pro},
    'best_setups': {Plan.pro},
    'backtest_filter': {Plan.pro},
    'treemap_heatmap': {Plan.pro},
    'heatmap_extended_timeframes': {Plan.pro},
    'forex_rate_comparison': {Plan.pro},
    'cftc_categories': {Plan.pro},
    'presidential_latest_filing': {Plan.pro},
    'etf_performance_metrics': {Plan.pro},
    'country_top_stocks': {Plan.pro},
    'macro_performance_timeframes': {Plan.pro},
    'macro_correlation_timeframes': {Plan.pro},
  };

  static String get requiredPlanLabel => 'Pro';
}
