import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/error_view.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final correlationProvider =
    FutureProvider.autoDispose<_CorrelationData>((ref) async {
  final data =
      await ApiClient.instance.get(ApiEndpoints.correlation) as Map<String, dynamic>;
  return _CorrelationData.fromJson(data);
});

// ── Models ────────────────────────────────────────────────────────────────────

class _CorrelationSymbol {
  const _CorrelationSymbol({
    required this.symbol,
    required this.name,
    required this.flag,
    required this.category,
  });

  final String symbol;
  final String name;
  final String flag;
  final String category;

  factory _CorrelationSymbol.fromJson(Map<String, dynamic> j) =>
      _CorrelationSymbol(
        symbol:   j['symbol'] as String? ?? '',
        name:     j['name'] as String? ?? '',
        flag:     j['flag'] as String? ?? '',
        category: j['category'] as String? ?? '',
      );
}

class _CorrelationData {
  const _CorrelationData({
    required this.symbols,
    required this.matrix,
    required this.lastUpdated,
  });

  final List<_CorrelationSymbol> symbols;
  final List<List<double>> matrix;
  final String lastUpdated;

  factory _CorrelationData.fromJson(Map<String, dynamic> j) {
    final symbols = (j['symbols'] as List? ?? [])
        .map((e) => _CorrelationSymbol.fromJson(e as Map<String, dynamic>))
        .toList();
    final matrix = (j['matrix'] as List? ?? [])
        .map((row) => (row as List).map((v) => (v as num).toDouble()).toList())
        .toList();
    return _CorrelationData(
      symbols:     symbols,
      matrix:      matrix,
      lastUpdated: j['lastUpdated'] as String? ?? '',
    );
  }
}

class _Pair {
  const _Pair({required this.a, required this.b, required this.r});
  final _CorrelationSymbol a;
  final _CorrelationSymbol b;
  final double r;
}

// ── Tab Widget ────────────────────────────────────────────────────────────────

class CorrelationTab extends ConsumerStatefulWidget {
  const CorrelationTab({super.key});

  @override
  ConsumerState<CorrelationTab> createState() => _CorrelationTabState();
}

class _CorrelationTabState extends ConsumerState<CorrelationTab> {
  String _categoryFilter = 'All';

