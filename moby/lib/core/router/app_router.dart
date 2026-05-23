import 'package:go_router/go_router.dart';
import '../../features/onboarding/onboarding_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/markets/markets_screen.dart';
import '../../features/trading/trading_screen.dart';
import '../../features/exposure/exposure_screen.dart';
import '../../features/volatility/volatility_screen.dart';
import '../../features/usa_debt/usa_debt_screen.dart';
import '../../features/country/country_detail_screen.dart';
import '../../features/country/country_stocks_screen.dart';
import '../../features/asset/asset_detail_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../app.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(
      path: '/splash',
      builder: (_, __) => const SplashScreen(),
    ),
    GoRoute(
      path: '/onboarding',
      builder: (_, __) => const OnboardingScreen(),
    ),
    ShellRoute(
      builder: (context, state, child) => AppShell(child: child),
      routes: [
        GoRoute(
          path: '/markets',
          builder: (_, __) => const MarketsScreen(),
        ),
        GoRoute(
          path: '/trading',
          builder: (_, __) => const TradingScreen(),
        ),
        GoRoute(
          path: '/exposure',
          builder: (_, __) => const ExposureScreen(),
        ),
        GoRoute(
          path: '/volatility',
          builder: (_, __) => const VolatilityScreen(),
        ),
        GoRoute(
          path: '/debt',
          builder: (_, __) => const UsaDebtScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (_, __) => const ProfileScreen(),
        ),
        GoRoute(
          path: '/country/:code',
          builder: (_, state) => CountryDetailScreen(
            countryCode: state.pathParameters['code']!,
          ),
        ),
        GoRoute(
          path: '/country/:code/stocks',
          builder: (_, state) => CountryStocksScreen(
            countryCode: state.pathParameters['code']!,
            countryName: state.uri.queryParameters['name'] ?? '',
          ),
        ),
        GoRoute(
          path: '/asset/:symbol',
          builder: (_, state) => AssetDetailScreen(
            symbol: state.pathParameters['symbol']!,
            name: state.uri.queryParameters['name'] ?? '',
          ),
        ),
      ],
    ),
  ],
);
