import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/sources/tariffs_data.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _tariffsProvider = FutureProvider<List<CountryTariff>>(
    (_) => TariffsData.instance.load());

// ── GDP map (IMF 2024 estimates, USD billions) ────────────────────────────────
// Used as proxy for market/economic size; larger = higher priority default sort.
const _gdpBillions = <String, double>{
  'US': 27360, 'CN': 17794, 'DE': 4456, 'JP': 4213, 'IN': 3568,
  'GB': 3087, 'FR': 2924, 'IT': 2169, 'CA': 2139, 'KR': 1710,
  'AU': 1693, 'BR': 2081, 'ES': 1582, 'MX': 1322, 'ID': 1319,
  'NL': 1118, 'SA': 1068, 'TR': 1108, 'CH': 905, 'PL': 748,
  'TW': 751, 'AR': 633, 'SE': 593, 'BE': 627, 'TH': 514,
  'IE': 533, 'AT': 477, 'NO': 547, 'IL': 508, 'AE': 505,
  'MY': 399, 'SG': 467, 'BD': 421, 'ZA': 377, 'EG': 347,
  'VN': 433, 'PH': 404, 'PK': 338, 'CL': 317, 'FI': 307,
  'DK': 395, 'RO': 301, 'CZ': 330, 'CO': 334, 'NZ': 247,
  'HU': 213, 'PT': 266, 'KZ': 259, 'GR': 238, 'SK': 122,
  'QA': 211, 'PE': 268, 'KW': 163, 'EC': 115, 'ET': 155,
  'TZ': 84, 'GH': 76, 'DZ': 191, 'MA': 142, 'TN': 46,
  'LK': 84, 'MM': 59, 'KH': 30, 'OM': 93, 'CR': 74,
  'UG': 51, 'CI': 70, 'TT': 23, 'SV': 34, 'JO': 44,
  'GT': 93, 'DO': 120, 'HN': 34, 'PA': 75, 'LB': 24,
  'JM': 17, 'EU': 18500, 'NG': 373, 'KE': 107, 'SD': 33,
  'CM': 47, 'ZM': 29, 'SN': 28, 'MZ': 20, 'MG': 16,
  'MU': 14, 'BF': 20, 'ML': 19, 'NE': 17, 'MW': 14,
  'RW': 13, 'SL': 4, 'TG': 9, 'BJ': 17, 'GN': 22,
  'BO': 45, 'PY': 43, 'UY': 77, 'VE': 97, 'SY': 11,
  'IQ': 264, 'LY': 37, 'YE': 21, 'AF': 14,
  'NP': 42, 'LA': 15, 'FJ': 5, 'PG': 31,
  'MN': 20, 'BT': 3, 'MD': 16, 'GE': 29, 'AM': 24,
  'AZ': 72, 'UZ': 90, 'TM': 59, 'KG': 11, 'TJ': 11,
  'BH': 44, 'PS': 18, 'CY': 35, 'MT': 20,
  'LU': 87, 'IS': 29, 'ME': 7, 'MK': 15, 'AL': 23,
  'BA': 27, 'RS': 73, 'HR': 82, 'SI': 67, 'EE': 42,
  'LV': 45, 'LT': 77, 'BY': 73, 'UA': 179, 'ZW': 26,
  'MR': 9, 'MV': 7, 'BS': 14, 'BB': 5,
  'GY': 19, 'SR': 4, 'BZ': 3, 'NI': 15, 'HT': 21,
};

enum _ExposureSort { marketSize, rate, name }

// ── Embeddable body (used in Investing › Exposure tab) ───────────────────────

class ExposureBody extends ConsumerStatefulWidget {
  const ExposureBody({super.key});

  @override
  ConsumerState<ExposureBody> createState() => _ExposureBodyState();
}

