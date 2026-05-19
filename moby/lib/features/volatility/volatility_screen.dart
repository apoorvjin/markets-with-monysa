import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/repositories/volatility_repository.dart';
import '../../data/repositories/markets_repository.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/sparkline_chart.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _volAssetsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
        (_) => VolatilityRepository.instance.fetchAssets());

final _briefingProvider = FutureProvider.autoDispose<String>((ref) async {
  final assets = await ref.watch(_volAssetsProvider.future);
  final vixMap = assets['vix'] as Map<String, dynamic>?;
  final items = (assets['items'] as List? ?? []).cast<Map<String, dynamic>>();
  num? pct1M(String sym) =>
      items.firstWhere((a) => a['symbol'] == sym, orElse: () => {})['changePercent1M'] as num?;
  return VolatilityRepository.instance.fetchBriefing({
    'vix': (vixMap?['price'] as num?)?.toDouble(),
    'vixBand': vixMap?['band'] as String?,
    'goldPct1M': pct1M('GC=F')?.toDouble(),
    'oilPct1M': pct1M('CL=F')?.toDouble(),
    'dxyPct1M': pct1M('DX-Y.NYB')?.toDouble(),
  });
});

final _bondsProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (_) => MarketsRepository.instance.fetchBonds());

// ── Screen ────────────────────────────────────────────────────────────────────

class VolatilityScreen extends ConsumerWidget {
  const VolatilityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_volAssetsProvider);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Volatility',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        actions: const [ThemeToggleButton()],
      ),
      body: async.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: c.accent)),
        error: (e, _) => ErrorView(
          message: 'Failed to load volatility data',
          onRetry: () => ref.invalidate(_volAssetsProvider),
        ),
        data: (data) {
          final vixMap = data['vix'] as Map<String, dynamic>?;
          final vix = (vixMap?['price'] as num?)?.toDouble() ?? 20.0;
          final assets = (data['items'] as List? ?? [])
              .cast<Map<String, dynamic>>();

          return RefreshIndicator(
            color: c.accent,
            backgroundColor: c.surface,
            onRefresh: () async {
              ref.invalidate(_volAssetsProvider);
              ref.invalidate(_briefingProvider);
            },
            child: MaxWidthLayout(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.s5),
                children: [
                  _MacroRegimePanel(vixPrice: vix),
                  const SizedBox(height: AppSpacing.s3),
                  _StressMeter(vix: vix),
                  const SizedBox(height: AppSpacing.s5),
                  _VixGauge(vix: vix),
                  const SizedBox(height: AppSpacing.s5),
                  Text('Crisis-Response Assets',
                      style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                  const SizedBox(height: AppSpacing.s3),
                  ...assets.map((a) => _CrisisAssetCard(data: a)),
                  const SizedBox(height: AppSpacing.s5),
                  const _BondYieldsSection(),
                  const SizedBox(height: AppSpacing.s5),
                  const _GeopoliticalChain(),
                  const SizedBox(height: AppSpacing.s5),
                  const _HistoricalPlaybook(),
                  const SizedBox(height: AppSpacing.s5),
                  const _AiBriefingCard(),
                  const SizedBox(height: AppSpacing.s5),
                  const _EconomicCalendar(),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Stress Meter ──────────────────────────────────────────────────────────────

class _StressMeter extends StatelessWidget {
  const _StressMeter({required this.vix});
  final double vix;

  String get _label {
    if (vix < 15) return 'Low';
    if (vix < 25) return 'Moderate';
    if (vix < 35) return 'High';
    return 'Extreme';
  }

  Color _color(AppPalette c) {
    if (vix < 15) return c.positive;
    if (vix < 25) return c.warning;
    if (vix < 35) return const Color(0xFFFF8C42);
    return c.danger;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = _color(c);
    return GlassCard(
      child: Column(
        children: [
          Row(
            children: [
              Icon(Icons.speed, color: c.accent, size: 20),
              const SizedBox(width: AppSpacing.s3),
              Text('Market Stress Meter',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s5),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                _label,
                style: AppTypography.xl3.copyWith(
                    color: color, fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: AppSpacing.s3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withAlpha(30),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text(
                  'VIX ${vix.toStringAsFixed(1)}',
                  style: AppTypography.sm
                      .copyWith(color: color, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          // Stress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: min(vix / 50, 1.0),
              backgroundColor: c.border,
              valueColor: AlwaysStoppedAnimation(color),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Low', style: TextStyle(color: c.textMuted, fontSize: 10)),
              Text('Moderate', style: TextStyle(color: c.textMuted, fontSize: 10)),
              Text('High', style: TextStyle(color: c.textMuted, fontSize: 10)),
              Text('Extreme', style: TextStyle(color: c.textMuted, fontSize: 10)),
            ],
          ),
        ],
      ),
    );
  }
}

// ── VIX Gauge ─────────────────────────────────────────────────────────────────

class _VixGauge extends StatelessWidget {
  const _VixGauge({required this.vix});
  final double vix;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('VIX Index',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          Row(
            children: [
              Text(
                vix.toStringAsFixed(2),
                style: AppTypography.xl4.copyWith(
                    fontWeight: FontWeight.w800,
                    color: c.textPrimary,
                    fontFeatures: [const FontFeature.tabularFigures()]),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _Band('< 15', 'Normal', c.positive),
                  _Band('15–25', 'Elevated', c.warning),
                  const _Band('25–35', 'High', Color(0xFFFF8C42)),
                  _Band('> 35', 'Extreme', c.danger),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Band extends StatelessWidget {
  const _Band(this.range, this.label, this.color);
  final String range;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 8, height: 8, color: color),
        const SizedBox(width: 4),
        Text('$range — $label',
            style: AppTypography.xs.copyWith(color: c.textMuted)),
      ],
    );
  }
}

// ── Crisis Asset Card ─────────────────────────────────────────────────────────

class _CrisisAssetCard extends StatelessWidget {
  const _CrisisAssetCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final name = data['name'] as String? ?? '';
    final symbol = data['symbol'] as String? ?? '';
    final sparkline = (data['sparkline'] as List? ?? [])
        .map((v) => (v as num).toDouble())
        .toList();
    final perf1w = (data['changePercent1W'] as num?)?.toDouble();
    final perf1m = (data['changePercent1M'] as num?)?.toDouble();
    final perf3m = (data['changePercent3M'] as num?)?.toDouble();

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary)),
                Text(symbol,
                    style: AppTypography.sm
                        .copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s3),
                Row(
                  children: [
                    _PerfBadge('1W', perf1w),
                    const SizedBox(width: AppSpacing.s2),
                    _PerfBadge('1M', perf1m),
                    const SizedBox(width: AppSpacing.s2),
                    _PerfBadge('3M', perf3m),
                  ],
                ),
              ],
            ),
          ),
          if (sparkline.isNotEmpty) SparklineChart(data: sparkline),
        ],
      ),
    );
  }
}

