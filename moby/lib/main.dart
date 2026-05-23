import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'providers/strategy_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
  const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  await SentryFlutter.init(
    (options) {
      options.dsn = sentryDsn.isEmpty ? '' : sentryDsn;
      options.tracesSampleRate = 0.2;
      options.environment = sentryDsn.isEmpty ? 'development' : 'production';
    },
    appRunner: () => runApp(ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const MobyApp(),
    )),
  );
}