class _ExposureBodyState extends ConsumerState<ExposureBody> {
  String _search = '';
  _ExposureSort _sortBy = _ExposureSort.marketSize;
  bool _ascending = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_tariffsProvider);

    return async.when(
      loading: () =>
          Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) =>
          const ErrorView(message: 'Failed to load tariff data'),
      data: (countries) {
        var list = countries.toList();
        if (_search.isNotEmpty) {
          final q = _search.toLowerCase();
          list = list
              .where((country) =>
                  country.countryName.toLowerCase().contains(q) ||
                  country.countryCode.toLowerCase().contains(q))
              .toList();
        }
        list.sort((a, b) {
          switch (_sortBy) {
            case _ExposureSort.marketSize:
              final aGdp = _gdpBillions[a.countryCode] ?? 0.0;
              final bGdp = _gdpBillions[b.countryCode] ?? 0.0;
              return _ascending
                  ? aGdp.compareTo(bGdp)
                  : bGdp.compareTo(aGdp);
            case _ExposureSort.rate:
              return _ascending
                  ? a.tariffRate.compareTo(b.tariffRate)
                  : b.tariffRate.compareTo(a.tariffRate);
            case _ExposureSort.name:
              return _ascending
                  ? a.countryName.compareTo(b.countryName)
                  : b.countryName.compareTo(a.countryName);
          }
        });

        final maxRate = countries
            .map((c) => c.tariffRate)
            .reduce((a, b) => a > b ? a : b);
        final avgRate = countries
                .map((c) => c.tariffRate)
                .reduce((a, b) => a + b) /
            countries.length;
        final minRate = countries
            .map((c) => c.tariffRate)
            .reduce((a, b) => a < b ? a : b);

        return MaxWidthLayout(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
                decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: c.border))),
                child: Row(
                  children: [
                    _StatBadge('Highest',
                        '${maxRate.toStringAsFixed(0)}%', c.danger, c),
                    const SizedBox(width: AppSpacing.s5),
                    _StatBadge('Average',
                        '${avgRate.toStringAsFixed(1)}%', c.warning, c),
                    const SizedBox(width: AppSpacing.s5),
                    _StatBadge('Lowest',
                        '${minRate.toStringAsFixed(0)}%', c.positive, c),
                    const Spacer(),
                    Text('${countries.length} countries',
                        style: AppTypography.sm
                            .copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.s4),
                child: TextField(
                  onChanged: (v) => setState(() => _search = v),
                  decoration: InputDecoration(
                    hintText: 'Search countries...',
                    prefixIcon: Icon(Icons.search, color: c.textMuted),
                  ),
                  style: AppTypography.lg.copyWith(color: c.textPrimary),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
                child: Row(
                  children: [
                    Text('RANK',
                        style: AppTypography.labelXs
                            .copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s3),
                    _SortButton(
                      label: 'COUNTRY',
                      active: _sortBy == _ExposureSort.name,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (_sortBy == _ExposureSort.name) {
                          _ascending = !_ascending;
                        } else {
                          _sortBy = _ExposureSort.name;
                          _ascending = true;
                        }
                      }),
                    ),
                    const Spacer(),
                    _SortButton(
                      label: 'MKT SIZE',
                      active: _sortBy == _ExposureSort.marketSize,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (_sortBy == _ExposureSort.marketSize) {
                          _ascending = !_ascending;
                        } else {
                          _sortBy = _ExposureSort.marketSize;
                          _ascending = false;
                        }
                      }),
                    ),
                    const SizedBox(width: AppSpacing.s4),
                    _SortButton(
                      label: 'RATE',
                      active: _sortBy == _ExposureSort.rate,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (_sortBy == _ExposureSort.rate) {
                          _ascending = !_ascending;
                        } else {
                          _sortBy = _ExposureSort.rate;
                          _ascending = false;
                        }
                      }),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: c.border),
              Expanded(
                child: ListView.builder(
                  padding: EdgeInsets.only(
                      bottom: MediaQuery.of(context).padding.bottom),
                  itemCount: list.length,
                  itemBuilder: (ctx, i) => _CountryRow(
                    country: list[i],
                    rank: countries.indexOf(list[i]) + 1,
                    gdp: _gdpBillions[list[i].countryCode],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

class ExposureScreen extends ConsumerWidget {
  const ExposureScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Tariff Exposure',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
      ),
      body: const ExposureBody(),
    );
  }
}

