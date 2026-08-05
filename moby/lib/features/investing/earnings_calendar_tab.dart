import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/chip_row.dart';
import '../../shared/widgets/empty_view.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';

// Same regional-indicator-symbol conversion as TariffsData's `flag` getter
// (data/sources/tariffs_data.dart) — mirrored here since that one is bound
// to a different model's field, not exposed as a standalone utility.
String _flagEmoji(String countryCode) {
  if (countryCode.length != 2) return '';
  const base = 0x1F1E6 - 0x41;
  return String.fromCharCode(base + countryCode.codeUnitAt(0)) +
      String.fromCharCode(base + countryCode.codeUnitAt(1));
}

typedef _EarningsScope = ({int days, String? country});
typedef _EarningsResult = ({
  List<Map<String, dynamic>> items,
  List<Map<String, dynamic>> countries,
  bool available,
});

final _earningsCalendarProvider = FutureProvider.autoDispose
    .family<_EarningsResult, _EarningsScope>((ref, scope) async {
  ref.keepAlive(); // calendar data changes daily, fine for a session
  final data = await ApiClient.instance.get(
    ApiEndpoints.earningsCalendarDays(scope.days, country: scope.country),
  ) as Map<String, dynamic>;
  return (
    items: (data['items'] as List?)?.cast<Map<String, dynamic>>() ?? [],
    countries: (data['countries'] as List?)?.cast<Map<String, dynamic>>() ?? [],
    // Absent (null) on the default US path, where it's always effectively true.
    available: data['available'] as bool? ?? true,
  );
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
  // null = default US (sp500) path, unchanged; a country code switches to the
  // Trading Economics snapshot path, gated server-side by a Remote Config toggle.
  String? _country;
  String? _countryDisplayName; // set alongside _country when a chip is tapped
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final scope = (days: _days, country: _country);
    final async = ref.watch(_earningsCalendarProvider(scope));

    final result = async.asData?.value;
    // Sectors present in the window drive the filter chips (empty for
    // country-scoped rows — sector isn't available from the TE snapshot).
    final sectors = <String>{
      for (final e in (result?.items ?? const <Map<String, dynamic>>[]))
        if ((e['sector'] as String? ?? '').isNotEmpty) e['sector'] as String,
    }.toList()
      ..sort();
    final countries = result?.countries ?? const <Map<String, dynamic>>[];

    return MaxWidthLayout(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildScopeBar(c, sectors, countries),
          Expanded(
            child: async.when(
              loading: () =>
                  const ShimmerList(count: 8, type: ShimmerRowType.signal),
              error: (e, _) => ErrorView(
                message: 'Failed to load earnings calendar',
                onRetry: () => ref.invalidate(_earningsCalendarProvider(scope)),
              ),
              data: (result) => result.available
                  ? _buildBody(context, c, result.items)
                  : const EmptyView(
                      icon: Icons.public_off_outlined,
                      title: 'Not available yet',
                      body:
                          'Global earnings data isn\'t available yet for this country.',
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScopeBar(
      AppPalette c, List<String> sectors, List<Map<String, dynamic>> countries) {
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
              AppChip(
                label: '🇺🇸 US',
                active: _country == null,
                onTap: () => setState(() {
                  _country = null;
                  _countryDisplayName = null;
                }),
                textStyle: AppTypography.labelSm,
                animated: true,
              ),
              for (final cty in countries)
                AppChip(
                  label:
                      '${_flagEmoji(cty['code'] as String? ?? '')} ${cty['name'] as String? ?? cty['code'] as String? ?? ''}'
                          .trim(),
                  active: _country == cty['code'],
                  onTap: () => setState(() {
                    _country = cty['code'] as String?;
                    _countryDisplayName = cty['name'] as String?;
                  }),
                  textStyle: AppTypography.labelSm,
                  animated: true,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Wrap(
            spacing: AppSpacing.s2,
            runSpacing: AppSpacing.s2,
            children: [
              for (final d in const [7, 15, 30])
                AppChip(
                  label: '$d days',
                  active: _days == d,
                  onTap: () => setState(() => _days = d),
                  textStyle: AppTypography.labelSm,
                  animated: true,
                ),
              AppChip(
                label: 'Mega-caps',
                active: _megaOnly,
                onTap: () => setState(() => _megaOnly = !_megaOnly),
                textStyle: AppTypography.labelSm,
                animated: true,
              ),
            ],
          ),
          if (sectors.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s2),
            Wrap(
              spacing: AppSpacing.s2,
              runSpacing: AppSpacing.s2,
              children: [
                AppChip(
                  label: 'All sectors',
                  active: _sector == null,
                  onTap: () => setState(() => _sector = null),
                  textStyle: AppTypography.labelSm,
                  animated: true,
                ),
                for (final s in sectors)
                  AppChip(
                    label: '${_EarningsRow.sectorEmoji(s)} $s',
                    active: _sector == s,
                    onTap: () =>
                        setState(() => _sector = _sector == s ? null : s),
                    textStyle: AppTypography.labelSm,
                    animated: true,
                  ),
              ],
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
      return EmptyView(
        icon: Icons.event_outlined,
        title: 'No upcoming earnings',
        body: _country == null
            ? 'No S&P 500 earnings reports are scheduled for this window. Try a longer range or check back closer to end of quarter.'
            : 'No earnings reports are scheduled for this window. Try a longer range.',
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
    final scopeLabel = _country == null ? 'S&P 500' : (_countryDisplayName ?? _country!);
    final base = '$count companies reporting · $scopeLabel';
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
              '/asset/${Uri.encodeComponent(symbol)}?name=${Uri.encodeComponent(name)}'),
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
