import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/treemap_stock.dart';
import '../../data/repositories/heatmap_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/sector_treemap.dart';
import '../../shared/widgets/upgrade_sheet.dart';

const _kLimit = 500;

class _IndexOption {
  final String id;
  final String label;
  const _IndexOption(this.id, this.label);
}

const _kIndices = <_IndexOption>[
  _IndexOption('sp500',       '🇺🇸 S&P 500'),
  _IndexOption('ndx',         '🇺🇸 NASDAQ 100'),
  _IndexOption('dji',         '🇺🇸 Dow Jones'),
  _IndexOption('russell2000', '🇺🇸 Russell 2000'),
  _IndexOption('ftse100',     '🇬🇧 FTSE 100'),
  _IndexOption('dax40',       '🇩🇪 DAX 40'),
  _IndexOption('nikkei225',   '🇯🇵 Nikkei 225'),
  _IndexOption('hsi',         '🇭🇰 Hang Seng'),
  _IndexOption('nifty50',     '🇮🇳 Nifty 50'),
];

const _kTimeframes = <(String, String)>[
  ('1d',  '1D'),
  ('1w',  '1W'),
  ('1m',  '1M'),
  ('ytd', 'YTD'),
];

class _TreemapKey {
  final String index;
  final String timeframe;
  const _TreemapKey(this.index, this.timeframe);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is _TreemapKey &&
          other.index == index &&
          other.timeframe == timeframe);

  @override
  int get hashCode => Object.hash(index, timeframe);
}

final _treemapProvider = FutureProvider.autoDispose
    .family<TreemapHeatmapData, _TreemapKey>((ref, key) {
  // Server caches quotes 5m + constituents 24h; expensive FX-normalised payload.
  // Keep alive across tab switches within a session.
  ref.keepAlive();
  return HeatmapRepository.instance.fetchTreemap(
    index: key.index,
    limit: _kLimit,
    timeframe: key.timeframe,
  );
});

class TreemapTab extends ConsumerStatefulWidget {
  const TreemapTab({super.key});

  @override
  ConsumerState<TreemapTab> createState() => _TreemapTabState();
}

class _TreemapTabState extends ConsumerState<TreemapTab> {
  String _index = 'sp500';
  String _timeframe = '1d';

