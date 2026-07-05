import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/etf.dart';
import '../../data/repositories/etf_repository.dart';
import '../../shared/widgets/app_shell_insets.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
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
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (var i = 0; i < _kCategories.length; i++) ...[
                        _CategoryChip(
                          label: _kCategories[i].label,
                          active: _category == _kCategories[i].id,
                          onTap: () =>
                              setState(() => _category = _kCategories[i].id),
                        ),
                        if (i < _kCategories.length - 1)
                          const SizedBox(width: AppSpacing.s2),
                      ],
                    ],
                  ),
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
                      onTap: () => setState(() => _rotationView = true),
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

class _ListView extends ConsumerWidget {
  const _ListView({required this.category});
  final String category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_etfListProvider(category));

    return async.when(
      loading: () => const ShimmerList(count: 10, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load ETFs',
        onRetry: () => ref.invalidate(_etfListProvider(category)),
      ),
      data: (data) => ListView.builder(
        padding: EdgeInsets.only(bottom: appShellBottomInset(context)),
        itemCount: data.items.length,
        itemBuilder: (_, i) => _EtfRow(item: data.items[i]),
      ),
    );
  }
}

class _EtfRow extends StatelessWidget {
  const _EtfRow({required this.item});
  final EtfItem item;

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
            const SizedBox(width: AppSpacing.s3),
            GestureDetector(
              onTap: () => _openProfile(context),
              child: Icon(Icons.info_outline_rounded, size: 16, color: c.textMuted),
            ),
          ],
        ),
      ),
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

  static const _quadrants = ['Leading', 'Improving', 'Weakening', 'Lagging'];
  // Must match ETF_ROTATION_CATEGORIES in server/data/etf_universe.ts.
  static const _rotationEligible = {'sector', 'broad', 'international', 'thematic'};

  Color _quadrantColor(AppPalette c, String q) {
    switch (q) {
      case 'Leading':   return Colors.teal.shade400;
      case 'Improving':  return Colors.blue.shade400;
      case 'Weakening': return Colors.orange.shade400;
      case 'Lagging':   return Colors.red.shade400;
      default: return c.textMuted;
    }
  }

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
        final byQuadrant = <String, List<EtfRotationItem>>{
          for (final q in _quadrants) q: [],
        };
        for (final item in filtered) {
          final q = item.quadrant;
          if (q != null && byQuadrant.containsKey(q)) byQuadrant[q]!.add(item);
        }

        return ListView(
          padding: EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, appShellBottomInset(context)),
          children: [
            for (final q in _quadrants)
              if (byQuadrant[q]!.isNotEmpty)
                GlassCard(
                  margin: const EdgeInsets.only(bottom: AppSpacing.s3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8, height: 8,
                            decoration: BoxDecoration(
                                color: _quadrantColor(c, q), shape: BoxShape.circle),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          Text(q,
                              style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.s3),
                      for (final item in byQuadrant[q]!)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Text(item.emoji, style: AppTypography.sm),
                              const SizedBox(width: AppSpacing.s2),
                              Expanded(
                                child: Text(item.name,
                                    style: AppTypography.xs.copyWith(color: c.textSecondary)),
                              ),
                              Text(item.symbol,
                                  style: AppTypography.xs.copyWith(
                                      color: c.textMuted, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
          ],
        );
      },
    );
  }
}