// ── LEGACY build helper (kept for reference) ──────────────────────────────────
// The old _ExposureScreenState is now replaced by ExposureBody above.
// ignore: unused_element
class _ExposureScreenState extends ConsumerState<ExposureScreen> {
  String _search = '';
  _ExposureSort _sortBy = _ExposureSort.marketSize;
  bool _ascending = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_tariffsProvider);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Tariff Exposure',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
      ),
      body: async.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: c.accent)),
        error: (e, _) => const ErrorView(message: 'Failed to load tariff data'),
        data: (countries) {
          var list = countries.toList();
          if (_search.isNotEmpty) {
            final q = _search.toLowerCase();
            list = list
                .where((country) =>
                    country.countryName.toLowerCase().contains(q) ||
                    country.countryCode.toLowerCase().contains(q))
                .toList();
          }
          list.sort((a, b) {
            switch (_sortBy) {
              case _ExposureSort.marketSize:
                final aGdp = _gdpBillions[a.countryCode] ?? 0.0;
                final bGdp = _gdpBillions[b.countryCode] ?? 0.0;
                return _ascending
                    ? aGdp.compareTo(bGdp)
                    : bGdp.compareTo(aGdp);
              case _ExposureSort.rate:
                return _ascending
                    ? a.tariffRate.compareTo(b.tariffRate)
                    : b.tariffRate.compareTo(a.tariffRate);
              case _ExposureSort.name:
                return _ascending
                    ? a.countryName.compareTo(b.countryName)
                    : b.countryName.compareTo(a.countryName);
            }
          });

          final maxRate = countries
              .map((c) => c.tariffRate)
              .reduce((a, b) => a > b ? a : b);
          final avgRate = countries
              .map((c) => c.tariffRate)
              .reduce((a, b) => a + b) /
              countries.length;
          final minRate = countries
              .map((c) => c.tariffRate)
              .reduce((a, b) => a < b ? a : b);

          return MaxWidthLayout(
            child: Column(
              children: [
                // Summary stats
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
                  decoration: BoxDecoration(
                      border: Border(bottom: BorderSide(color: c.border))),
                  child: Row(
                    children: [
                      _StatBadge('Highest', '${maxRate.toStringAsFixed(0)}%',
                          c.danger, c),
                      const SizedBox(width: AppSpacing.s5),
                      _StatBadge('Average', '${avgRate.toStringAsFixed(1)}%',
                          c.warning, c),
                      const SizedBox(width: AppSpacing.s5),
                      _StatBadge('Lowest', '${minRate.toStringAsFixed(0)}%',
                          c.positive, c),
                      const Spacer(),
                      Text('${countries.length} countries',
                          style: AppTypography.sm
                              .copyWith(color: c.textMuted)),
                    ],
                  ),
                ),
                // Search
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: TextField(
                    onChanged: (v) => setState(() => _search = v),
                    decoration: InputDecoration(
                      hintText: 'Search countries...',
                      prefixIcon: Icon(Icons.search, color: c.textMuted),
                    ),
                    style: AppTypography.lg.copyWith(color: c.textPrimary),
                  ),
                ),
                // Sort header
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
                  child: Row(
                    children: [
                      Text('RANK',
                          style: AppTypography.labelXs
                              .copyWith(color: c.textMuted)),
                      const SizedBox(width: AppSpacing.s3),
                      _SortButton(
                        label: 'COUNTRY',
                        active: _sortBy == _ExposureSort.name,
                        ascending: _ascending,
                        palette: c,
                        onTap: () => setState(() {
                          if (_sortBy == _ExposureSort.name) {
                            _ascending = !_ascending;
                          } else {
                            _sortBy = _ExposureSort.name;
                            _ascending = true;
                          }
                        }),
                      ),
                      const Spacer(),
                      _SortButton(
                        label: 'MKT SIZE',
                        active: _sortBy == _ExposureSort.marketSize,
                        ascending: _ascending,
                        palette: c,
                        onTap: () => setState(() {
                          if (_sortBy == _ExposureSort.marketSize) {
                            _ascending = !_ascending;
                          } else {
                            _sortBy = _ExposureSort.marketSize;
                            _ascending = false;
                          }
                        }),
                      ),
                      const SizedBox(width: AppSpacing.s4),
                      _SortButton(
                        label: 'RATE',
                        active: _sortBy == _ExposureSort.rate,
                        ascending: _ascending,
                        palette: c,
                        onTap: () => setState(() {
                          if (_sortBy == _ExposureSort.rate) {
                            _ascending = !_ascending;
                          } else {
                            _sortBy = _ExposureSort.rate;
                            _ascending = false;
                          }
                        }),
                      ),
                    ],
                  ),
                ),
                Divider(height: 1, color: c.border),
                Expanded(
                  child: ListView.builder(
                    padding: EdgeInsets.only(
                        bottom: MediaQuery.of(context).padding.bottom),
                    itemCount: list.length,
                    itemBuilder: (ctx, i) => _CountryRow(
                      country: list[i],
                      rank: countries.indexOf(list[i]) + 1,
                      gdp: _gdpBillions[list[i].countryCode],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  const _StatBadge(this.label, this.value, this.color, this.palette);
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s3, vertical: AppSpacing.s2),
      decoration: BoxDecoration(
        color: color.withAlpha(15),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: color.withAlpha(50)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: AppTypography.xs.copyWith(color: palette.textMuted)),
          Text(value,
              style: AppTypography.labelLg.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _SortButton extends StatelessWidget {
  const _SortButton({
    required this.label,
    required this.active,
    required this.ascending,
    required this.onTap,
    required this.palette,
  });

  final String label;
  final bool active;
  final bool ascending;
  final VoidCallback onTap;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTypography.labelXs.copyWith(
              color: active ? c.accent : c.textMuted,
            ),
          ),
          if (active)
            Icon(
              ascending ? Icons.arrow_upward : Icons.arrow_downward,
              size: 12,
              color: c.accent,
            ),
        ],
      ),
    );
  }
}

