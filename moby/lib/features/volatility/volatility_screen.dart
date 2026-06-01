import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/models/heatmap_data.dart';
import '../../data/repositories/volatility_repository.dart';
import '../../data/repositories/markets_repository.dart';
import '../../data/repositories/heatmap_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/sparkline_chart.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/performance_heatmap.dart';
import '../../shared/widgets/upgrade_sheet.dart';
import '../../shared/widgets/theme_toggle.dart';
import '../usa_debt/usa_debt_screen.dart';

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


final _crisesProvider = FutureProvider.autoDispose<
    ({List<CrisisEvent> crises, String dataAsOf})>(
  (_) => VolatilityRepository.instance.fetchCrises(),
);

// Not autoDispose: fetching heatmap data is expensive (72–240 Yahoo Finance
// requests). Disposing on category switch then re-watching restarts the fetch,
// which compounds with the retry interceptor into a request storm.
final _heatmapProvider = FutureProvider<HeatmapData>(
    (_) => HeatmapRepository.instance.fetchHeatmap());

final _assetsProvider = FutureProvider.family<List<HeatmapTile>, String>(
    (_, category) => HeatmapRepository.instance.fetchAssets(category));

final _sectorsHeatmapProvider =
    FutureProvider<List<HeatmapTile>>((ref) async {
  final raw = await MarketsRepository.instance.fetchSectors();
  return raw
      .map((s) => HeatmapTile(
            name: s['name'] as String? ?? '',
            emoji: s['emoji'] as String? ?? '',
            changePercent: (s['changePercent'] as num?)?.toDouble(),
            perf1W: (s['perf1W'] as num?)?.toDouble(),
            perf1M: (s['perf1M'] as num?)?.toDouble(),
            perf3M: (s['perf3M'] as num?)?.toDouble(),
            perf6M: (s['perf6M'] as num?)?.toDouble(),
            perf1Y: (s['perf1Y'] as num?)?.toDouble(),
            perf3Y: (s['perf3Y'] as num?)?.toDouble(),
            perf5Y: (s['perf5Y'] as num?)?.toDouble(),
          ))
      .toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class MacroScreen extends ConsumerStatefulWidget {
  const MacroScreen({super.key});

  @override
  ConsumerState<MacroScreen> createState() => _MacroScreenState();
}

class _MacroScreenState extends ConsumerState<MacroScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Pre-warm so crisis fetch runs in parallel with market data, not after.
    ref.watch(_crisesProvider);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Macro',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        actions: const [ThemeToggleButton()],
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: c.accent,
          unselectedLabelColor: c.textMuted,
          indicatorColor: c.accent,
          labelStyle:
              AppTypography.labelSm.copyWith(fontWeight: FontWeight.w600),
          unselectedLabelStyle: AppTypography.labelSm,
          tabs: const [
            Tab(text: 'Dashboard'),
            Tab(text: 'Crisis'),
            Tab(text: 'Debt'),
            Tab(text: 'Calendar'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [
          _MacroDashboardTab(),
          _MacroCrisisTab(),
          UsaDebtBody(),
          _MacroCalendarTab(),
        ],
      ),
    );
  }
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

class _MacroDashboardTab extends ConsumerWidget {
  const _MacroDashboardTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_volAssetsProvider);

    return async.when(
      loading: () => const ShimmerList(count: 6, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load volatility data',
        onRetry: () => ref.invalidate(_volAssetsProvider),
      ),
      data: (data) {
        final vixMap = data['vix'] as Map<String, dynamic>?;
        final vix = (vixMap?['price'] as num?)?.toDouble() ?? 20.0;

        return RefreshIndicator(
          color: c.accent,
          backgroundColor: c.surface,
          onRefresh: () async {
            HeatmapRepository.instance.invalidateCache();
            MarketsRepository.instance.invalidateSectorsCache();
            ref.invalidate(_volAssetsProvider);
            ref.invalidate(_briefingProvider);
            ref.invalidate(_heatmapProvider);
            ref.invalidate(_assetsProvider);
            ref.invalidate(_sectorsHeatmapProvider);
          },
          child: MaxWidthLayout(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.s5,
                AppSpacing.s5,
                AppSpacing.s5,
                AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
              ),
              children: [
                _MacroRegimePanel(vixPrice: vix),
                const SizedBox(height: AppSpacing.s3),
                // VIX gauge and Stress Meter side by side
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _VixGauge(vix: vix)),
                      const SizedBox(width: AppSpacing.s3),
                      Expanded(child: _StressMeter(vix: vix)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.s5),
                const _MarketHeatmapSection(),
                const SizedBox(height: AppSpacing.s5),
                const _BondYieldsSection(),
                const SizedBox(height: AppSpacing.s5),
                const _AiBriefingCard(),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ── Crisis Tab ────────────────────────────────────────────────────────────────

class _MacroCrisisTab extends ConsumerStatefulWidget {
  const _MacroCrisisTab();

  @override
  ConsumerState<_MacroCrisisTab> createState() => _MacroCrisisTabState();
}

class _MacroCrisisTabState extends ConsumerState<_MacroCrisisTab>
    with SingleTickerProviderStateMixin {
  late final TabController _crisisTab;

  @override
  void initState() {
    super.initState();
    _crisisTab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _crisisTab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        TabBar(
          controller: _crisisTab,
          labelColor: c.accent,
          unselectedLabelColor: c.textMuted,
          indicatorColor: c.accent,
          labelStyle:
              AppTypography.labelSm.copyWith(fontWeight: FontWeight.w600),
          unselectedLabelStyle: AppTypography.labelSm,
          tabs: const [
            Tab(text: 'Crisis Playbook'),
            Tab(text: 'Crisis Assets'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _crisisTab,
            children: const [
              _CrisisPlaybookTab(),
              _CrisisAssetsTab(),
            ],
          ),
        ),
      ],
    );
  }
}

class _CrisisPlaybookTab extends StatelessWidget {
  const _CrisisPlaybookTab();

  @override
  Widget build(BuildContext context) {
    return MaxWidthLayout(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: const [
          _HistoricalPlaybook(),
        ],
      ),
    );
  }
}

class _CrisisAssetsTab extends ConsumerWidget {
  const _CrisisAssetsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_volAssetsProvider);

    return async.when(
      loading: () => const ShimmerList(count: 4, type: ShimmerRowType.signal),
      error: (_, __) => ErrorView(
        message: 'Failed to load crisis assets',
        onRetry: () => ref.invalidate(_volAssetsProvider),
      ),
      data: (data) {
        final assets = (data['items'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        final lastUpdated = data['lastUpdated'] as String?;

        return MaxWidthLayout(
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.s5,
              AppSpacing.s5,
              AppSpacing.s5,
              AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
            ),
            children: [
              Row(
                children: [
                  Icon(Icons.shield_outlined, color: c.warning, size: 20),
                  const SizedBox(width: AppSpacing.s3),
                  Text('Crisis-Response Assets',
                      style: AppTypography.headingSm
                          .copyWith(color: c.textPrimary)),
                ],
              ),
              if (lastUpdated != null) ...[
                const SizedBox(height: AppSpacing.s2),
                FreshnessBar(lastUpdated: lastUpdated),
              ],
              const SizedBox(height: AppSpacing.s3),
              ...assets.map((a) => _CrisisAssetCard(data: a)),
              const SizedBox(height: AppSpacing.s5),
              const _GeopoliticalChain(),
            ],
          ),
        );
      },
    );
  }
}

