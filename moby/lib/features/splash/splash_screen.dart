import 'dart:math' as math;
import 'dart:ui' as ui;
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
  late final AnimationController _starsCtrl;
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
    _starsCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
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
    final prefs = await SharedPreferences.getInstance();
    final hasSeenOnboarding = prefs.getBool('hasSeenOnboarding') ?? false;

    if (!hasSeenOnboarding) {
      // First-ever launch — play full animation, then go to onboarding.
      await Future.delayed(const Duration(milliseconds: 200));
      _logoCtrl.forward();
      _starsCtrl.forward();
      await Future.delayed(const Duration(milliseconds: 900));
      _badgeCtrl.forward();
      await Future.delayed(const Duration(milliseconds: 1500));
      if (mounted) context.go('/onboarding');
      return;
    }

    // Returning user (cold restart) — skip animation, go straight to last tab.
    final dest = prefs.getString('lastTab') ?? '/markets';
    if (mounted) context.go(dest);
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _badgeCtrl.dispose();
    _starsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: Stack(
        children: [
          Center(
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
          AnimatedBuilder(
            animation: _starsCtrl,
            builder: (_, __) => CustomPaint(
              painter: _ShootingStarsPainter(_starsCtrl.value),
              isComplex: true,
              willChange: true,
              child: const SizedBox.expand(),
            ),
          ),
        ],
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

class _StarDef {
  final double sx, sy, ex, ey, start, dur, thick;
  final Color glow;
  final Color core;
  const _StarDef({
    required this.sx,
    required this.sy,
    required this.ex,
    required this.ey,
    required this.start,
    required this.dur,
    required this.thick,
    required this.glow,
    required this.core,
  });
}

class _ShootingStarsPainter extends CustomPainter {
  final double progress;
  const _ShootingStarsPainter(this.progress);

  // Spread across top, varied angles — alternating green/red like candlestick colors
  static const _stars = [
    // far right → center-left (steep diagonal)
    _StarDef(sx: 0.92, sy: -0.02, ex: 0.42, ey: 1.10, start: 0.00, dur: 0.28, thick: 3.0,
      glow: Color(0xFF00AA55), core: Color(0xFF00FF88)),
    // far left → center-right (opposite lean)
    _StarDef(sx: 0.18, sy: -0.02, ex: 0.50, ey: 1.10, start: 0.15, dur: 0.26, thick: 2.0,
      glow: Color(0xFFCC0033), core: Color(0xFFFF4466)),
    // center → hard left (sharp angle)
    _StarDef(sx: 0.58, sy: -0.02, ex: 0.08, ey: 1.10, start: 0.32, dur: 0.22, thick: 1.5,
      glow: Color(0xFF00AA55), core: Color(0xFF00FF88)),
    // right-center → nearly straight down, slight right
    _StarDef(sx: 0.72, sy: -0.02, ex: 0.78, ey: 1.10, start: 0.48, dur: 0.24, thick: 2.0,
      glow: Color(0xFFCC0033), core: Color(0xFFFF4466)),
    // left-center → slight right lean
    _StarDef(sx: 0.38, sy: -0.02, ex: 0.62, ey: 1.10, start: 0.64, dur: 0.20, thick: 1.0,
      glow: Color(0xFF00AA55), core: Color(0xFF00FF88)),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    for (final star in _stars) {
      final elapsed = progress - star.start;
      if (elapsed <= 0) continue;

      double headProg;
      double fade;

      if (elapsed <= star.dur) {
        headProg = elapsed / star.dur;
        fade = 1.0;
      } else {
        final tailElapsed = elapsed - star.dur;
        const tailDur = 0.13;
        fade = math.max(0.0, 1.0 - tailElapsed / tailDur);
        headProg = 1.0;
        if (fade <= 0) continue;
      }

      _drawStar(canvas, size, star, headProg, fade);
    }
  }

  void _drawStar(Canvas canvas, Size size, _StarDef star, double headProg, double fade) {
    final tailX = star.sx * size.width;
    final tailY = star.sy * size.height;
    final destX = star.ex * size.width;
    final destY = star.ey * size.height;

    final hx = tailX + (destX - tailX) * headProg;
    final hy = tailY + (destY - tailY) * headProg;

    final tail = Offset(tailX, tailY);
    final head = Offset(hx, hy);

    // Outer glow
    canvas.drawLine(
      tail, head,
      Paint()
        ..color = star.glow.withOpacity(0.28 * fade)
        ..strokeWidth = star.thick * 18
        ..maskFilter = const ui.MaskFilter.blur(ui.BlurStyle.normal, 18)
        ..strokeCap = StrokeCap.round,
    );

    // Mid glow
    canvas.drawLine(
      tail, head,
      Paint()
        ..color = star.core.withOpacity(0.50 * fade)
        ..strokeWidth = star.thick * 6
        ..maskFilter = ui.MaskFilter.blur(ui.BlurStyle.normal, star.thick * 3)
        ..strokeCap = StrokeCap.round,
    );

    // Gradient core — white-hot at head, fades to transparent at tail
    if ((head - tail).distance >= 1) {
      canvas.drawLine(
        tail, head,
        Paint()
          ..shader = ui.Gradient.linear(
            tail, head,
            [
              star.glow.withOpacity(0),
              star.core.withOpacity(0.55 * fade),
              Color.fromARGB((240 * fade).round(), 255, 255, 255),
            ],
            const [0.0, 0.55, 1.0],
          )
          ..strokeWidth = star.thick * 1.2
          ..strokeCap = StrokeCap.round,
      );
    }

    // Bright tip bloom
    canvas.drawCircle(
      head,
      star.thick * 3,
      Paint()
        ..color = Colors.white.withOpacity(0.85 * fade)
        ..maskFilter = ui.MaskFilter.blur(ui.BlurStyle.normal, star.thick * 5),
    );
  }

  @override
  bool shouldRepaint(_ShootingStarsPainter old) => old.progress != progress;
}
