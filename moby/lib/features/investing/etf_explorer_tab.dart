import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/etf.dart';
import '../../data/repositories/etf_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/app_shell_insets.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/pro_blur_overlay.dart';
import '../../shared/widgets/rrg_quadrant_grid.dart';
import '../../shared/widgets/shimmer_list.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

const List<({String id, String label})> _kCategories = [
  (id: '', label: 'All'),
  (id: 'sector', label: 'Sector'),
  (id: 'broad', label: 'Broad Market'),
  (id: 'international', label: 'International'),
  (id: 'fixed_income', label: 'Fixed Income'),
  (id: 'commodity', label: 'Commodity'),
  (id: 'thematic', label: 'Thematic'),
  (id: 'global_sector', label: 'Global Sectors'),
  (id: 'leveraged', label: 'Leveraged/Inverse'),
];

final _etfListProvider =
    FutureProvider.autoDispose.family<EtfListData, String>((ref, category) {
  ref.keepAlive(); // 10m server TTL
  return EtfRepository.instance.fetchList(category: category.isEmpty ? null : category);
});

final _etfRotationProvider = FutureProvider.autoDispose<EtfRotationData>((ref) {
  ref.keepAlive(); // 15m server TTL
  return EtfRepository.instance.fetchRotation();
});

final _etfProfileProvider =
    FutureProvider.autoDispose.family<EtfProfile, String>((ref, symbol) {
  ref.keepAlive(); // 24h server TTL
  return EtfRepository.instance.fetchProfile(symbol);
});

// ── Tab ───────────────────────────────────────────────────────────────────────

class EtfExplorerTab extends ConsumerStatefulWidget {
  const EtfExplorerTab({super.key});

  @override
  ConsumerState<EtfExplorerTab> createState() => _EtfExplorerTabState();
}