class _PerfBadge extends StatelessWidget {
  const _PerfBadge(this.label, this.value);
  final String label;
  final double? value;

  @override
  Widget build(BuildContext context) {
    if (value == null) return const SizedBox.shrink();
    final c = context.colors;
    final isUp = value! >= 0;
    final color = isUp ? c.positive : c.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '$label ${isUp ? '+' : ''}${value!.toStringAsFixed(1)}%',
        style: AppTypography.xs.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// ── Geopolitical Chain ────────────────────────────────────────────────────────

class _GeopoliticalChain extends StatelessWidget {
  const _GeopoliticalChain();

  static const _phases = [
    (
      period: '0–48h',
      title: 'Immediate Shock',
      events: ['Safe havens spike (Gold, CHF, JPY)', 'Risk assets sell off',
          'VIX surges > 30'],
    ),
    (
      period: '1–4 weeks',
      title: 'Adjustment Phase',
      events: ['Supply chain rerouting begins', 'Energy prices reprice',
          'Central bank positioning'],
    ),
    (
      period: '1–6 months',
      title: 'Structural Shift',
      events: ['Sector rotation complete', 'New equilibrium established',
          'Policy responses priced in'],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.timeline, color: c.warning, size: 20),
              const SizedBox(width: AppSpacing.s3),
              Text('Geopolitical Chain of Events',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          ..._phases.map((phase) => _PhaseCard(phase: phase)),
        ],
      ),
    );
  }
}