// ── Calendar Tab ──────────────────────────────────────────────────────────────

class _MacroCalendarTab extends StatelessWidget {
  const _MacroCalendarTab();

  @override
  Widget build(BuildContext context) {
    return MaxWidthLayout(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: const [
          _EconomicCalendar(),
        ],
      ),
    );
  }
}

// ── Market Performance Heatmap ────────────────────────────────────────────────

enum _HeatmapCategory { sectors, regions, assetClasses, assets }

class _MarketHeatmapSection extends ConsumerStatefulWidget {
  const _MarketHeatmapSection();

  @override
  ConsumerState<_MarketHeatmapSection> createState() =>
      _MarketHeatmapSectionState();
}

class _MarketHeatmapSectionState extends ConsumerState<_MarketHeatmapSection> {
  _HeatmapCategory _category = _HeatmapCategory.sectors;
  String _assetSub = 'Indices'; // sub-filter for Assets view

  Widget _categoryChip(String label, bool isActive, AppPalette c,
      VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: isActive ? c.accent.withAlpha(25) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
            color: isActive ? c.accent : c.border,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: AppTypography.labelSm.copyWith(
            color: isActive ? c.accent : c.textSecondary,
            fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    // Sectors and regions/assetClasses share providers — watch unconditionally
    // so both fetch in parallel on first render.
    final sectorsAsync = ref.watch(_sectorsHeatmapProvider);
    final heatmapAsync = ref.watch(_heatmapProvider);

    List<HeatmapTile>? tiles;
    bool isLoading = false;
    bool hasError = false;

    switch (_category) {
      case _HeatmapCategory.sectors:
        sectorsAsync.when(
          data: (d) => tiles = d,
          loading: () => isLoading = true,
          error: (_, __) => hasError = true,
        );
      case _HeatmapCategory.regions:
        heatmapAsync.when(
          data: (d) => tiles = d.regions,
          loading: () => isLoading = true,
          error: (_, __) => hasError = true,
        );
      case _HeatmapCategory.assetClasses:
        heatmapAsync.when(
          data: (d) => tiles = d.assetClasses,
          loading: () => isLoading = true,
          error: (_, __) => hasError = true,
        );
      case _HeatmapCategory.assets:
        // Only the active sub-category is watched — others load on first tap.
        ref.watch(_assetsProvider(_assetSub)).when(
          data: (d) => tiles = d,
          loading: () => isLoading = true,
          error: (_, __) => hasError = true,
        );
    }

    const mainCategories = [
      (_HeatmapCategory.sectors, 'Sectors'),
      (_HeatmapCategory.regions, 'Regions'),
      (_HeatmapCategory.assetClasses, 'Asset Classes'),
      (_HeatmapCategory.assets, 'Assets'),
    ];

    const assetSubs = ['Indices', 'Commodities', 'Crypto'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Market Performance',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary),
        ),
        const SizedBox(height: AppSpacing.s3),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: mainCategories.map((cat) {
              final (category, label) = cat;
              return _categoryChip(label, _category == category, c,
                  () => setState(() => _category = category));
            }).toList(),
          ),
        ),
        if (_category == _HeatmapCategory.assets) ...[
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: assetSubs.map((sub) {
                return _categoryChip(sub, _assetSub == sub, c,
                    () => setState(() => _assetSub = sub));
              }).toList(),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.s3),
        if (isLoading)
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: CircularProgressIndicator(color: c.accent, strokeWidth: 2),
            ),
          )
        else if (hasError || tiles == null || tiles!.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              'Unable to load performance data',
              style: AppTypography.sm.copyWith(color: c.textMuted),
            ),
          )
        else
          PerformanceHeatmap(tiles: tiles!),
      ],
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
      blur: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.speed, color: c.accent, size: 16),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Stress Meter',
                    style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          Text(
            _label,
            style: AppTypography.xl2.copyWith(
                color: color, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: AppSpacing.s2),
          // Gradient stress bar
          LayoutBuilder(builder: (_, constraints) {
            final fill = min(vix / 50, 1.0);
            return Stack(
              children: [
                Container(
                  height: 10,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(5),
                  ),
                ),
                ClipRRect(
                  borderRadius: BorderRadius.circular(5),
                  child: Container(
                    height: 10,
                    width: constraints.maxWidth * fill,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [c.positive, c.warning, const Color(0xFFFF8C42), c.danger],
                        stops: const [0.0, 0.4, 0.7, 1.0],
                      ),
                    ),
                  ),
                ),
              ],
            );
          }),
          const SizedBox(height: AppSpacing.s2),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Low', style: TextStyle(color: c.textMuted, fontSize: 9)),
              Text('High', style: TextStyle(color: c.textMuted, fontSize: 9)),
              Text('Extreme', style: TextStyle(color: c.textMuted, fontSize: 9)),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: color.withAlpha(30),
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
            child: Text(
              'VIX ${vix.toStringAsFixed(1)}',
              style: AppTypography.xs
                  .copyWith(color: color, fontWeight: FontWeight.w700),
            ),
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
      blur: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.show_chart_rounded, color: c.accent, size: 16),
              const SizedBox(width: AppSpacing.s2),
              Text('VIX Index',
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          // Semicircular arc gauge
          Center(
            child: SizedBox(
              height: 80,
              child: CustomPaint(
                painter: _ArcGaugePainter(
                  value: min(vix / 50, 1.0),
                  trackColor: c.border,
                  lowColor: c.positive,
                  midColor: c.warning,
                  highColor: const Color(0xFFFF8C42),
                  extremeColor: c.danger,
                ),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 32),
                    child: Text(
                      vix.toStringAsFixed(2),
                      style: AppTypography.xl2.copyWith(
                          fontWeight: FontWeight.w800,
                          color: c.textPrimary,
                          fontFeatures: [const FontFeature.tabularFigures()]),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Band('< 15', 'Normal', c.positive),
              _Band('15–25', 'Elevated', c.warning),
              const _Band('25–35', 'High', Color(0xFFFF8C42)),
              _Band('> 35', 'Extreme', c.danger),
            ],
          ),
        ],
      ),
    );
  }
}