class _CountryRow extends StatelessWidget {
  const _CountryRow({required this.country, required this.rank, this.gdp});
  final CountryTariff country;
  final int rank;
  final double? gdp;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    Color rateColor(double rate) {
      if (rate >= 30) return c.danger;
      if (rate >= 15) return c.warning;
      return c.positive;
    }

    final color = rateColor(country.tariffRate);
    return InkWell(
      onTap: () => context.push('/country/${country.countryCode}'),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border:
              Border(bottom: BorderSide(color: c.border, width: 0.5)),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              child: Text(
                '#$rank',
                style: AppTypography.sm.copyWith(color: c.textMuted),
              ),
            ),
            Text(country.flag,
                style: const TextStyle(fontSize: 20)),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(country.countryName,
                      style: AppTypography.labelLg
                          .copyWith(color: c.textPrimary)),
                  Text(
                    gdp != null
                        ? 'GDP ~\$${_fmtGdp(gdp!)} · ${country.sectors.length} sectors'
                        : '${country.sectors.length} sectors',
                    style: AppTypography.sm.copyWith(color: c.textMuted),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: color.withAlpha(30),
                borderRadius: BorderRadius.circular(AppRadius.xs),
              ),
              child: Text(
                '${country.tariffRate.toStringAsFixed(0)}%',
                style: AppTypography.labelMd.copyWith(
                    color: color, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: AppSpacing.s2),
            Icon(Icons.chevron_right,
                color: c.textMuted, size: 18),
          ],
        ),
      ),
    );
  }

  String _fmtGdp(double gdp) {
    if (gdp >= 1000) return '\$${(gdp / 1000).toStringAsFixed(1)}T';
    return '${gdp.toStringAsFixed(0)}B';
  }
}
