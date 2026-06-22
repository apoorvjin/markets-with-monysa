import 'package:firebase_remote_config/firebase_remote_config.dart';

/// Wraps Firebase Remote Config with typed accessors and safe defaults.
///
/// Hard-coded defaults are used when:
///   - Firebase is unreachable on first launch
///   - A key has not yet been created in the Firebase Console
///
/// To change values WITHOUT a new app release:
///   - Via Firebase Console: https://console.firebase.google.com → Remote Config
///   - Via server API: PATCH /api/admin/remote-config  (requires ADMIN_SECRET)
///     e.g. curl -X PATCH -H "Authorization: Bearer $ADMIN_SECRET" \
///              -H "Content-Type: application/json" \
///              -d '{"pro_monthly_price_usd":"9.99"}' \
///              https://monysa-api.fly.dev/api/admin/remote-config
abstract final class RemoteConfigService {
  static FirebaseRemoteConfig get _rc => FirebaseRemoteConfig.instance;

  // ── Default values (server-side truth; overridden by Firebase) ───────────

  static const Map<String, dynamic> _defaults = {
    'pro_monthly_price_usd': '12.99',
    'alert_limit_free': '3',
    'push_notification_cooldown_secs': '300',
    'enable_google_signin': 'false',
    'enable_apple_signin': 'false',
    'new_strategy_s4_enabled': 'false',
  };

  // ── Initialise ────────────────────────────────────────────────────────────

  static Future<void> init() async {
    await _rc.setConfigSettings(RemoteConfigSettings(
      fetchTimeout: const Duration(seconds: 10),
      // 12-hour cache in production; 0 in debug so changes are instant.
      minimumFetchInterval: const bool.fromEnvironment('SENTRY_DSN') == false
          ? Duration.zero
          : const Duration(hours: 12),
    ));
    await _rc.setDefaults(_defaults);
    // Fetch + activate in the background; app uses defaults until ready.
    _rc
        .fetchAndActivate()
        .catchError((_) => false); // never crash on network error
  }

  // ── Typed accessors ───────────────────────────────────────────────────────

  /// e.g. "12.99" — displayed on the upgrade sheet paywall.
  static String get proMonthlyPriceUsd =>
      _rc.getString('pro_monthly_price_usd');

  /// Maximum number of price alerts for free-plan users (default 3).
  static int get alertLimitFree =>
      int.tryParse(_rc.getString('alert_limit_free')) ?? 3;

  /// Minimum seconds between two FCM pushes for the same symbol (default 300).
  static int get pushCooldownSecs =>
      int.tryParse(_rc.getString('push_notification_cooldown_secs')) ?? 300;

  /// Whether to show Google Sign-In button (dark-launch gate).
  static bool get enableGoogleSignin =>
      _rc.getString('enable_google_signin') == 'true';

  /// Whether to show Apple Sign-In button (dark-launch gate).
  static bool get enableAppleSignin =>
      _rc.getString('enable_apple_signin') == 'true';

  /// Whether S4 strategy is enabled for users (dark-launch gate).
  static bool get newStrategyS4Enabled =>
      _rc.getString('new_strategy_s4_enabled') == 'true';

  // ── Force refresh (call after returning from the background) ─────────────

  static Future<bool> refresh() => _rc.fetchAndActivate();
}