class _ArcGaugePainter extends CustomPainter {
  const _ArcGaugePainter({
    required this.value,
    required this.trackColor,
    required this.lowColor,
    required this.midColor,
    required this.highColor,
    required this.extremeColor,
  });

  final double value;
  final Color trackColor;
  final Color lowColor;
  final Color midColor;
  final Color highColor;
  final Color extremeColor;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height - 4;
    final radius = min(cx, cy) - 8;
    final strokeW = 10.0;

    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: radius);

    // Track (background)
    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeW
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, pi, pi, false, trackPaint);

    // Gradient fill arc
    if (value > 0) {
      final gradient = SweepGradient(
        startAngle: pi,
        endAngle: 2 * pi,
        colors: [lowColor, midColor, highColor, extremeColor],
        stops: const [0.0, 0.4, 0.7, 1.0],
      );
      final fillPaint = Paint()
        ..shader = gradient.createShader(rect)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeW
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, pi, pi * value, false, fillPaint);
    }
  }

  @override
  bool shouldRepaint(_ArcGaugePainter old) => old.value != value;
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

    final leftColor = (perf1m ?? 0) >= 0 ? c.positive : c.danger;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border(
          left: BorderSide(color: leftColor, width: 3),
          top: BorderSide(color: c.border, width: 0.5),
          right: BorderSide(color: c.border, width: 0.5),
          bottom: BorderSide(color: c.border, width: 0.5),
        ),
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
      period: '0–72h',
      title: 'Shock Response',
      events: [
        'Safe havens surge — Gold, US Treasuries (TLT), CHF, JPY',
        'Algorithmic selling across equities; bid-ask spreads widen sharply',
        'VIX spikes above 30; put/call ratio spikes — hedging demand surges',
        'Oil reprices instantly on supply disruption fears',
        'Dollar strengthens as global capital seeks USD-denominated safety',
      ],
    ),
    (
      period: '1–6 weeks',
      title: 'Repricing & Sector Rotation',
      events: [
        'Central bank emergency statements; potential unscheduled rate cuts',
        'Corporate earnings guidance cuts begin; analyst downgrades',
        'Defense, energy, gold miners benefit; travel, tech, consumer discretionary fall',
        'FX markets reprice geopolitical risk premium — EM currencies weaken',
        'Commodities stabilize or extend based on conflict scope and sanctions',
        'Credit spreads widen; high-yield bonds underperform',
      ],
    ),
    (
      period: '2–12 months',
      title: 'Structural Realignment',
      events: [
        'Supply chain diversification accelerates; trade routes reconfigured',
        'Fiscal stimulus, sanctions regimes, and aid packages fully priced in',
        'Inflation outlook shifts — central bank pivot or acceleration',
        'Equity markets find a new equilibrium; earnings expectations reset',
        'Structural beneficiaries emerge (defense, domestic energy, nearshoring)',
        'EM markets either decouple or remain pressured based on contagion',
      ],
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

class _HistoricalPlaybook extends ConsumerWidget {
  const _HistoricalPlaybook();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final result = ref.watch(_crisesProvider).valueOrNull;
    final crises = result?.crises ?? kCrisisEvents;
    final dataAsOf = result?.dataAsOf ?? kCrisisDataAsOf;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.history_edu_rounded, color: c.danger, size: 20),
              const SizedBox(width: AppSpacing.s3),
              Text('Crisis Playbook',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          ...crises.map((e) => _CrisisCard(event: e)),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Data as of $dataAsOf',
            style: AppTypography.xs.copyWith(color: c.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _CrisisCard extends StatelessWidget {
  const _CrisisCard({required this.event});
  final CrisisEvent event;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    Color? statusColor;
    String? statusLabel;
    if (event.status == 'ongoing') {
      statusColor = c.danger;
      statusLabel = 'ONGOING';
    } else if (event.status == 'recent') {
      statusColor = c.warning;
      statusLabel = 'RECENT';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: event.status == 'ongoing'
              ? c.danger.withAlpha(80)
              : c.border.withAlpha(80),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(event.name,
                        style: AppTypography.headingSm.copyWith(
                            color: c.textPrimary,
                            fontWeight: FontWeight.w800)),
                    Text(event.period,
                        style: AppTypography.xs.copyWith(
                            color: c.textSecondary)),
                  ],
                ),
              ),
              if (statusLabel != null)
                Container(
                  margin: const EdgeInsets.only(left: AppSpacing.s2),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor!.withAlpha(30),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: statusColor.withAlpha(80)),
                  ),
                  child: Text(
                    statusLabel,
                    style: AppTypography.xs.copyWith(
                        color: statusColor, fontWeight: FontWeight.w700),
                  ),
                ),
              if (event.vixPeak > 0)
                Container(
                  margin: const EdgeInsets.only(left: AppSpacing.s2),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.dangerDim,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                  child: Text(
                    'VIX ${event.vixPeak.toStringAsFixed(0)}',
                    style: AppTypography.xs.copyWith(
                        color: c.danger, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(event.outcome,
              style: AppTypography.sm.copyWith(
                  color: c.textPrimary, fontWeight: FontWeight.w500)),
          const SizedBox(height: 3),
          Text(event.description,
              style: AppTypography.xs.copyWith(color: c.textSecondary)),
        ],
      ),
    );
  }
}


