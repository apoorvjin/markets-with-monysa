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
      emoji: '🌍',
      title: 'Live Global Markets',
      body: 'Real-time indices, commodities, and forex pairs from around the world — with candlestick charts and CFTC positioning data at a glance.',
      bullets: ['46 indices · 23 commodities', '44 forex pairs by region', 'Market-cap treemap heatmap'],
      accentHex: 0xFF00D4AA,
    ),
    _Slide(
      emoji: '🤖',
      title: 'AI Trading Signals',
      body: 'Nine strategies — from pure technical to sentiment-hybrid — generate BUY/HOLD/SELL signals with entry, stop-loss, and take-profit levels.',
      bullets: ['49 assets across all classes', 'Entry · SL · TP on every signal', 'Walk-forward backtesting'],
      accentHex: 0xFFFFB84D,
    ),
    _Slide(
      emoji: '🧭',
      title: 'Macro Intelligence',
      body: 'Everything a macro investor needs — tariff exposure, market stress gauges, yield curve analysis, and AI-powered global briefings.',
      bullets: ['113-country tariff exposure', 'Fear & Greed · VIX · Stress Meter', 'Congress & insider flow data'],
      accentHex: 0xFFFF4D6A,
    ),
  ];

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hasSeenOnboarding', true);
    if (mounted) context.go('/auth');
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
    required this.emoji,
    required this.title,
    required this.body,
    required this.bullets,
    required this.accentHex,
  });
  final String emoji;
  final String title;
  final String body;
  final List<String> bullets;
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
          // Large emoji in a tinted glow circle
          Container(
            width: 112,
            height: 112,
            decoration: BoxDecoration(
              color: accent.withAlpha(22),
              shape: BoxShape.circle,
              border: Border.all(color: accent.withAlpha(60), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: accent.withAlpha(30),
                  blurRadius: 32,
                  spreadRadius: 4,
                ),
              ],
            ),
            child: Center(
              child: Text(slide.emoji, style: const TextStyle(fontSize: 52)),
            ),
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
            style: AppTypography.md.copyWith(color: c.textSecondary, height: 1.55),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.s6),
          // Feature bullet chips
          Wrap(
            spacing: AppSpacing.s2,
            runSpacing: AppSpacing.s2,
            alignment: WrapAlignment.center,
            children: slide.bullets.map((b) => Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s1),
              decoration: BoxDecoration(
                color: accent.withAlpha(16),
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(color: accent.withAlpha(45)),
              ),
              child: Text(
                b,
                style: AppTypography.sm.copyWith(
                  color: accent,
                  fontWeight: FontWeight.w500,
                ),
              ),
            )).toList(),
          ),
        ],
      ),
    );
  }
}
