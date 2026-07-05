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

  // Seed the chart renderer so the Dio interceptor stamps the correct
  // X-Chart-Renderer header on the very first request.
  final savedRenderer = prefs.getString('chart_provider');
  if (savedRenderer == 'tradingview' || savedRenderer == 'inhouse') {
    currentChartRenderer = savedRenderer!;
  }

  // Load dev plan simulator override (set via Profile screen).
  final savedSimPlan = prefs.getString('dev_simulated_plan');
  if (savedSimPlan != null) {
    final plan = Plan.values.firstWhere(
      (p) => p.name == savedSimPlan,
      orElse: () => Plan.free,
    );
    EntitlementService.setSimulatedPlan(plan);
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
      final customerInfo = await Purchases.getCustomerInfo();
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