class _PhaseCard extends StatelessWidget {
  const _PhaseCard({required this.phase});
  final ({String period, String title, List<String> events}) phase;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: c.accentDim,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: c.accent.withAlpha(40)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: c.accent.withAlpha(50),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text(phase.period,
                    style: AppTypography.xs.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: AppSpacing.s3),
              Text(phase.title,
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          ...phase.events.map((e) => Text('• $e',
              style: AppTypography.sm.copyWith(color: c.textSecondary))),
        ],
      ),
    );
  }
}

// ── Historical Playbook ───────────────────────────────────────────────────────

class _HistoricalPlaybook extends StatelessWidget {
  const _HistoricalPlaybook();

  static const _crises = [
    (name: '2008 GFC', vix: 89.5, outcome: 'S&P -57%, Gold +25%'),
    (name: 'COVID 2020', vix: 85.5, outcome: 'S&P -34%, BTC -65% then +1000%'),
    (name: '1973 Oil Crisis', vix: 0.0, outcome: 'S&P -48%, Oil +400%'),
    (name: 'Ukraine 2022', vix: 38.9, outcome: 'Oil +80%, Wheat +60%'),
    (name: 'Euro Crisis 2012', vix: 48.2, outcome: 'EUR -25%, PIIGS bonds spiked'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Historical Crisis Playbook',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        const SizedBox(height: AppSpacing.s3),
        ..._crises.map((crisis) => Container(
              margin: const EdgeInsets.only(bottom: AppSpacing.s3),
              padding: const EdgeInsets.all(AppSpacing.s4),
              decoration: BoxDecoration(
                color: c.surfaceCard,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(crisis.name,
                            style: AppTypography.labelLg.copyWith(color: c.textPrimary)),
                        Text(crisis.outcome,
                            style: AppTypography.sm.copyWith(
                                color: c.textSecondary)),
                      ],
                    ),
                  ),
                  if (crisis.vix > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: c.dangerDim,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                      ),
                      child: Text(
                        'VIX ${crisis.vix.toStringAsFixed(0)}',
                        style: AppTypography.xs.copyWith(
                            color: c.danger,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            )),
      ],
    );
  }
}

// ── AI Briefing ───────────────────────────────────────────────────────────────