  static const _categories = [
    'All', 'Commodities', 'Indices', 'Crypto', 'Forex',
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(correlationProvider);

    return Column(
      children: [
        // Category chips
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (int i = 0; i < _categories.length; i++) ...[
                  _CategoryChip(
                    label: _categories[i],
                    active: _categoryFilter == _categories[i],
                    onTap: () =>
                        setState(() => _categoryFilter = _categories[i]),
                  ),
                  if (i < _categories.length - 1)
                    const SizedBox(width: AppSpacing.s2),
                ],
              ],
            ),
          ),
        ),
        Divider(height: 1, color: c.border),
        Expanded(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(
              message: 'Failed to load correlation data',
              onRetry: () => ref.invalidate(correlationProvider),
            ),
            data: (data) => _CorrelationContent(
              data: data,
              categoryFilter: _categoryFilter,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Content ───────────────────────────────────────────────────────────────────

class _CorrelationContent extends StatelessWidget {
  const _CorrelationContent({
    required this.data,
    required this.categoryFilter,
  });

  final _CorrelationData data;
  final String categoryFilter;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final n = data.symbols.length;

    // Indices of symbols in the selected category
    final categorySet = categoryFilter == 'All'
        ? null
        : <int>{
            for (int i = 0; i < n; i++)
              if (data.symbols[i].category == categoryFilter) i,
          };

    // Build unique pairs, optionally filtered so at least one asset is in category
    final allPairs = <_Pair>[];
    for (int i = 0; i < n; i++) {
      for (int j = i + 1; j < n; j++) {
        if (categorySet != null &&
            !categorySet.contains(i) &&
            !categorySet.contains(j)) {
          continue;
        }
        if (i < data.matrix.length && j < data.matrix[i].length) {
          allPairs.add(_Pair(
            a: data.symbols[i],
            b: data.symbols[j],
            r: data.matrix[i][j],
          ));
        }
      }
    }

    final positivePairs = allPairs.where((p) => p.r >= 0.5).toList()
      ..sort((a, b) => b.r.compareTo(a.r));
    final negativePairs = allPairs.where((p) => p.r <= -0.5).toList()
      ..sort((a, b) => a.r.compareTo(b.r));

    final topPos = positivePairs.take(8).toList();
    final topNeg = negativePairs.take(8).toList();

    if (topPos.isEmpty && topNeg.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('No notable correlations',
                style: AppTypography.md.copyWith(color: c.textMuted)),
            const SizedBox(height: AppSpacing.s2),
            Text('Showing pairs with |r| ≥ 0.5',
                style: AppTypography.xs.copyWith(color: c.textFaint)),
          ],
        ),
      );
    }

    final bottomInset = MediaQuery.of(context).padding.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          AppSpacing.s4, AppSpacing.s4, AppSpacing.s4,
          AppSpacing.s4 + bottomInset),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Asset Correlations',
                        style: AppTypography.headingSm
                            .copyWith(color: c.textPrimary)),
                    const SizedBox(height: 2),
                    Text('3-month Pearson · ${data.lastUpdated}',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => _showInfo(context, c),
                child: Icon(Icons.info_outline_rounded,
                    size: 18, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s5),

          // Move Together section
          if (topPos.isNotEmpty) ...[
            _SectionHeader(
              icon: Icons.trending_up_rounded,
              label: 'Move Together',
              color: c.positive,
              subtitle: 'These assets tend to rise and fall in sync',
            ),
            const SizedBox(height: AppSpacing.s3),
            for (final p in topPos) ...[
              _PairCard(pair: p),
              const SizedBox(height: AppSpacing.s2),
            ],
            const SizedBox(height: AppSpacing.s4),
          ],

          // Move Opposite section
          if (topNeg.isNotEmpty) ...[
            _SectionHeader(
              icon: Icons.swap_vert_rounded,
              label: 'Move Opposite',
              color: c.danger,
              subtitle: 'These assets tend to move in opposite directions',
            ),
            const SizedBox(height: AppSpacing.s3),
            for (final p in topNeg) ...[
              _PairCard(pair: p),
              const SizedBox(height: AppSpacing.s2),
            ],
          ],

          const SizedBox(height: AppSpacing.s4),
          Text(
            'Top pairs with |r| ≥ 0.5  ·  Tap any row for details',
            style: AppTypography.xs.copyWith(color: c.textFaint),
          ),
        ],
      ),
    );
  }

  void _showInfo(BuildContext context, AppPalette c) {
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      isScrollControlled: true,
      builder: (_) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s5),
          child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                    color: c.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: AppSpacing.s4),
            Text('What is Correlation?',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            const SizedBox(height: AppSpacing.s3),
            Text(
              'Pearson correlation (r) measures how closely two assets move '
              'together using daily closing prices over the last 3 months. '
              'Values range from −1 to +1.',
              style: AppTypography.sm.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'This is live data — prices are fetched from Yahoo Finance and '
              'the correlation matrix is recalculated every 4 hours.',
              style: AppTypography.xs.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: AppSpacing.s4),
            _CorrelationInfoRow(
                c: c, value: '+1.0', desc: 'Perfect sync — move in lockstep', color: c.positive),
            _CorrelationInfoRow(
                c: c, value: '+0.7', desc: 'Strong positive — usually move together', color: c.positive),
            _CorrelationInfoRow(
                c: c, value: '0.0', desc: 'No relationship — independent movement', color: c.textMuted),
            _CorrelationInfoRow(
                c: c, value: '−0.7', desc: 'Strong negative — tend to move opposite', color: c.danger),
            _CorrelationInfoRow(
                c: c, value: '−1.0', desc: 'Perfect inverse — mirror each other', color: c.danger),
            const SizedBox(height: AppSpacing.s4),
            Container(
              padding: const EdgeInsets.all(AppSpacing.s3),
              decoration: BoxDecoration(
                color: c.accent.withAlpha(20),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: c.accent.withAlpha(60)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lightbulb_outline_rounded,
                      size: 16, color: c.accent),
                  const SizedBox(width: AppSpacing.s2),
                  Expanded(
                    child: Text(
                      'Negative pairs are useful for hedging. '
                      'High positive correlation between holdings means '
                      'you may be doubling up on the same risk.',
                      style: AppTypography.xs.copyWith(color: c.accent),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.s3),
          ],
        ),
        ),
      ),
    );
  }
}