// ── AI Briefing ───────────────────────────────────────────────────────────────

class _AiBriefingCard extends ConsumerStatefulWidget {
  const _AiBriefingCard();

  @override
  ConsumerState<_AiBriefingCard> createState() => _AiBriefingCardState();
}

class _AiBriefingCardState extends ConsumerState<_AiBriefingCard> {
  bool _requested = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return GlassCard(
      blur: true,
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
                child: Icon(Icons.auto_awesome, color: c.accent, size: 16),
              ),
              const SizedBox(width: AppSpacing.s3),
              Text('AI Market Briefing',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          if (!_requested)
            GestureDetector(
              onTap: () {
                if (!EntitlementService.can('analyst_notes_unlimited')) {
                  UpgradeSheet.show(context,
                      feature: 'analyst_notes_unlimited');
                } else {
                  setState(() => _requested = true);
                }
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                decoration: BoxDecoration(
                  color: c.accentDim,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: c.accent.withAlpha(60)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.auto_awesome_rounded, size: 15, color: c.accent),
                    const SizedBox(width: AppSpacing.s2),
                    Text('Generate AI Briefing',
                        style: AppTypography.labelMd.copyWith(color: c.accent)),
                    if (!EntitlementService.can('analyst_notes_unlimited')) ...[
                      const SizedBox(width: AppSpacing.s2),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: c.accent,
                          borderRadius:
                              BorderRadius.circular(AppRadius.full),
                        ),
                        child: Text('Pro',
                            style: AppTypography.xs.copyWith(
                                color: Colors.black,
                                fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ],
                ),
              ),
            )
          else
            Builder(builder: (ctx) {
              final async = ref.watch(_briefingProvider);
              return async.when(
                loading: () => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: CircularProgressIndicator(color: c.accent),
                  ),
                ),
                error: (_, __) => GestureDetector(
                  onTap: () => ref.invalidate(_briefingProvider),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                    decoration: BoxDecoration(
                      color: c.dangerDim,
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      border: Border.all(color: c.danger.withAlpha(60)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.refresh_rounded, size: 15, color: c.danger),
                        const SizedBox(width: AppSpacing.s2),
                        Text('Try again',
                            style: AppTypography.labelMd
                                .copyWith(color: c.danger)),
                      ],
                    ),
                  ),
                ),
                data: (briefing) => Text(
                  briefing.isEmpty
                      ? 'No briefing available at this time.'
                      : briefing,
                  style: AppTypography.lg
                      .copyWith(color: c.textSecondary, height: 1.6),
                ),
              );
            }),
        ],
      ),
    );
  }
}

