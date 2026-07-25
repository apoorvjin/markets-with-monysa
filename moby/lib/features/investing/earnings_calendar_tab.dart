import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/empty_view.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';

final _earningsCalendarProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, int>((ref, days) async {
  ref.keepAlive(); // calendar data changes daily, fine for a session
  final data = await ApiClient.instance.get(ApiEndpoints.earningsCalendarDays(days))
      as Map<String, dynamic>;
  return (data['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];
});

class EarningsCalendarTab extends ConsumerStatefulWidget {
  const EarningsCalendarTab({super.key});

  @override
  ConsumerState<EarningsCalendarTab> createState() =>
      _EarningsCalendarTabState();
}

class _EarningsCalendarTabState extends ConsumerState<EarningsCalendarTab> {
  int _days = 15;
  String _query = '';
  bool _megaOnly = false;
  String? _sector;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_earningsCalendarProvider(_days));

    // Sectors present in the window drive the filter chips.
    final sectors = <String>{
      for (final e in (async.asData?.value ?? const <Map<String, dynamic>>[]))
        if ((e['sector'] as String? ?? '').isNotEmpty) e['sector'] as String,
    }.toList()
      ..sort();

    return MaxWidthLayout(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildScopeBar(c, sectors),
          Expanded(
            child: async.when(
              loading: () =>
                  const ShimmerList(count: 8, type: ShimmerRowType.signal),
              error: (e, _) => ErrorView(
                message: 'Failed to load earnings calendar',
                onRetry: () =>
                    ref.invalidate(_earningsCalendarProvider(_days)),
              ),
              data: (items) => _buildBody(context, c, items),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScopeBar(AppPalette c, List<String> sectors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.s2,
            runSpacing: AppSpacing.s2,
            children: [
              for (final d in const [7, 15, 30])
                _ScopeChip(
                  label: '$d days',
                  active: _days == d,
                  onTap: () => setState(() => _days = d),
                ),
              _ScopeChip(
                label: 'Mega-caps',
                active: _megaOnly,
                onTap: () => setState(() => _megaOnly = !_megaOnly),
              ),
            ],
          ),
          if (sectors.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s2),
            SizedBox(
              height: 34,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _ScopeChip(
                    label: 'All sectors',
                    active: _sector == null,
                    onTap: () => setState(() => _sector = null),
                  ),
                  for (final s in sectors) ...[
                    const SizedBox(width: AppSpacing.s2),
                    _ScopeChip(
                      label: '${_EarningsRow.sectorEmoji(s)} $s',
                      active: _sector == s,
                      onTap: () =>
                          setState(() => _sector = _sector == s ? null : s),
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.s3),
          TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _query = v),
            style: AppTypography.sm.copyWith(color: c.textPrimary),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Filter by symbol or name…',
              hintStyle: AppTypography.sm.copyWith(color: c.textMuted),
              prefixIcon: Icon(Icons.search, size: 18, color: c.textMuted),
              suffixIcon: _query.isEmpty
                  ? null
                  : GestureDetector(
                      onTap: () {
                        _searchCtrl.clear();
                        setState(() => _query = '');
                      },
                      child: Icon(Icons.close, size: 18, color: c.textMuted),
                    ),
              filled: true,
              fillColor: c.surfaceCard,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s3, vertical: AppSpacing.s3),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
                borderSide: BorderSide(color: c.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
                borderSide: BorderSide(color: c.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
                borderSide: BorderSide(color: c.accent),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
      BuildContext context, AppPalette c, List<Map<String, dynamic>> items) {
    if (items.isEmpty) {
      return const EmptyView(
        icon: Icons.event_outlined,
        title: 'No upcoming earnings',
        body:
            'No S&P 500 earnings reports are scheduled for this window. Try a longer range or check back closer to end of quarter.',
      );
    }

    final q = _query.trim().toLowerCase();
    final filtered = items.where((e) {
      if (_megaOnly && ((e['marketCap'] as num?)?.toDouble() ?? 0) < 100e9) {
        return false;
      }
      if (_sector != null && (e['sector'] as String? ?? '') != _sector) {
        return false;
      }
      if (q.isEmpty) return true;
      final sym = (e['symbol'] as String? ?? '').toLowerCase();
      final name = (e['name'] as String? ?? '').toLowerCase();
      return sym.contains(q) || name.contains(q);
    }).toList();

    if (filtered.isEmpty) {
      return const EmptyView(
        icon: Icons.filter_alt_off_outlined,
        title: 'No matches',
        body: 'No earnings match your current filter.',
      );
    }

    // Group by date (already date-then-marketcap sorted server-side).
    final Map<String, List<Map<String, dynamic>>> grouped = {};
    for (final item in filtered) {
      final date = item['earningsDate'] as String? ?? '';
      grouped.putIfAbsent(date, () => []).add(item);
    }
    final dates = grouped.keys.toList()..sort();
    final today = DateTime.now();
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s2),
            child: Text(
              _summaryLine(filtered.length, grouped),
              style: AppTypography.xs.copyWith(color: c.textMuted),
            ),
          ),
        ),
        for (final date in dates)
          SliverMainAxisGroup(
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _DateHeaderDelegate(
                  c: c,
                  label: _formatDateLabel(date),
                  badge: _badgeFor(date, today, c),
                  count: grouped[date]!.length,
                ),
              ),
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => Padding(
                    padding: const EdgeInsets.fromLTRB(
                        AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s2),
                    child: _EarningsRow(item: grouped[date]![i]),
                  ),
                  childCount: grouped[date]!.length,
                ),
              ),
            ],
          ),
        SliverToBoxAdapter(child: SizedBox(height: AppSpacing.s5 + bottomInset)),
      ],
    );
  }

  String _summaryLine(
      int count, Map<String, List<Map<String, dynamic>>> grouped) {
    String? busiestDate;
    var busiestN = 0;
    grouped.forEach((date, rows) {
      if (rows.length > busiestN) {
        busiestN = rows.length;
        busiestDate = date;
      }
    });
    final base = '$count companies reporting · S&P 500';
    if (busiestDate == null || grouped.length < 2) return base;
    return '$base · Busiest ${_formatDateLabel(busiestDate!)} ($busiestN)';
  }

  String _formatDateLabel(String date) {
    final dt = DateTime.tryParse(date);
    if (dt == null) return date;
    return '${_dayName(dt.weekday)}, ${_monthName(dt.month)} ${dt.day}';
  }

  ({Color color, String label})? _badgeFor(
      String date, DateTime today, AppPalette c) {
    final dt = DateTime.tryParse(date);
    if (dt == null) return null;
    final daysOut =
        dt.difference(DateTime(today.year, today.month, today.day)).inDays;
    if (daysOut <= 0) return (color: c.danger, label: 'Today');
    if (daysOut <= 3) {
      return (
        color: c.warning,
        label: 'in $daysOut day${daysOut == 1 ? '' : 's'}'
      );
    }
    return (color: c.textMuted, label: 'in $daysOut days');
  }

  String _dayName(int weekday) {
    const d = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      'Sunday'
    ];
    return d[(weekday - 1).clamp(0, 6)];
  }

  String _monthName(int month) {
    const m = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
      'Nov', 'Dec'
    ];
    return m[(month - 1).clamp(0, 11)];
  }
}

