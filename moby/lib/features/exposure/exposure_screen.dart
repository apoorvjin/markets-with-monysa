import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/sources/tariffs_data.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _tariffsProvider = FutureProvider<List<CountryTariff>>(
    (_) => TariffsData.instance.load());

// ── Screen ────────────────────────────────────────────────────────────────────

class ExposureScreen extends ConsumerStatefulWidget {
  const ExposureScreen({super.key});

  @override
  ConsumerState<ExposureScreen> createState() => _ExposureScreenState();
}

class _ExposureScreenState extends ConsumerState<ExposureScreen> {
  String _search = '';
  bool _sortByRate = true;
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
        actions: const [ThemeToggleButton()],
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
          list.sort((a, b) => _sortByRate
              ? (_ascending
                  ? a.tariffRate.compareTo(b.tariffRate)
                  : b.tariffRate.compareTo(a.tariffRate))
              : (_ascending
                  ? a.countryName.compareTo(b.countryName)
                  : b.countryName.compareTo(a.countryName)));

          final maxRate = countries.map((country) => country.tariffRate).reduce((a, b) => a > b ? a : b);
          final avgRate = countries.map((country) => country.tariffRate).reduce((a, b) => a + b) / countries.length;
          final minRate = countries.map((country) => country.tariffRate).reduce((a, b) => a < b ? a : b);

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
                    const SizedBox(width: AppSpacing.s3),
                    _StatBadge('Average', '${avgRate.toStringAsFixed(1)}%',
                        c.warning, c),
                    const SizedBox(width: AppSpacing.s3),
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
                    Text('RANK', style: AppTypography.labelXs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s3),
                    _SortButton(
                      label: 'COUNTRY',
                      active: !_sortByRate,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (!_sortByRate) {
                          _ascending = !_ascending;
                        } else {
                          _sortByRate = false;
                          _ascending = true;
                        }
                      }),
                    ),
                    const Spacer(),
                    _SortButton(
                      label: 'RATE',
                      active: _sortByRate,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (_sortByRate) {
                          _ascending = !_ascending;
                        } else {
                          _sortByRate = true;
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
                  itemCount: list.length,
                  itemBuilder: (ctx, i) => _CountryRow(
                    country: list[i],
                    rank: countries.indexOf(list[i]) + 1,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTypography.xs.copyWith(color: palette.textMuted)),
        Text(value,
            style: AppTypography.labelLg.copyWith(color: color)),
      ],
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
  const _CountryRow({required this.country, required this.rank});
  final CountryTariff country;
  final int rank;

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
                      style: AppTypography.labelLg.copyWith(color: c.textPrimary)),
                  Text('${country.sectors.length} sectors',
                      style: AppTypography.sm.copyWith(
                          color: c.textMuted)),
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
}