class _AiBriefingCard extends ConsumerWidget {
  const _AiBriefingCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_briefingProvider);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: c.accentDim,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Icon(Icons.auto_awesome,
                    color: c.accent, size: 16),
              ),
              const SizedBox(width: AppSpacing.s3),
              Text('AI Market Briefing',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          async.when(
            loading: () => Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: CircularProgressIndicator(color: c.accent),
              ),
            ),
            error: (_, __) => Text(
              'AI briefing unavailable.',
              style: AppTypography.md.copyWith(color: c.textMuted),
            ),
            data: (briefing) => Text(
              briefing.isEmpty
                  ? 'No briefing available at this time.'
                  : briefing,
              style: AppTypography.lg.copyWith(color: c.textSecondary, height: 1.6),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Macro Regime Panel ────────────────────────────────────────────────────────

class _MacroRegimePanel extends ConsumerWidget {
  const _MacroRegimePanel({required this.vixPrice});
  final double? vixPrice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final bondsAsync = ref.watch(_bondsProvider);

    return bondsAsync.maybeWhen(
      data: (bonds) {
        final curveStatus = bonds['curveStatus'] as String? ?? 'normal';
        final vix = vixPrice ?? 0;

        final String regime;
        final Color regimeColor;
        final String regimeDesc;

        if (vix >= 30 && curveStatus == 'inverted') {
          regime = 'Risk-Off / Recession Fear';
          regimeColor = c.danger;
          regimeDesc = 'High volatility + inverted curve — defensive positioning favored';
        } else if (vix >= 25) {
          regime = 'Elevated Risk';
          regimeColor = c.warning;
          regimeDesc = 'Market stress elevated — reduce leverage, favor safe havens';
        } else if (curveStatus == 'inverted') {
          regime = 'Late Cycle';
          regimeColor = c.warning;
          regimeDesc = 'Inverted curve signals potential slowdown — watch credit spreads';
        } else if (vix < 15 && curveStatus == 'normal') {
          regime = 'Risk-On / Expansion';
          regimeColor = c.positive;
          regimeDesc = 'Low vol + normal curve — growth assets and cyclicals favored';
        } else {
          regime = 'Transitional';
          regimeColor = c.accent;
          regimeDesc = 'Mixed signals — monitor for regime shift';
        }

        return Container(
          margin: const EdgeInsets.symmetric(
              horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
          padding: const EdgeInsets.all(AppSpacing.s4),
          decoration: BoxDecoration(
            color: regimeColor.withAlpha(20),
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: regimeColor.withAlpha(80)),
          ),
          child: Row(
            children: [
              Icon(Icons.analytics_outlined, color: regimeColor, size: 20),
              const SizedBox(width: AppSpacing.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Market Regime',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                    Text(regime,
                        style: AppTypography.labelMd.copyWith(
                            color: regimeColor, fontWeight: FontWeight.w700)),
                    Text(regimeDesc,
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

void _showYieldCurveInfo(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, AppSpacing.s8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('Understanding the Yield Curve',
              style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'The yield curve plots US Treasury bond yields across maturities — '
            'from 3-month bills to 30-year bonds. It is one of the most reliable leading '
            'indicators of economic health.',
            style: AppTypography.sm.copyWith(color: c.textSecondary),
          ),
          const SizedBox(height: AppSpacing.s5),
          _YieldCurveInfoRow(
            icon: Icons.trending_up_rounded,
            color: c.positive,
            title: 'Normal (upward sloping)',
            description: 'Long-term bonds yield more than short-term. '
                'Signals a healthy, growing economy with inflation expectations.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _YieldCurveInfoRow(
            icon: Icons.remove_rounded,
            color: c.warning,
            title: 'Flat',
            description: 'Short and long yields are similar. '
                'Signals economic uncertainty — often a transition between normal and inverted.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _YieldCurveInfoRow(
            icon: Icons.trending_down_rounded,
            color: c.danger,
            title: 'Inverted (danger signal)',
            description: 'Short-term yields exceed long-term yields. '
                'Has preceded every US recession in the last 50 years. Watch the 3M-10Y spread.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.accent.withAlpha(50)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('How to Read the 3M-10Y Spread',
                    style: AppTypography.labelSm
                        .copyWith(color: c.accent, fontWeight: FontWeight.w700)),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'Positive spread → 10Y yields more than 3M → normal, growth-friendly\n'
                  'Negative spread → 3M yields more than 10Y → inverted, recession watch\n'
                  'Rule of thumb: inversion sustained >3 months = high-alert',
                  style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.6),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _YieldCurveInfoRow extends StatelessWidget {
  const _YieldCurveInfoRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: color.withAlpha(30),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: AppSpacing.s4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTypography.labelSm.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(description,
                  style: AppTypography.sm.copyWith(color: c.textSecondary)),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Bond Yields Section ───────────────────────────────────────────────────────

class _BondYieldsSection extends ConsumerWidget {
  const _BondYieldsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_bondsProvider);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Yield Curve',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(width: AppSpacing.s2),
              GestureDetector(
                onTap: () => _showYieldCurveInfo(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 16, color: c.textMuted),
              ),
              const Spacer(),
              async.maybeWhen(
                data: (data) {
                  final status = data['curveStatus'] as String? ?? 'normal';
                  final Color color;
                  final String label;
                  switch (status) {
                    case 'inverted':
                      label = 'Inverted';
                      color = c.danger;
                      break;
                    case 'flat':
                      label = 'Flat';
                      color = c.warning;
                      break;
                    default:
                      label = 'Normal';
                      color = c.positive;
                  }
                  return Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: color.withAlpha(30),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: color.withAlpha(80)),
                    ),
                    child: Text(label,
                        style: AppTypography.xs.copyWith(
                            color: color, fontWeight: FontWeight.w700)),
                  );
                },
                orElse: () => const SizedBox.shrink(),
              ),
            ],
          ),
          const SizedBox(height: 16),
          async.when(
            loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
            error: (_, __) => Text('Failed to load',
                style: AppTypography.sm.copyWith(color: c.textMuted)),
            data: (data) {
              final yields = [
                ('3M', data['us3m']),
                ('5Y', data['us5y']),
                ('10Y', data['us10y']),
                ('30Y', data['us30y']),
              ];
              final spread =
                  (data['spread3m10y'] as num?)?.toDouble();
              final spreadColor =
                  (spread ?? 0) >= 0 ? c.positive : c.danger;

              return Column(
                children: [
                  ...yields.map((y) {
                    final rate = (y.$2 as num?)?.toDouble() ?? 0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 32,
                            child: Text(y.$1,
                                style: AppTypography.sm
                                    .copyWith(color: c.textMuted)),
                          ),
                          Expanded(
                            child: LayoutBuilder(builder: (_, constraints) {
                              return Stack(
                                children: [
                                  Container(
                                    height: 6,
                                    decoration: BoxDecoration(
                                      color: c.border,
                                      borderRadius: BorderRadius.circular(3),
                                    ),
                                  ),
                                  Container(
                                    height: 6,
                                    width: constraints.maxWidth *
                                        (rate / 7.0).clamp(0.0, 1.0),
                                    decoration: BoxDecoration(
                                      color: c.accent,
                                      borderRadius: BorderRadius.circular(3),
                                    ),
                                  ),
                                ],
                              );
                            }),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 48,
                            child: Text(
                              '${rate.toStringAsFixed(2)}%',
                              textAlign: TextAlign.right,
                              style: AppTypography.sm.copyWith(
                                  color: c.textPrimary,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                  if (spread != null)
                    Row(
                      children: [
                        Text('3M-10Y Spread: ',
                            style:
                                AppTypography.sm.copyWith(color: c.textMuted)),
                        Text(
                          '${spread >= 0 ? '+' : ''}${spread.toStringAsFixed(2)}%',
                          style: AppTypography.sm.copyWith(
                              color: spreadColor, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Economic Calendar ─────────────────────────────────────────────────────────

class _CalEvent {
  const _CalEvent(this.date, this.title, this.impact, this.category);
  final String date;
  final String title;
  final String impact; // 'High' | 'Medium'
  final String category; // 'Fed' | 'Inflation' | 'Jobs' | 'Earnings'
}

const _kCalEvents = [
  _CalEvent('Jun 11', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Jun 17-18', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Jun 18', 'Fed Press Conference (Powell)', 'High', 'Fed'),
  _CalEvent('Jul 3', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Jul 9', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Jul 29-30', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Aug 1', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Aug 13', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Aug 21-23', 'Jackson Hole Symposium', 'High', 'Fed'),
  _CalEvent('Sep 5', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Sep 10', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Sep 16-17', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Oct 3', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Oct 14', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Oct 28-29', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
]; // Dates are indicative — verify against federalreserve.gov for exact schedule

class _EconomicCalendar extends StatelessWidget {
  const _EconomicCalendar();

  Color _categoryDot(String category, AppPalette c) {
    switch (category) {
      case 'Fed':
        return c.accent;
      case 'Inflation':
        return c.warning;
      case 'Jobs':
        return c.positive;
      default:
        return const Color(0xFFA78BFA);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.calendar_month_rounded, color: c.accent, size: 20),
            const SizedBox(width: AppSpacing.s3),
            Text('Economic Calendar',
                style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            const Spacer(),
            Text('indicative dates',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
          ],
        ),
        const SizedBox(height: AppSpacing.s3),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: _kCalEvents.map((event) {
              final isHigh = event.impact == 'High';
              final impactBg = isHigh ? c.dangerDim : c.warningDim;
              final impactColor = isHigh ? c.danger : c.warning;
              final dotColor = _categoryDot(event.category, c);

              return Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                decoration: BoxDecoration(
                  border: Border(
                      bottom: BorderSide(
                          color: c.border.withAlpha(80), width: 0.5)),
                ),
                child: Row(
                  children: [
                    // Category dot
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(right: AppSpacing.s3),
                      decoration: BoxDecoration(
                        color: dotColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    // Date
                    SizedBox(
                      width: 72,
                      child: Text(
                        event.date,
                        style: AppTypography.sm.copyWith(
                          color: c.accent,
                          fontFeatures: [const FontFeature.tabularFigures()],
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    // Title
                    Expanded(
                      child: Text(
                        event.title,
                        style: AppTypography.sm.copyWith(color: c.textPrimary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    // Impact badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: impactBg,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        event.impact,
                        style: AppTypography.xs.copyWith(
                            color: impactColor, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