  @override
  Widget build(BuildContext context) {
    if (!EntitlementService.can('treemap_heatmap')) {
      return const _PaywallView();
    }
    final c = context.colors;
    final key = _TreemapKey(_index, _timeframe);
    final async = ref.watch(_treemapProvider(key));
    final mq = MediaQuery.of(context);
    final bottomInset = mq.padding.bottom;
    return Column(
      children: [
        _Header(
          selectedIndex: _index,
          selectedTimeframe: _timeframe,
          onSelectIndex: (id) => setState(() => _index = id),
          onSelectTimeframe: (tf) => setState(() => _timeframe = tf),
          onInfo: () => _showInfo(context),
        ),
        Expanded(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(
              message: 'Could not load heatmap.\n$e',
              onRetry: () => ref.invalidate(_treemapProvider(key)),
            ),
            data: (data) {
              if (data.stocks.isEmpty) {
                return Center(
                  child: Text(
                    'No data available',
                    style: AppTypography.md.copyWith(color: c.textSecondary),
                  ),
                );
              }
              return RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () async {
                  ref.invalidate(_treemapProvider(key));
                  await ref.read(_treemapProvider(key).future);
                },
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final viewportHeight = constraints.maxHeight;
                    // 500 stocks need ~2.5× viewport so tiles stay legible.
                    final treemapHeight = viewportHeight * 2.5 - 60;
                    return SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.only(bottom: bottomInset + AppSpacing.s4),
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(AppSpacing.s4,
                                AppSpacing.s2, AppSpacing.s4, AppSpacing.s1),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: _MarketStatusPill(state: data.marketState),
                            ),
                          ),
                          FreshnessBar(
                              lastUpdated: data.lastUpdated.toIso8601String()),
                          if (data.stocks.length < _kLimit)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                  AppSpacing.s4, AppSpacing.s2, AppSpacing.s4, 0),
                              child: Text(
                                'Showing ${data.stocks.length} of ${data.total} resolved',
                                style: AppTypography.xs
                                    .copyWith(color: c.textSecondary),
                              ),
                            ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(AppSpacing.s3,
                                AppSpacing.s2, AppSpacing.s3, AppSpacing.s3),
                            child: SizedBox(
                              height: treemapHeight,
                              child: ClipRRect(
                                borderRadius:
                                    BorderRadius.circular(AppRadius.sm),
                                child: SectorTreemap(
                                  stocks: data.stocks,
                                  onSectorTap: (sector) =>
                                      _openSectorDrillIn(context, data, sector),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  void _openSectorDrillIn(
      BuildContext context, TreemapHeatmapData data, String sector) {
    final filtered =
        data.stocks.where((s) => s.sector == sector).toList(growable: false);
    if (filtered.isEmpty) return;
    final indexLabel = _kIndices
        .firstWhere(
          (o) => o.id == data.index,
          orElse: () => _IndexOption(data.index, data.index.toUpperCase()),
        )
        .label;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _SectorDrillInScreen(
          sector: sector,
          indexLabel: indexLabel,
          stocks: filtered,
          marketState: data.marketState,
          lastUpdated: data.lastUpdated,
        ),
      ),
    );
  }

  void _showInfo(BuildContext context) {
    final c = context.colors;
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Market Heatmap',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Stocks shown as tiles. Tile size = market capitalisation in USD. '
                'For non-US indices (FTSE 100, DAX 40, Nikkei 225, Hang Seng, Nifty 50), '
                'market caps are converted to USD using live FX rates so cross-index tile '
                'sizes are comparable. Tile colour = today\'s % change.',
                style: AppTypography.sm.copyWith(color: c.textSecondary),
              ),
              const SizedBox(height: AppSpacing.s4),
              _LegendRow(
                color: const Color(0xFF8A1A1A),
                label: 'Down 3% or more',
              ),
              _LegendRow(
                color: const Color(0xFF5C2026),
                label: 'Down up to 3%',
              ),
              _LegendRow(
                color: const Color(0xFF3F3F3F),
                label: 'Roughly flat',
              ),
              _LegendRow(
                color: const Color(0xFF1F4D32),
                label: 'Up to 3%',
              ),
              _LegendRow(
                color: const Color(0xFF0B6B35),
                label: 'Up 3% or more',
              ),
              const SizedBox(height: AppSpacing.s4),
              Text(
                'Live data',
                style: AppTypography.labelMd.copyWith(color: c.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s1),
              Text(
                'Constituents refresh daily. Prices and market caps refresh every five minutes from Yahoo Finance during market hours.',
                style: AppTypography.sm.copyWith(color: c.textSecondary),
              ),
              const SizedBox(height: AppSpacing.s4),
              Text(
                'Tap a tile to see its price, % change, sector, and market cap.',
                style: AppTypography.sm.copyWith(color: c.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendRow({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 10),
          Text(label,
              style: AppTypography.sm.copyWith(color: c.textSecondary)),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String selectedIndex;
  final String selectedTimeframe;
  final ValueChanged<String> onSelectIndex;
  final ValueChanged<String> onSelectTimeframe;
  final VoidCallback onInfo;
  const _Header({
    required this.selectedIndex,
    required this.selectedTimeframe,
    required this.onSelectIndex,
    required this.onSelectTimeframe,
    required this.onInfo,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final opt in _kIndices) ...[
                        _IndexChip(
                          label: opt.label,
                          enabled: true,
                          selected: opt.id == selectedIndex,
                          onTap: () => onSelectIndex(opt.id),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.info_outline_rounded,
                    size: 20, color: c.textSecondary),
                onPressed: onInfo,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.start,
            children: [
              for (final tf in _kTimeframes) ...[
                _TimeframeChip(
                  label: tf.$2,
                  selected: tf.$1 == selectedTimeframe,
                  onTap: () => onSelectTimeframe(tf.$1),
                ),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TimeframeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _TimeframeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? c.accent : c.surface,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: selected ? c.accent : c.border),
        ),
        child: Text(
          label,
          style: AppTypography.sm.copyWith(
            color: selected ? Colors.white : c.textPrimary,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _MarketStatusPill extends StatelessWidget {
  /// Raw Yahoo `marketState` — REGULAR / PRE / POST / POSTPOST / PREPRE / CLOSED.
  final String? state;
  const _MarketStatusPill({required this.state});

  ({String label, Color dot, Color bg, Color border, bool pulse}) _style() {
    switch (state) {
      case 'REGULAR':
        return (
          label: 'Market Status: Live',
          dot: const Color(0xFF22C55E),
          bg: const Color(0x1F22C55E),
          border: const Color(0x3322C55E),
          pulse: true,
        );
      case 'PRE':
      case 'PREPRE':
        return (
          label: 'Market Status: Pre-market',
          dot: const Color(0xFFF59E0B),
          bg: const Color(0x1FF59E0B),
          border: const Color(0x33F59E0B),
          pulse: true,
        );
      case 'POST':
      case 'POSTPOST':
        return (
          label: 'Market Status: After-hours',
          dot: const Color(0xFF60A5FA),
          bg: const Color(0x1F60A5FA),
          border: const Color(0x3360A5FA),
          pulse: true,
        );
      default:
        return (
          label: 'Market Status: Closed',
          dot: const Color(0xFFEF4444),
          bg: const Color(0x1FEF4444),
          border: const Color(0x33EF4444),
          pulse: false,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = _style();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: s.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _PulsingDot(color: s.dot, pulsing: s.pulse),
          const SizedBox(width: 7),
          Text(
            s.label,
            style: AppTypography.xs.copyWith(
              color: c.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  final Color color;
  final bool pulsing;
  const _PulsingDot({required this.color, required this.pulsing});

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    if (widget.pulsing) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _PulsingDot old) {
    super.didUpdateWidget(old);
    if (widget.pulsing && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (!widget.pulsing && _ctrl.isAnimating) {
      _ctrl.stop();
      _ctrl.value = 0;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        final t = _ctrl.value;
        return SizedBox(
          width: 14,
          height: 14,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (widget.pulsing)
                Container(
                  width: 8 + 6 * t,
                  height: 8 + 6 * t,
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.35 * (1 - t)),
                    shape: BoxShape.circle,
                  ),
                ),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: widget.color,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _IndexChip extends StatelessWidget {
  final String label;
  final bool enabled;
  final bool selected;
  final VoidCallback? onTap;
  const _IndexChip({
    required this.label,
    this.enabled = false,
    this.selected = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bg = selected
        ? c.accent.withValues(alpha: 0.18)
        : (enabled ? c.surface : c.surfaceElevated);
    final fg = enabled
        ? (selected ? c.accent : c.textPrimary)
        : c.textMuted;
    final border = selected ? c.accent : c.border;
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: border),
        ),
        child: Text(
          label,
          style: AppTypography.sm.copyWith(
            color: fg,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _SectorDrillInScreen extends StatelessWidget {
  final String sector;
  final String indexLabel;
  final List<TreemapStock> stocks;
  final String? marketState;
  final DateTime lastUpdated;

  const _SectorDrillInScreen({
    required this.sector,
    required this.indexLabel,
    required this.stocks,
    required this.marketState,
    required this.lastUpdated,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final mq = MediaQuery.of(context);
    final bottomInset = mq.padding.bottom;
    final totalCap = stocks.fold<double>(0, (a, s) => a + s.marketCap);
    final weighted = stocks.fold<double>(
            0, (a, s) => a + (s.changePercent * s.marketCap)) /
        (totalCap == 0 ? 1 : totalCap);
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.headerBg,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(sector,
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            Text(indexLabel,
                style: AppTypography.xs.copyWith(color: c.textSecondary)),
          ],
        ),
      ),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
              AppSpacing.s3, AppSpacing.s2, AppSpacing.s3, bottomInset + AppSpacing.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    AppSpacing.s2, 0, AppSpacing.s2, AppSpacing.s2),
                child: Row(
                  children: [
                    _MarketStatusPill(state: marketState),
                    const Spacer(),
                    Text(
                      '${stocks.length} stocks · '
                      'avg ${weighted >= 0 ? '+' : ''}${weighted.toStringAsFixed(2)}%',
                      style: AppTypography.xs
                          .copyWith(color: c.textSecondary),
                    ),
                  ],
                ),
              ),
              FreshnessBar(lastUpdated: lastUpdated.toIso8601String()),
              const SizedBox(height: AppSpacing.s2),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  // onSectorTap: null → no further drill-in from inside the
                  // already-focused sector view.
                  child: SectorTreemap(stocks: stocks),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaywallView extends StatelessWidget {
  const _PaywallView();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.grid_view_rounded, size: 48, color: c.accent),
            const SizedBox(height: AppSpacing.s4),
            Text(
              'Market Heatmap',
              style: AppTypography.headingMd.copyWith(color: c.textPrimary),
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'S&P 500 stocks sized by market cap, coloured by 1D change.\nUpgrade to Pro to unlock.',
              textAlign: TextAlign.center,
              style: AppTypography.sm.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.s5),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: c.accent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
              ),
              onPressed: () =>
                  UpgradeSheet.show(context, feature: 'treemap_heatmap'),
              child: const Text('Upgrade to Pro'),
            ),
          ],
        ),
      ),
    );
  }
}