// ── Macro Regime Panel ────────────────────────────────────────────────────────

class _MacroRegimePanel extends ConsumerStatefulWidget {
  const _MacroRegimePanel({required this.vixPrice});
  final double? vixPrice;

  @override
  ConsumerState<_MacroRegimePanel> createState() => _MacroRegimePanelState();
}

class _MacroRegimePanelState extends ConsumerState<_MacroRegimePanel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bondsAsync = ref.watch(_bondsProvider);

    return bondsAsync.maybeWhen(
      data: (bonds) {
        final curveStatus = bonds['curveStatus'] as String? ?? 'normal';
        final vix = widget.vixPrice ?? 0;

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
            gradient: LinearGradient(
              colors: [regimeColor.withAlpha(30), regimeColor.withAlpha(8)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: regimeColor.withAlpha(80)),
          ),
          child: Row(
            children: [
              // Pulsing dot
              AnimatedBuilder(
                animation: _pulseAnim,
                builder: (_, __) => SizedBox(
                  width: 20,
                  height: 20,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: regimeColor.withAlpha(
                              (40 * _pulseAnim.value).round()),
                        ),
                      ),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: regimeColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
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
    builder: (_) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, AppSpacing.s5),
        child: Column(
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
                              final fillW = constraints.maxWidth *
                                  (rate / 7.0).clamp(0.0, 1.0);
                              return Stack(
                                children: [
                                  Container(
                                    height: 10,
                                    decoration: BoxDecoration(
                                      color: c.border,
                                      borderRadius: BorderRadius.circular(5),
                                    ),
                                  ),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(5),
                                    child: Container(
                                      height: 10,
                                      width: fillW,
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: [
                                            c.accent.withAlpha(180),
                                            c.accent,
                                          ],
                                        ),
                                      ),
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
                              style: AppTypography.labelSm.copyWith(
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
  final String category; // 'Fed' | 'Inflation' | 'Jobs' | 'GDP' | 'Other'
}

const _kCalEvents = [
  _CalEvent('Jun 11', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Jun 12', 'PPI (Producer Price Index)', 'Medium', 'Inflation'),
  _CalEvent('Jun 17-18', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Jun 18', 'Fed Press Conference (Powell)', 'High', 'Fed'),
  _CalEvent('Jun 26', 'GDP Q1 Final (3rd Estimate)', 'Medium', 'GDP'),
  _CalEvent('Jul 3', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Jul 9', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Jul 10', 'PPI (Producer Price Index)', 'Medium', 'Inflation'),
  _CalEvent('Jul 25', 'PCE Inflation (Fed Preferred)', 'High', 'Inflation'),
  _CalEvent('Jul 29-30', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Jul 30', 'GDP Q2 Advance (1st Estimate)', 'High', 'GDP'),
  _CalEvent('Aug 1', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Aug 12', 'JOLTS Job Openings', 'Medium', 'Jobs'),
  _CalEvent('Aug 13', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Aug 15', 'Retail Sales', 'Medium', 'Other'),
  _CalEvent('Aug 21-23', 'Jackson Hole Symposium', 'High', 'Fed'),
  _CalEvent('Aug 29', 'PCE Inflation (Fed Preferred)', 'High', 'Inflation'),
  _CalEvent('Sep 5', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Sep 10', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Sep 11', 'PPI (Producer Price Index)', 'Medium', 'Inflation'),
  _CalEvent('Sep 16-17', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Sep 26', 'PCE Inflation (Fed Preferred)', 'High', 'Inflation'),
  _CalEvent('Oct 3', 'Non-Farm Payrolls (Jobs)', 'High', 'Jobs'),
  _CalEvent('Oct 9', 'JOLTS Job Openings', 'Medium', 'Jobs'),
  _CalEvent('Oct 14', 'CPI Inflation Report', 'High', 'Inflation'),
  _CalEvent('Oct 16', 'Retail Sales', 'Medium', 'Other'),
  _CalEvent('Oct 28-29', 'FOMC Meeting & Rate Decision', 'High', 'Fed'),
  _CalEvent('Oct 30', 'GDP Q3 Advance (1st Estimate)', 'High', 'GDP'),
]; // Indicative dates — verify against federalreserve.gov for exact schedule

void _showCalendarInfo(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollCtrl) => ListView(
        controller: scrollCtrl,
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
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
          Text('Economic Calendar Guide',
              style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'These are the highest market-moving macro events watched by professional traders worldwide.',
            style: AppTypography.sm.copyWith(color: c.textSecondary),
          ),
          const SizedBox(height: AppSpacing.s5),
          _CalInfoRow(
            dot: c.danger,
            title: 'High Impact',
            description: 'Typically moves major indices 0.5–2%+ within minutes of release. Triggers options volatility. Positions should be sized accordingly.',
          ),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: c.warning,
            title: 'Medium Impact',
            description: 'Can move markets modestly (0.2–0.8%). Less acute than High events but still capable of shifting sentiment and sector rotation.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('EVENT TYPES',
              style: AppTypography.labelXs.copyWith(color: c.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: c.accent,
            title: 'FOMC / Fed (teal)',
            description: 'Federal Open Market Committee decisions on interest rates. Press conferences by the Chair signal future policy direction. The most powerful macro lever.',
          ),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: c.warning,
            title: 'Inflation: CPI / PPI / PCE (amber)',
            description: 'CPI = Consumer Price Index. PPI = Producer Price Index (upstream price pressures). PCE = Personal Consumption Expenditures — the Fed\'s preferred inflation gauge.',
          ),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: c.positive,
            title: 'Jobs: NFP / JOLTS (green)',
            description: 'NFP = Non-Farm Payrolls, released first Friday of each month. The single most market-moving monthly data point. JOLTS tracks job openings — a leading indicator of labor demand.',
          ),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: const Color(0xFF5B8DEF),
            title: 'GDP (blue)',
            description: 'Gross Domestic Product — total economic output. Three estimates released per quarter (Advance, Preliminary, Final). Major upside/downside surprises reprice growth expectations.',
          ),
          const SizedBox(height: AppSpacing.s3),
          _CalInfoRow(
            dot: const Color(0xFFA78BFA),
            title: 'Other (purple)',
            description: 'Retail Sales, ISM Manufacturing/Services, Consumer Sentiment, Housing Starts — important economic health indicators but typically lower market impact.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.accent.withAlpha(50)),
            ),
            child: Text(
              'Jackson Hole (Aug): Annual Fed symposium in Wyoming. Historically used to signal major policy pivots — e.g., Bernanke\'s QE2 hint (2010), Taper signal (2013), Powell\'s inflation warning (2022).',
              style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.6),
            ),
          ),
        ],
      ),
    ),
  );
}

class _CalInfoRow extends StatelessWidget {
  const _CalInfoRow({
    required this.dot,
    required this.title,
    required this.description,
  });
  final Color dot;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTypography.labelSm.copyWith(
                      color: c.textPrimary, fontWeight: FontWeight.w700)),
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
      case 'GDP':
        return const Color(0xFF5B8DEF);
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
            const SizedBox(width: AppSpacing.s2),
            GestureDetector(
              onTap: () => _showCalendarInfo(context),
              child: Icon(Icons.info_outline_rounded, size: 16, color: c.textMuted),
            ),
            const Spacer(),
            Text('indicative dates',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
          ],
        ),
        const SizedBox(height: AppSpacing.s3),
        // Legend row
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.s3),
          child: Row(
            children: [
              _LegendDot(color: c.accent, label: 'Fed'),
              const SizedBox(width: AppSpacing.s4),
              _LegendDot(color: c.warning, label: 'Inflation'),
              const SizedBox(width: AppSpacing.s4),
              _LegendDot(color: c.positive, label: 'Jobs'),
              const SizedBox(width: AppSpacing.s4),
              _LegendDot(color: const Color(0xFF5B8DEF), label: 'GDP'),
              const SizedBox(width: AppSpacing.s4),
              _LegendDot(color: const Color(0xFFA78BFA), label: 'Other'),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: [
              // Header row
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
                decoration: BoxDecoration(
                  border: Border(
                      bottom: BorderSide(color: c.border, width: 0.5)),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 11),
                    SizedBox(
                      width: 72,
                      child: Text('DATE',
                          style: AppTypography.labelXs
                              .copyWith(color: c.textMuted, letterSpacing: 1)),
                    ),
                    Expanded(
                      child: Text('EVENT',
                          style: AppTypography.labelXs
                              .copyWith(color: c.textMuted, letterSpacing: 1)),
                    ),
                    SizedBox(
                      width: 54,
                      child: Text('IMPACT',
                          style: AppTypography.labelXs.copyWith(
                              color: c.textMuted, letterSpacing: 1),
                          textAlign: TextAlign.right),
                    ),
                  ],
                ),
              ),
              ..._kCalEvents.map((event) {
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
                        margin: const EdgeInsets.only(right: AppSpacing.s2 + 1),
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
                          isHigh ? '🔴 High' : '🟡 Med',
                          style: AppTypography.xs.copyWith(
                              color: impactColor, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: AppTypography.xs.copyWith(color: c.textMuted)),
      ],
    );
  }
}
