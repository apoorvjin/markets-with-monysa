import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';

final _earningsCalendarProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final data = await ApiClient.instance.get(ApiEndpoints.earningsCalendar)
      as Map<String, dynamic>;
  return (data['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];
});

class EarningsCalendarTab extends ConsumerWidget {
  const EarningsCalendarTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_earningsCalendarProvider);

    return async.when(
      loading: () =>
          const ShimmerList(count: 8, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load earnings calendar',
        onRetry: () => ref.invalidate(_earningsCalendarProvider),
      ),
      data: (items) {
        if (items.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.s8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.event_outlined, size: 40, color: c.textMuted),
                  const SizedBox(height: AppSpacing.s3),
                  Text(
                    'No earnings in the next 15 days',
                    style: AppTypography.md.copyWith(color: c.textMuted),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        // Group by date
        final Map<String, List<Map<String, dynamic>>> grouped = {};
        for (final item in items) {
          final date = item['earningsDate'] as String? ?? '';
          grouped.putIfAbsent(date, () => []).add(item);
        }
        final dates = grouped.keys.toList()..sort();
        final today = DateTime.now();

        return MaxWidthLayout(
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.s5,
              AppSpacing.s5,
              AppSpacing.s5,
              AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
            ),
            children: dates.expand((date) {
              final dt = DateTime.tryParse(date);
              final daysOut = dt != null
                  ? dt.difference(DateTime(today.year, today.month, today.day)).inDays
                  : null;
              final dateLabel = dt != null
                  ? '${_dayName(dt.weekday)}, ${_monthName(dt.month)} ${dt.day}'
                  : date;

              final Color badgeColor;
              final String badgeLabel;
              if (daysOut == null) {
                badgeColor = c.textMuted;
                badgeLabel = '';
              } else if (daysOut == 0) {
                badgeColor = c.danger;
                badgeLabel = 'Today';
              } else if (daysOut <= 3) {
                badgeColor = c.warning;
                badgeLabel = 'in $daysOut day${daysOut == 1 ? '' : 's'}';
              } else {
                badgeColor = c.textMuted;
                badgeLabel = 'in $daysOut days';
              }

              return [
                Padding(
                  padding: const EdgeInsets.only(
                      top: AppSpacing.s4, bottom: AppSpacing.s2),
                  child: Row(
                    children: [
                      Text(
                        dateLabel.toUpperCase(),
                        style: AppTypography.labelSm.copyWith(
                            color: c.textMuted, letterSpacing: 1.2),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      if (badgeLabel.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: badgeColor.withAlpha(30),
                            borderRadius:
                                BorderRadius.circular(AppRadius.full),
                            border:
                                Border.all(color: badgeColor.withAlpha(80)),
                          ),
                          child: Text(badgeLabel,
                              style: AppTypography.xs.copyWith(
                                  color: badgeColor,
                                  fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                ),
                ...grouped[date]!.map((item) => _EarningsRow(item: item)),
              ];
            }).toList(),
          ),
        );
      },
    );
  }

  String _dayName(int weekday) {
    const d = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return d[(weekday - 1).clamp(0, 6)];
  }

  String _monthName(int month) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m[(month - 1).clamp(0, 11)];
  }
}

class _EarningsRow extends StatelessWidget {
  const _EarningsRow({required this.item});
  final Map<String, dynamic> item;

  static const _sectorEmoji = {
    'Technology': '💻',
    'Financials': '🏦',
    'Healthcare': '💊',
    'Consumer Disc.': '🛍️',
    'Consumer Staples': '🛒',
    'Energy': '⚡',
    'Industrials': '🏭',
    'Comm. Services': '📡',
    'Materials': '⛏️',
    'Real Estate': '🏠',
    'Utilities': '🔌',
  };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final symbol = item['symbol'] as String? ?? '';
    final name = item['name'] as String? ?? '';
    final sector = item['sector'] as String? ?? '';
    final emoji = _sectorEmoji[sector] ?? '📊';

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.s2),
      child: GlassCard(
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: c.surfaceCard,
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(color: c.border),
              ),
              child: Center(
                child: Text(emoji, style: const TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: AppTypography.labelMd
                          .copyWith(color: c.textPrimary),
                      overflow: TextOverflow.ellipsis),
                  Text(sector,
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                ],
              ),
            ),
            Text(symbol,
                style: AppTypography.labelSm.copyWith(
                    color: c.accent, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