class _EtfExplorerTabState extends ConsumerState<EtfExplorerTab> {
  String _category = '';
  bool _rotationView = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return MaxWidthLayout(
      child: Column(
        children: [
          // Each filter dimension gets its own labeled row (mirrors
          // multibaggers_screen.dart's Country:/Ver: rows) — a single row
          // sharing space between 8 category chips and the view toggle left
          // most categories permanently scrolled off-screen.
          Container(
            color: c.surface,
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, AppSpacing.s3, AppSpacing.s5, AppSpacing.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Category:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Wrap(
                  spacing: AppSpacing.s2,
                  runSpacing: AppSpacing.s2,
                  children: [
                    for (final cat in _kCategories)
                      _CategoryChip(
                        label: cat.label,
                        active: _category == cat.id,
                        onTap: () => setState(() => _category = cat.id),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s3),
                Text('View:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Row(
                  children: [
                    _CategoryChip(
                      label: 'List',
                      active: !_rotationView,
                      onTap: () => setState(() => _rotationView = false),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    _CategoryChip(
                      label: 'Rotation',
                      active: _rotationView,
                      // Rotation only covers 4 of 7 categories — reset to
                      // All so switching views never lands on an empty view.
                      onTap: () => setState(() {
                        _rotationView = true;
                        _category = '';
                      }),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: _rotationView
                ? _RotationView(category: _category)
                : _ListView(category: _category),
          ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        decoration: BoxDecoration(
          color: active ? c.accent.withAlpha(25) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: active ? c.accent : c.border),
        ),
        child: Text(
          label,
          style: AppTypography.xs.copyWith(
            color: active ? c.accent : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// ── List view ─────────────────────────────────────────────────────────────────

class _ListView extends ConsumerStatefulWidget {
  const _ListView({required this.category});
  final String category;

  @override
  ConsumerState<_ListView> createState() => _ListViewState();
}

class _ListViewState extends ConsumerState<_ListView> {
  // Which single ETF (by symbol) gets its full MoM/QoQ/YoY strip revealed
  // for free users — every other row's strip is blurred as one unit, and
  // this ETF is moved to the top of the list so it's visible without
  // scrolling. Picked once per category's data load, not re-randomized on
  // every rebuild; reset when the category changes.
  String? _revealedSymbol;

  @override
  void didUpdateWidget(covariant _ListView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.category != widget.category) {
      _revealedSymbol = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_etfListProvider(widget.category));

    return async.when(
      loading: () => const ShimmerList(count: 10, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load ETFs',
        onRetry: () => ref.invalidate(_etfListProvider(widget.category)),
      ),
      data: (data) {
        if (data.items.isEmpty) {
          _revealedSymbol = null;
        } else if (_revealedSymbol == null ||
            !data.items.any((e) => e.symbol == _revealedSymbol)) {
          _revealedSymbol =
              data.items[Random().nextInt(data.items.length)].symbol;
        }
        final isPro = EntitlementService.can('etf_performance_metrics');

        var ordered = data.items;
        if (!isPro && _revealedSymbol != null) {
          final idx = data.items.indexWhere((e) => e.symbol == _revealedSymbol);
          if (idx > 0) {
            ordered = [
              data.items[idx],
              ...data.items.sublist(0, idx),
              ...data.items.sublist(idx + 1),
            ];
          }
        }

        return ListView.builder(
          padding: EdgeInsets.only(bottom: appShellBottomInset(context)),
          itemCount: ordered.length,
          itemBuilder: (_, i) => _EtfRow(
            item: ordered[i],
            revealPerf: isPro || ordered[i].symbol == _revealedSymbol,
          ),
        );
      },
    );
  }
}

class _EtfRow extends StatelessWidget {
  const _EtfRow({required this.item, required this.revealPerf});
  final EtfItem item;
  final bool revealPerf;

  void _openProfile(BuildContext context) {
    showAppBottomSheet(
      context: context,
      builder: (_) => _EtfProfileSheet(item: item),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final changePct = item.changePercent;
    final isUp = (changePct ?? 0) >= 0;
    final pctColor = changePct == null ? c.textMuted : (isUp ? c.positive : c.danger);

    return InkWell(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(item.symbol)}?name=${Uri.encodeComponent(item.name)}',
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
        ),
        child: Row(
          children: [
            Text(item.emoji, style: AppTypography.lg),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(item.symbol,
                          style: AppTypography.sm.copyWith(
                              color: c.textPrimary, fontWeight: FontWeight.w600)),
                      if (item.isLeveraged) ...[
                        const SizedBox(width: AppSpacing.s2),
                        Icon(Icons.warning_amber_rounded, size: 12, color: c.warning),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(item.name,
                      style: AppTypography.xs.copyWith(color: c.textMuted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  _PerfStrip(
                      perf1M: item.perf1M,
                      perf3M: item.perf3M,
                      perf1Y: item.perf1Y,
                      revealed: revealPerf),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  item.price != null ? '\$${item.price!.toStringAsFixed(2)}' : '--',
                  style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  changePct != null ? '${isUp ? '+' : ''}${changePct.toStringAsFixed(2)}%' : '--',
                  style: AppTypography.xs.copyWith(color: pctColor, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(width: AppSpacing.s2),
            IconButton(
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: Icon(Icons.info_outline_rounded, size: 16, color: c.textMuted),
              onPressed: () => _openProfile(context),
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact MoM/QoQ/YoY strip — rolling-window returns (trailing 1mo/3mo/1y),
/// not calendar-quarter-aligned. Only one ETF in the whole list has [revealed]
/// true (picked by the parent list); every other row's strip is blurred as a
/// single unit behind the Pro paywall.
class _PerfStrip extends StatelessWidget {
  const _PerfStrip({
    required this.perf1M,
    required this.perf3M,
    required this.perf1Y,
    required this.revealed,
  });
  final double? perf1M;
  final double? perf3M;
  final double? perf1Y;
  final bool revealed;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final strip = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _PerfChip(label: 'MoM', value: perf1M, c: c),
        const SizedBox(width: AppSpacing.s3),
        _PerfChip(label: 'QoQ', value: perf3M, c: c),
        const SizedBox(width: AppSpacing.s3),
        _PerfChip(label: 'YoY', value: perf1Y, c: c),
      ],
    );
    if (revealed) return strip;

    final values = [perf1M, perf3M, perf1Y].whereType<double>().toList();
    final avg = values.isEmpty ? 0.0 : values.reduce((a, b) => a + b) / values.length;
    return ProBlurOverlay(
      isPositive: avg >= 0,
      feature: 'etf_performance_metrics',
      child: strip,
    );
  }
}

class _PerfChip extends StatelessWidget {
  const _PerfChip({required this.label, required this.value, required this.c});
  final String label;
  final double? value;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final color = v == null ? c.textMuted : (v >= 0 ? c.positive : c.danger);
    final text = v == null ? '--' : '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('$label ', style: AppTypography.xs.copyWith(color: c.textFaint)),
        Text(text,
            style: AppTypography.xs.copyWith(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// ── Fund profile bottom sheet ─────────────────────────────────────────────────

class _EtfProfileSheet extends ConsumerWidget {
  const _EtfProfileSheet({required this.item});
  final EtfItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_etfProfileProvider(item.symbol));

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      padding: EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, appShellBottomInset(context)),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: AppSpacing.s4),
            Text('${item.symbol} · ${item.name}',
                style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
            const SizedBox(height: AppSpacing.s4),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.s8),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.s6),
                child: Text('Fund data unavailable right now.',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
              data: (profile) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _StatBlock(
                        label: 'Expense Ratio',
                        value: profile.expenseRatio != null
                            ? '${profile.expenseRatio!.toStringAsFixed(2)}%' : '--',
                      ),
                      const SizedBox(width: AppSpacing.s6),
                      _StatBlock(
                        label: 'AUM',
                        value: _fmtAum(profile.aum),
                      ),
                    ],
                  ),
                  if (profile.family != null) ...[
                    const SizedBox(height: AppSpacing.s2),
                    Text('Issuer: ${profile.family}',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                  ],
                  if (profile.sectorWeightings.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.s5),
                    Text('Sector Weights',
                        style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
                    const SizedBox(height: AppSpacing.s2),
                    ...(profile.sectorWeightings
                            .where((s) => s.weightPct != null)
                            .toList()
                          ..sort((a, b) => (b.weightPct ?? 0).compareTo(a.weightPct ?? 0)))
                        .take(8)
                        .map((s) => _WeightRow(
                              label: s.sector,
                              weightPct: s.weightPct!,
                              c: c,
                            )),
                  ],
                  if (profile.holdings.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.s5),
                    Text('Top Holdings',
                        style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
                    const SizedBox(height: AppSpacing.s2),
                    for (final h in profile.holdings)
                      _WeightRow(
                        label: '${h.symbol ?? ''} · ${h.name ?? ''}',
                        weightPct: h.weightPct ?? 0,
                        c: c,
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _fmtAum(double? aum) {
    if (aum == null) return '--';
    if (aum >= 1e9) return '\$${(aum / 1e9).toStringAsFixed(1)}B';
    if (aum >= 1e6) return '\$${(aum / 1e6).toStringAsFixed(1)}M';
    return '\$${aum.toStringAsFixed(0)}';
  }
}

class _StatBlock extends StatelessWidget {
  const _StatBlock({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.xs.copyWith(color: c.textMuted)),
        const SizedBox(height: 2),
        Text(value, style: AppTypography.numericXl.copyWith(color: c.textPrimary)),
      ],
    );
  }
}

class _WeightRow extends StatelessWidget {
  const _WeightRow({required this.label, required this.weightPct, required this.c});
  final String label;
  final double weightPct;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: AppTypography.xs.copyWith(color: c.textSecondary),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          Text('${weightPct.toStringAsFixed(1)}%',
              style: AppTypography.xs.copyWith(color: c.textPrimary, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ── Rotation view ─────────────────────────────────────────────────────────────

class _RotationView extends ConsumerWidget {
  const _RotationView({required this.category});
  final String category;

  // Must match ETF_ROTATION_CATEGORIES in server/data/etf_universe.ts.
  static const _rotationEligible = {'sector', 'broad', 'international', 'thematic', 'global_sector'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    if (category.isNotEmpty && !_rotationEligible.contains(category)) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s6),
          child: Text(
            'RRG rotation only applies to Sector, Broad Market, International, '
            'and Thematic ETFs — not available for this category.',
            textAlign: TextAlign.center,
            style: AppTypography.sm.copyWith(color: c.textMuted),
          ),
        ),
      );
    }

    final async = ref.watch(_etfRotationProvider);

    return async.when(
      loading: () => const ShimmerList(count: 6, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load rotation data',
        onRetry: () => ref.invalidate(_etfRotationProvider),
      ),
      data: (data) {
        final filtered = category.isEmpty
            ? data.items
            : data.items.where((i) => i.category == category).toList();
        RrgQuadrantItem toItem(EtfRotationItem item) => RrgQuadrantItem(
              emoji: item.emoji,
              label: '${item.symbol} · ${item.name}',
            );
        List<RrgQuadrantItem> forQuadrant(String q) =>
            filtered.where((i) => i.quadrant == q).map(toItem).toList();

        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, appShellBottomInset(context)),
          child: RrgQuadrantGrid(
            leading: forQuadrant('Leading'),
            improving: forQuadrant('Improving'),
            weakening: forQuadrant('Weakening'),
            lagging: forQuadrant('Lagging'),
          ),
        );
      },
    );
  }
}
