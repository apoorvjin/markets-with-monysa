import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/theme/app_palette.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'providers/alert_provider.dart';
import 'providers/font_size_provider.dart';
import 'providers/theme_provider.dart';
import 'services/push_notification_service.dart';

final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

class MobyApp extends ConsumerStatefulWidget {
  const MobyApp({super.key});

  @override
  ConsumerState<MobyApp> createState() => _MobyAppState();
}

class _MobyAppState extends ConsumerState<MobyApp> {
  StreamSubscription<({String title, String body})>? _pushSub;

  @override
  void initState() {
    super.initState();
    _pushSub = PushNotificationService.foregroundMessages.listen((msg) {
      _scaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(msg.title,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              if (msg.body.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(msg.body, style: const TextStyle(fontSize: 13)),
              ],
            ],
          ),
          duration: const Duration(seconds: 5),
          behavior: SnackBarBehavior.floating,
        ),
      );
    });
  }

  @override
  void dispose() {
    _pushSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final fontScale = ref.watch(fontSizeScaleProvider);
    return MaterialApp.router(
      title: 'Monysa',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      scaffoldMessengerKey: _scaffoldMessengerKey,
      routerConfig: appRouter,
      debugShowCheckedModeBanner: false,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(fontScale.scaleFactor),
        ),
        child: child!,
      ),
    );
  }
}

final _tabs = [
  (path: '/markets',   icon: Icons.bar_chart_rounded,         label: 'Market'),
  (path: '/trading',   icon: Icons.candlestick_chart_rounded, label: 'Trading'),
  (path: '/investing', icon: Icons.trending_up_rounded,       label: 'Investing'),
  (path: '/macro',     icon: Icons.bolt_rounded,              label: 'Macro'),
  (path: '/profile',   icon: Icons.person_rounded,            label: 'Profile'),
];

// Tracks last active main tab so detail screens keep it highlighted.
final lastMainTabProvider = StateProvider<int>((ref) => 0);

// Height of the nav bar content row (excluding device safe area).
// Used so screens can add bottom padding via MediaQuery.
const double _navBarPillHeight = 58.0;

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
    final bottomSafe = MediaQuery.of(context).padding.bottom;

    // Inactive label/icon color with enough contrast against glass.
    final inactiveColor = isDark
        ? Colors.white.withAlpha(160)
        : Colors.black.withAlpha(130);

    return ClipRect(
      child: BackdropFilter(
        // Strong blur — the defining trait of liquid glass.
        filter: ImageFilter.blur(sigmaX: 48, sigmaY: 48),
        child: Container(
          decoration: BoxDecoration(
            // Near-transparent fill: content behind is clearly visible.
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: isDark
                  ? [
                      const Color(0x18FFFFFF), // ~9% white at top
                      const Color(0x0CFFFFFF), // ~5% white at bottom
                    ]
                  : [
                      const Color(0x55FFFFFF), // ~33% white at top
                      const Color(0x40FFFFFF), // ~25% white at bottom
                    ],
            ),
            // Specular top rim — the bright edge of the glass pane.
            border: Border(
              top: BorderSide(
                color: isDark
                    ? const Color(0x55FFFFFF) // 33% white
                    : const Color(0x99FFFFFF), // 60% white
                width: 0.5,
              ),
            ),
          ),
          child: Padding(
            padding: EdgeInsets.only(bottom: bottomSafe),
            child: SizedBox(
              height: _navBarPillHeight,
              child: Row(
                children: [
                  ..._tabs.asMap().entries.map((entry) {
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
                            height: _navBarPillHeight,
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    AnimatedSwitcher(
                                      duration: const Duration(milliseconds: 200),
                                      child: Icon(
                                        tab.icon,
                                        key: ValueKey(isActive),
                                        size: 24,
                                        color: isActive ? c.accent : inactiveColor,
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
                                const SizedBox(height: 3),
                                AnimatedDefaultTextStyle(
                                  duration: const Duration(milliseconds: 200),
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: isActive ? c.accent : inactiveColor,
                                    fontWeight: isActive
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                  child: Text(tab.label),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