// ── Section Header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.color,
    required this.subtitle,
  });

  final IconData icon;
  final String label;
  final Color color;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withAlpha(25),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
              Text(subtitle,
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Pair Card ─────────────────────────────────────────────────────────────────

class _PairCard extends StatelessWidget {
  const _PairCard({required this.pair});
  final _Pair pair;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPositive = pair.r >= 0;
    final strength = pair.r.abs();
    final accentColor = isPositive
        ? Color.lerp(c.textPrimary.withAlpha(60), c.positive, strength)!
        : Color.lerp(c.textPrimary.withAlpha(60), c.danger, strength)!;
    final strengthLabel = strength >= 0.7 ? 'Strong' : 'Moderate';

    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border(left: BorderSide(color: accentColor, width: 3)),
      ),
      child: Row(
        children: [
          // Asset A
          Expanded(child: _AssetLabel(sym: pair.a, alignEnd: false)),
          // Value badge
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s3),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: accentColor.withAlpha(30),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: accentColor.withAlpha(100)),
                  ),
                  child: Text(
                    pair.r.toStringAsFixed(2),
                    style: AppTypography.labelSm
                        .copyWith(color: accentColor, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  strengthLabel,
                  style:
                      AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
                ),
              ],
            ),
          ),
          // Asset B
          Expanded(child: _AssetLabel(sym: pair.b, alignEnd: true)),
        ],
      ),
    );
  }
}

// ── Asset Label ───────────────────────────────────────────────────────────────

class _AssetLabel extends StatelessWidget {
  const _AssetLabel({required this.sym, required this.alignEnd});
  final _CorrelationSymbol sym;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final align = alignEnd ? TextAlign.right : TextAlign.left;
    final cross =
        alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    return Column(
      crossAxisAlignment: cross,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${sym.flag} ${_shortName(sym.name)}',
          style: AppTypography.labelSm.copyWith(color: c.textPrimary),
          textAlign: align,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          sym.category,
          style: AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
          textAlign: align,
        ),
      ],
    );
  }

  String _shortName(String name) {
    final parts = name.split(' ');
    final first = parts.first;
    return first.length > 9 ? first.substring(0, 9) : first;
  }
}

// ── Info Row (used in bottom sheet) ───────────────────────────────────────────

class _CorrelationInfoRow extends StatelessWidget {
  const _CorrelationInfoRow({
    required this.c,
    required this.value,
    required this.desc,
    required this.color,
  });
  final AppPalette c;
  final String value;
  final String desc;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.s2),
      child: Row(
        children: [
          SizedBox(
            width: 38,
            child: Text(
              value,
              style: AppTypography.labelSm
                  .copyWith(color: color, fontWeight: FontWeight.w700),
              textAlign: TextAlign.right,
            ),
          ),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text(desc,
                style: AppTypography.xs.copyWith(color: c.textSecondary)),
          ),
        ],
      ),
    );
  }
}

// ── Category Chip ─────────────────────────────────────────────────────────────

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: active ? c.accent.withAlpha(25) : c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: active ? c.accent : c.border),
        ),
        child: Text(
          label,
          style: AppTypography.xs.copyWith(
            color: active ? c.accent : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
      ),
    );
  }
}
