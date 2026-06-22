import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/sources/tariffs_data.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/upgrade_sheet.dart';
import 'sector_impact_sheet.dart';

final _tariffsProvider = FutureProvider<List<CountryTariff>>(
    (_) => TariffsData.instance.load());

class CountryDetailScreen extends ConsumerWidget {
  const CountryDetailScreen({super.key, required this.countryCode});
  final String countryCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_tariffsProvider);

    Color rateColor(double rate) {
      if (rate >= 30) return c.danger;
      if (rate >= 15) return c.warning;
      return c.positive;
    }

    return Scaffold(
      backgroundColor: c.background,
      body: async.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: c.accent)),
        error: (_, __) => const ErrorView(message: 'Country not found'),
        data: (countries) {
          final matches =
              countries.where((c) => c.countryCode == countryCode);
          if (matches.isEmpty) {
            return const ErrorView(message: 'Country not found');
          }
          final country = matches.first;

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 180,
                pinned: true,
                backgroundColor: c.headerBg,
                leading: IconButton(
                  icon: Icon(Icons.arrow_back, color: c.textPrimary),
                  onPressed: () => context.pop(),
                ),
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    alignment: Alignment.center,
                    color: c.background,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(height: 40),
                        Text(country.flag,
                            style: const TextStyle(fontSize: 56)),
                        const SizedBox(height: AppSpacing.s3),
                        Text(country.countryName,
                            style: AppTypography.headingLg
                                .copyWith(color: c.textPrimary)),
                      ],
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.all(AppSpacing.s5),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Tariff rate
                    GlassCard(
                      child: Column(
                        children: [
                          Text('US Tariff Rate',
                              style: AppTypography.lg
                                  .copyWith(color: c.textMuted)),
                          const SizedBox(height: AppSpacing.s3),
                          Text(
                            '${country.tariffRate.toStringAsFixed(0)}%',
                            style: AppTypography.xl4.copyWith(
                              fontSize: 40,
                              fontWeight: FontWeight.w800,
                              color: rateColor(country.tariffRate),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.s4),
                          Text(
                            country.laymanExplanation,
                            style: AppTypography.lg.copyWith(
                                color: c.textSecondary, height: 1.6),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.s5),

                    // Sectors
                    Text('Sector Tariff Rates',
                        style: AppTypography.headingSm
                            .copyWith(color: c.textPrimary)),
                    const SizedBox(height: AppSpacing.s3),
                    ...country.sectors.map((s) => _SectorRow(
                          sector: s,
                          countryCode: country.countryCode,
                          countryName: country.countryName,
                        )),

                    // Financial exposure
                    if (country.debtToUSA.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.s5),
                      Text('Financial Exposure to US',
                          style: AppTypography.headingSm
                              .copyWith(color: c.textPrimary)),
                      const SizedBox(height: AppSpacing.s3),
                      ...country.debtToUSA.map((d) => _DebtRow(debt: d)),
                    ],

                    const SizedBox(height: AppSpacing.s5),
                    FilledButton.icon(
                      onPressed: () => context.push(
                          '/country/$countryCode/stocks?name=${Uri.encodeComponent(country.countryName)}'),
                      icon: const Icon(Icons.bar_chart),
                      label: const Text('View Top Listed Stocks'),
                      style: FilledButton.styleFrom(
                        backgroundColor: c.accent,
                        foregroundColor: c.background,
                        minimumSize: const Size(double.infinity, 48),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppRadius.md),
                        ),
                      ),
                    ),
                    SizedBox(height: AppSpacing.s5 + MediaQuery.of(context).padding.bottom + 64),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SectorRow extends StatelessWidget {
  const _SectorRow({
    required this.sector,
    required this.countryCode,
    required this.countryName,
  });

  final SectorTariff sector;
  final String countryCode;
  final String countryName;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    Color rateColor(double rate) {
      if (rate >= 30) return c.danger;
      if (rate >= 15) return c.warning;
      return c.positive;
    }

    final color = rateColor(sector.tariffRate);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s2),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Expanded(
              child: Text(sector.sectorName,
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withAlpha(30),
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
            child: Text(
              '${sector.tariffRate.toStringAsFixed(0)}%',
              style: AppTypography.sm
                  .copyWith(color: color, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: AppSpacing.s2),
          GestureDetector(
            onTap: () {
              if (!EntitlementService.can('exposure_ai')) {
                UpgradeSheet.show(context, feature: 'exposure_ai');
              } else {
                showSectorImpactSheet(
                  context,
                  countryCode: countryCode,
                  countryName: countryName,
                  sectorName: sector.sectorName,
                  tariffRate: sector.tariffRate,
                );
              }
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: c.accentDim18,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    EntitlementService.can('exposure_ai')
                        ? Icons.auto_awesome_rounded
                        : Icons.lock_rounded,
                    size: 11,
                    color: c.accent,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    EntitlementService.can('exposure_ai') ? 'AI' : 'Pro',
                    style: AppTypography.xs.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DebtRow extends StatelessWidget {
  const _DebtRow({required this.debt});
  final DebtDetail debt;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s2),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(debt.category,
                    style: AppTypography.labelMd.copyWith(
                        color: c.textSecondary)),
              ),
              Text(
                '\$${debt.amountBillions.toStringAsFixed(1)}B',
                style: AppTypography.labelMd.copyWith(color: c.accent),
              ),
            ],
          ),
          if (debt.notes.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(debt.notes,
                style: AppTypography.sm.copyWith(color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}
