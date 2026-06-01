import 'package:go_router/go_router.dart';
import '../../features/onboarding/onboarding_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/markets/markets_screen.dart';
import '../../features/trading/trading_screen.dart';
import '../../features/investing/investing_screen.dart';
import '../../features/volatility/volatility_screen.dart';
import '../../features/country/country_detail_screen.dart';
import '../../features/country/country_stocks_screen.dart';
import '../../features/asset/asset_detail_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/trading/tenx_backtest_screen.dart';
import '../../features/investing/multibaggers_screen.dart';
import '../../app.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  redirect: (context, state) {
    // Redirect old standalone routes to their new homes
    final loc = state.matchedLocation;
    if (loc == '/volatility') return '/macro';
    if (loc == '/exposure') return '/investing';
    if (loc == '/debt') return '/macro';
    return null;
  },
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
          path: '/investing',
          builder: (_, __) => const InvestingScreen(),
        ),
        GoRoute(
          path: '/macro',
          builder: (_, __) => const MacroScreen(),
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
        GoRoute(
          path: '/trading/10x-backtest',
          builder: (_, state) => TenXBacktestScreen(
            version: state.uri.queryParameters['version'] ?? 'v1',
            type: state.uri.queryParameters['type'] ?? 'assets',
          ),
        ),
        GoRoute(
          path: '/trading/multibaggers',
          builder: (_, state) => MultibaggersScreen(
            country: state.uri.queryParameters['country'] ?? 'india',
          ),
        ),
      ],
    ),
  ],
);
