import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/theme/app_palette.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'providers/alert_provider.dart';
import 'providers/theme_provider.dart';

class MobyApp extends ConsumerWidget {
  const MobyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'Monysa',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: appRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}

final _tabs = [
  (path: '/markets', icon: Icons.bar_chart_rounded, label: 'Markets'),
  (path: '/trading', icon: Icons.candlestick_chart_rounded, label: 'Trading'),
  (path: '/exposure', icon: Icons.public_rounded, label: 'Exposure'),
  (path: '/volatility', icon: Icons.bolt_rounded, label: 'Volatility'),
  (path: '/debt', icon: Icons.account_balance_rounded, label: 'Debt'),
];

// Tracks last active main tab so detail screens keep it highlighted.
final lastMainTabProvider = StateProvider<int>((ref) => 0);

// Approximate height of the floating pill + its margins (excluding device safe area).
// Used so screens can add bottom padding via MediaQuery.
const double _navBarPillHeight = 80.0;

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertProvider);
    final lastTabIdx = ref.watch(lastMainTabProvider);
    final location = GoRouterState.of(context).uri.toString();
    final tabFromLocation = _tabs.indexWhere((t) => location.startsWith(t.path));
    final currentIndex = tabFromLocation >= 0 ? tabFromLocation : lastTabIdx;

    return Scaffold(
      // extendBody lets screen content scroll behind the glass pill.
      extendBody: true,
      // Inject extra bottom padding so screens using MediaQuery.padding.bottom
      // (e.g. SafeArea, scroll padding) don't hide content behind the pill.
      body: MediaQuery(
        data: MediaQuery.of(context).copyWith(
          padding: MediaQuery.of(context).padding.copyWith(
            bottom:
                MediaQuery.of(context).padding.bottom + _navBarPillHeight,
          ),
        ),
        child: child,
      ),
      bottomNavigationBar: _BottomBar(
        currentIndex: currentIndex,
        alertCount: alerts.length,
        onTap: (i) async {
          ref.read(lastMainTabProvider.notifier).state = i;
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('lastTab', _tabs[i].path);
          if (context.mounted) context.go(_tabs[i].path);
        },
      ),
    );
  }
}

class _BottomBar extends ConsumerWidget {
  const _BottomBar({
    required this.currentIndex,
    required this.alertCount,
    required this.onTap,
  });

  final int currentIndex;
  final int alertCount;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final screenWidth = MediaQuery.of(context).size.width;
    final bottomSafe = MediaQuery.of(context).padding.bottom;

    return Padding(
      // Float the pill: side margins + space above/below.
      padding: EdgeInsets.fromLTRB(16, 8, 16, bottomSafe + 10),
      child: Container(
        height: 62,
        // Shadow lives outside ClipRRect so it isn't clipped away.
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(40),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(isDark ? 90 : 35),
              blurRadius: 30,
              spreadRadius: -4,
              offset: const Offset(0, 8),
            ),
            // Secondary diffuse shadow for depth
            BoxShadow(
              color: Colors.black.withAlpha(isDark ? 50 : 18),
              blurRadius: 60,
              spreadRadius: -2,
              offset: const Offset(0, 16),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(40),
          child: BackdropFilter(
            // Strong blur so underlying content is clearly frosted.
            filter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
            child: Container(
              decoration: BoxDecoration(
                // Top-lit gradient: brighter at crown, slightly less at base —
                // mimics the specular refraction in Apple's Liquid Glass spec.
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: isDark
                      ? [
                          const Color(0x32FFFFFF), // 20% white at top
                          const Color(0x1AFFFFFF), // 10% white at bottom
                        ]
                      : [
                          const Color(0xE0FFFFFF), // 88% white at top
                          const Color(0xC8FFFFFF), // 78% white at bottom
                        ],
                ),
                borderRadius: BorderRadius.circular(40),
                // Thin specular rim — the bright inner edge of the glass.
                border: Border.all(
                  color: isDark
                      ? const Color(0x45FFFFFF) // 27% white
                      : const Color(0xB0FFFFFF), // 69% white
                  width: 0.6,
                ),
              ),
              child: Row(
                children: _tabs.asMap().entries.map((entry) {
                  final i = entry.key;
                  final tab = entry.value;
                  final isActive = i == currentIndex;
                  final showBadge = tab.path == '/trading' && alertCount > 0;

                  return Expanded(
                    child: Semantics(
                      label: tab.label,
                      button: true,
                      selected: isActive,
                      child: GestureDetector(
                        onTap: () => onTap(i),
                        behavior: HitTestBehavior.opaque,
                        child: SizedBox(
                          height: 62,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  AnimatedSwitcher(
                                    duration:
                                        const Duration(milliseconds: 200),
                                    child: Icon(
                                      tab.icon,
                                      key: ValueKey(isActive),
                                      size: 24,
                                      color: isActive
                                          ? c.accent
                                          : c.textSecondary
                                              .withAlpha(isDark ? 160 : 140),
                                    ),
                                  ),
                                  if (showBadge)
                                    Positioned(
                                      right: -6,
                                      top: -4,
                                      child: Container(
                                        padding: const EdgeInsets.all(3),
                                        decoration: BoxDecoration(
                                          color: c.danger,
                                          shape: BoxShape.circle,
                                        ),
                                        child: Text(
                                          '$alertCount',
                                          style: const TextStyle(
                                            fontSize: 9,
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              if (screenWidth >= 360) ...[
                                const SizedBox(height: 3),
                                AnimatedDefaultTextStyle(
                                  duration: const Duration(milliseconds: 200),
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: isActive
                                        ? c.accent
                                        : c.textSecondary.withAlpha(
                                            isDark ? 145 : 125),
                                    fontWeight: isActive
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                  child: Text(tab.label),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
