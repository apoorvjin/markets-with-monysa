import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    _Slide(
      icon: Icons.public_rounded,
      title: 'Global Markets',
      body: 'Live indices, commodities, and forex pairs from 46 countries — all in one place. Candlestick charts, CFTC positioning, and real-time quotes at a glance.',
      accentHex: 0xFF00D4AA,
    ),
    _Slide(
      icon: Icons.psychology_rounded,
      title: 'AI Trading Signals',
      body: '9 strategies — from pure technical to ensemble and APEX — generate BUY/HOLD/SELL signals with entry, stop-loss, and take-profit levels for 49 assets.',
      accentHex: 0xFFFFB84D,
    ),
    _Slide(
      icon: Icons.travel_explore_rounded,
      title: 'Macro Intelligence',
      body: 'Tariff exposure across 113 countries, US debt visualised, volatility monitor with AI briefings, and yield curve analysis — everything a macro investor needs.',
      accentHex: 0xFFFF4D6A,
    ),
  ];

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hasSeenOnboarding', true);
    if (mounted) context.go('/markets');
  }

  void _next() {
    if (_page < _slides.length - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeInOut,
      );
    } else {
      _finish();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isLast = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: TextButton(
                onPressed: _finish,
                child: Text('Skip',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => _SlideView(slide: _slides[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s6, AppSpacing.s4, AppSpacing.s6, AppSpacing.s6),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_slides.length, (i) {
                      final active = i == _page;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: active ? 20 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: active ? c.accent : c.border,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: AppSpacing.s5),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _next,
                      style: FilledButton.styleFrom(
                        backgroundColor: c.accent,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.s4),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppRadius.md),
                        ),
                      ),
                      child: Text(
                        isLast ? 'Get Started' : 'Next',
                        style: AppTypography.labelLg.copyWith(
                            color: Colors.black,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide {
  const _Slide({
    required this.icon,
    required this.title,
    required this.body,
    required this.accentHex,
  });
  final IconData icon;
  final String title;
  final String body;
  final int accentHex;
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final accent = Color(slide.accentHex);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: accent.withAlpha(30),
              shape: BoxShape.circle,
              border: Border.all(color: accent.withAlpha(80), width: 1.5),
            ),
            child: Icon(slide.icon, size: 44, color: accent),
          ),
          const SizedBox(height: AppSpacing.s7),
          Text(
            slide.title,
            style: AppTypography.headingLg.copyWith(color: c.textPrimary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.s4),
          Text(
            slide.body,
            style: AppTypography.md.copyWith(
                color: c.textSecondary, height: 1.55),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
