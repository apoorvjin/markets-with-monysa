import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _logoCtrl;
  late final AnimationController _badgeCtrl;
  late final Animation<double> _logoFade;
  late final Animation<Offset> _logoSlide;
  late final Animation<double> _dividerWidth;
  late final Animation<double> _badgeFade;

  @override
  void initState() {
    super.initState();

    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _badgeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _logoFade = CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOut);
    _logoSlide = Tween(begin: const Offset(0, 0.15), end: Offset.zero)
        .animate(CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOut));
    _dividerWidth = Tween(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _logoCtrl,
        curve: const Interval(0.5, 1.0, curve: Curves.easeOut),
      ),
    );
    _badgeFade = CurvedAnimation(parent: _badgeCtrl, curve: Curves.easeOut);

    _animate();
  }

  Future<void> _animate() async {
    await Future.delayed(const Duration(milliseconds: 200));
    _logoCtrl.forward();
    await Future.delayed(const Duration(milliseconds: 900));
    _badgeCtrl.forward();
    await Future.delayed(const Duration(milliseconds: 1500));
    if (mounted) {
      final prefs = await SharedPreferences.getInstance();
      final dest = prefs.getString('lastTab') ?? '/markets';
      if (mounted) context.go(dest);
    }
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _badgeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FadeTransition(
              opacity: _logoFade,
              child: SlideTransition(
                position: _logoSlide,
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: c.accent,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: c.accent.withAlpha(80),
                            blurRadius: 32,
                            spreadRadius: 4,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.candlestick_chart_rounded,
                        color: Colors.black,
                        size: 40,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'MONYSA',
                      style: AppTypography.xl4.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 4,
                        color: c.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Global Financial Intelligence',
                      style: AppTypography.lg.copyWith(
                        color: c.textMuted,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            AnimatedBuilder(
              animation: _dividerWidth,
              builder: (_, __) => Container(
                width: 200 * _dividerWidth.value,
                height: 1,
                color: c.border,
              ),
            ),
            const SizedBox(height: 24),
            FadeTransition(
              opacity: _badgeFade,
              child: Wrap(
                spacing: 8,
                children: [
                  _Badge(label: '113 Countries', palette: c),
                  _Badge(label: 'Live Markets', palette: c),
                  _Badge(label: 'AI Signals', palette: c),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.palette});
  final String label;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.accentDim,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: c.accent.withAlpha(60)),
      ),
      child: Text(
        label,
        style: AppTypography.sm.copyWith(
          color: c.accent,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
