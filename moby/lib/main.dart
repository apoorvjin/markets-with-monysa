import 'dart:io';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'core/network/chart_renderer_interceptor.dart';
import 'core/network/device_id.dart';
import 'core/restart_widget.dart';
import 'firebase_options.dart';
import 'providers/strategy_provider.dart';
import 'services/entitlement_service.dart';
import 'services/firestore_service.dart';
import 'services/push_notification_service.dart';
import 'services/remote_config_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Colors.black,
  ));

  final prefs = await SharedPreferences.getInstance();

  // Remote Config: init in background — defaults are used until fetch completes.
  // Never await this; a missing Firebase Console setup must not block startup.
  RemoteConfigService.init().catchError((_) {});

  // Firestore backfill + prefs seed for returning signed-in users.
  // Both are fire-and-forget — startup must not stall on network.
  final firebaseUser = FirebaseAuth.instance.currentUser;
  if (firebaseUser != null) {
    FirestoreService.createUserDoc(
      firebaseUser.uid,
      firebaseUser.email ?? '',
    ).catchError((_) {});
    FirestoreService.seedPrefsFromFirestore(firebaseUser.uid, prefs)
        .catchError((_) {});
    PushNotificationService.init().catchError((_) {});
  }

  // One-time migration: force every existing user onto the In-House renderer,
  // overriding a previously saved Yahoo/TradingView choice. Guarded by a flag
  // so it fires exactly once — users remain free to switch back afterward.
  if (!(prefs.getBool('chart_provider_inhouse_migrated') ?? false)) {
    await prefs.setString('chart_provider', 'inhouse');
    await prefs.setBool('chart_provider_inhouse_migrated', true);
    // Push to Firestore too so the cloud copy (restored by
    // seedPrefsFromFirestore on launch) doesn't re-apply a stale choice.
    FirestoreService.updatePrefs({'chartProvider': 'inhouse'});
  }

  // Seed the chart renderer so the Dio interceptor stamps the correct
  // X-Chart-Renderer header on the very first request.
  final savedRenderer = prefs.getString('chart_provider');
  if (savedRenderer == 'yahoo' ||
      savedRenderer == 'tradingview' ||
      savedRenderer == 'inhouse') {
    currentChartRenderer = savedRenderer!;
  }

  // Load dev plan simulator override (set via Profile screen). Only honoured
  // in dev builds — in release a stale pref would silently pin the plan
  // (masking real purchases), so it is deleted instead.
  final savedSimPlan = prefs.getString('dev_simulated_plan');
  if (savedSimPlan != null) {
    if (EntitlementService.devToolsEnabled) {
      final plan = Plan.values.firstWhere(
        (p) => p.name == savedSimPlan,
        orElse: () => Plan.free,
      );
      EntitlementService.setSimulatedPlan(plan);
    } else {
      await prefs.remove('dev_simulated_plan');
    }
  }

  // Configure RevenueCat when platform API keys are provided.
  const rcIosKey = String.fromEnvironment('REVENUECAT_IOS_KEY');
  const rcAndroidKey = String.fromEnvironment('REVENUECAT_ANDROID_KEY');
  final rcKey = Platform.isIOS ? rcIosKey : rcAndroidKey;
  if (rcKey.isNotEmpty) {
    await Purchases.setLogLevel(LogLevel.warn);
    final deviceId = await DeviceId.get();
    final configuration = PurchasesConfiguration(rcKey)..appUserID = deviceId;
    await Purchases.configure(configuration);
    EntitlementService.markRevenueCatConfigured();

    try {
      // Keep RevenueCat's identity aligned with the signed-in Firebase user so
      // the billing webhook keys entitlements under the same id the app sends as
      // X-User-ID. _linkRevenueCat() only runs on an explicit sign-in; on a
      // restored session it never fires, so re-assert the identity here. Signed
      // out, RC stays on the device-id identity set above.
      final customerInfo = firebaseUser != null
          ? (await Purchases.logIn(firebaseUser.uid)).customerInfo
          : await Purchases.getCustomerInfo();
      EntitlementService.updateFromCustomerInfo(customerInfo);
    } catch (_) {}

    Purchases.addCustomerInfoUpdateListener(
        EntitlementService.updateFromCustomerInfo);
  }

  const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  await SentryFlutter.init(
    (options) {
      options.dsn = sentryDsn.isEmpty ? '' : sentryDsn;
      options.tracesSampleRate = 0.2;
      options.environment = sentryDsn.isEmpty ? 'development' : 'production';
    },
    appRunner: () => runApp(RestartWidget(
      child: ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const MobyApp(),
      ),
    )),
  );

  FirebaseAnalytics.instance.logAppOpen().catchError((_) {});
}