class _ScopeChip extends StatelessWidget {
  const _ScopeChip(
      {required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        decoration: BoxDecoration(
          color: active ? c.accent.withAlpha(38) : c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
              color: active ? c.accent : c.border, width: active ? 1.2 : 1),
        ),
        child: Text(
          label,
          style: AppTypography.labelSm.copyWith(
            color: active ? c.accent : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _DateHeaderDelegate extends SliverPersistentHeaderDelegate {
  _DateHeaderDelegate({
    required this.c,
    required this.label,
    required this.badge,
    required this.count,
  });
  final AppPalette c;
  final String label;
  final ({Color color, String label})? badge;
  final int count;

  static const double _height = 38;

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      height: _height,
      color: c.background,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, AppSpacing.s1),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          Text(
            label.toUpperCase(),
            style: AppTypography.labelSm
                .copyWith(color: c.textMuted, letterSpacing: 1.2),
          ),
          const SizedBox(width: AppSpacing.s2),
          if (badge != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: badge!.color.withAlpha(30),
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(color: badge!.color.withAlpha(80)),
              ),
              child: Text(badge!.label,
                  style: AppTypography.xs.copyWith(
                      color: badge!.color, fontWeight: FontWeight.w700)),
            ),
          const Spacer(),
          Text('$count',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _DateHeaderDelegate old) =>
      old.label != label ||
      old.count != count ||
      old.badge?.label != badge?.label ||
      old.c != c;
}

class _EarningsRow extends StatelessWidget {
  const _EarningsRow({required this.item});
  final Map<String, dynamic> item;

  // Keyed by the live S&P 500 CSV's GICS sector labels.
  static const _sectorEmoji = {
    'Information Technology': '💻',
    'Financials': '🏦',
    'Health Care': '💊',
    'Consumer Discretionary': '🛍️',
    'Consumer Staples': '🛒',
    'Energy': '⚡',
    'Industrials': '🏭',
    'Communication Services': '📡',
    'Materials': '⛏️',
    'Real Estate': '🏠',
    'Utilities': '🔌',
  };

  static String sectorEmoji(String sector) => _sectorEmoji[sector] ?? '📊';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final symbol = item['symbol'] as String? ?? '';
    final name = item['name'] as String? ?? '';
    final sector = item['sector'] as String? ?? '';
    final emoji = _sectorEmoji[sector] ?? '📊';
    final marketCap = item['marketCapFormatted'] as String? ?? '';
    final eps = item['epsForecast'] as String? ?? '';
    final lastYearEps = item['lastYearEps'] as String? ?? '';
    final time = item['time'] as String? ?? '';
    final growth = (item['epsGrowthPct'] as num?)?.round();

    // 🌅 before market open / 🌙 after market close.
    final String timeIcon = time == 'pre-market'
        ? '🌅'
        : time == 'after-hours'
            ? '🌙'
            : '';

    // YoY consensus growth badge (est vs last-year actual).
    final String growthText = growth == null
        ? ''
        : '${growth >= 0 ? '▲' : '▼'} ${growth > 0 ? '+' : ''}$growth%';
    final Color growthColor = (growth ?? 0) >= 0 ? c.accent : c.danger;

    // Sublabel: "$2.7T · est. 1.88 · last year 2.31" — skip any empty pieces.
    final subParts = <String>[
      if (marketCap.isNotEmpty) marketCap,
      if (eps.isNotEmpty) 'est. $eps',
      if (lastYearEps.isNotEmpty) 'last year $lastYearEps',
    ];
    final subtitle = subParts.isNotEmpty ? subParts.join('  ·  ') : sector;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.s2),
      child: GlassCard(
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: () => context.push(
              '/asset/$symbol?name=${Uri.encodeComponent(name)}'),
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
                    Text(subtitle,
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.s2),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(symbol,
                      style: AppTypography.labelSm.copyWith(
                          color: c.accent, fontWeight: FontWeight.w700)),
                  if (growthText.isNotEmpty || timeIcon.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (growthText.isNotEmpty)
                            Text(growthText,
                                style: AppTypography.xs.copyWith(
                                    color: growthColor,
                                    fontWeight: FontWeight.w700)),
                          if (growthText.isNotEmpty && timeIcon.isNotEmpty)
                            const SizedBox(width: 4),
                          if (timeIcon.isNotEmpty)
                            Text(timeIcon,
                                style: const TextStyle(fontSize: 11)),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
