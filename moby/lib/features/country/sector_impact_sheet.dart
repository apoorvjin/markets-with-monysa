import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/upgrade_sheet.dart';

class _CompEntry {
  final String name;
  final String ticker;
  final double revenueExposurePct;
  final double earningsImpactPct;

  const _CompEntry({
    required this.name,
    required this.ticker,
    required this.revenueExposurePct,
    required this.earningsImpactPct,
  });

  factory _CompEntry.fromJson(Map<String, dynamic> j) => _CompEntry(
        name: j['name'] as String? ?? '',
        ticker: j['ticker'] as String? ?? '',
        revenueExposurePct: (j['revenueExposurePct'] as num?)?.toDouble() ?? 0,
        earningsImpactPct: (j['earningsImpactPct'] as num?)?.toDouble() ?? 0,
      );
}

class _ExposureResult {
  final List<_CompEntry> comps;
  final String summary;
  final bool planRequired;

  const _ExposureResult({
    required this.comps,
    required this.summary,
    this.planRequired = false,
  });

  static const planRequiredSentinel =
      _ExposureResult(comps: [], summary: '', planRequired: true);

  factory _ExposureResult.fromJson(Map<String, dynamic> j) => _ExposureResult(
        comps: (j['comps'] as List? ?? [])
            .map((e) => _CompEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
        summary: j['summary'] as String? ?? '',
      );
}

typedef _Key = ({String country, String sector, double tariffRate});

final _exposureProvider =
    FutureProvider.autoDispose.family<_ExposureResult, _Key>((ref, key) async {
  final url = ApiEndpoints.exposureAnalysis(
    country: key.country,
    sector: key.sector,
    tariffRate: key.tariffRate,
  );
  try {
    final data = await ApiClient.instance.get(url) as Map<String, dynamic>;
    return _ExposureResult.fromJson(data);
  } on DioException catch (e) {
    if (e.response?.statusCode == 403) {
      return _ExposureResult.planRequiredSentinel;
    }
    rethrow;
  }
});

void showSectorImpactSheet(
  BuildContext context, {
  required String countryCode,
  required String countryName,
  required String sectorName,
  required double tariffRate,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SectorImpactSheet(
      countryCode: countryCode,
      countryName: countryName,
      sectorName: sectorName,
      tariffRate: tariffRate,
    ),
  );
}

class _SectorImpactSheet extends ConsumerWidget {
  const _SectorImpactSheet({
    required this.countryCode,
    required this.countryName,
    required this.sectorName,
    required this.tariffRate,
  });

  final String countryCode;
  final String countryName;
  final String sectorName;
  final double tariffRate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final key = (
      country: countryCode,
      sector: sectorName,
      tariffRate: tariffRate,
    );
    final async = ref.watch(_exposureProvider(key));

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (sheetCtx, scrollController) => Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppRadius.lg),
          ),
        ),
        child: Column(
          children: [
            // Handle
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.s3),
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),

            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s5, AppSpacing.s4, AppSpacing.s4, AppSpacing.s3),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          sectorName,
                          style: AppTypography.headingSm
                              .copyWith(color: c.textPrimary),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$countryName · ${tariffRate.toStringAsFixed(0)}% tariff',
                          style: AppTypography.sm
                              .copyWith(color: c.textMuted),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: c.accentDim18,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.auto_awesome_rounded,
                            size: 12, color: c.accent),
                        const SizedBox(width: 4),
                        Text('AI Analysis',
                            style: AppTypography.xs
                                .copyWith(color: c.accent, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            Divider(color: c.border, height: 1),

            // Body
            Expanded(
              child: async.when(
                loading: () => Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(color: c.accent, strokeWidth: 2),
                      const SizedBox(height: AppSpacing.s4),
                      Text('Analyzing earnings impact…',
                          style: AppTypography.sm.copyWith(color: c.textMuted)),
                    ],
                  ),
                ),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.s5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline, color: c.danger, size: 32),
                        const SizedBox(height: AppSpacing.s3),
                        Text('Failed to load analysis',
                            style: AppTypography.labelMd
                                .copyWith(color: c.textPrimary)),
                        const SizedBox(height: AppSpacing.s2),
                        TextButton(
                          onPressed: () =>
                              ref.invalidate(_exposureProvider(key)),
                          child: Text('Retry',
                              style: TextStyle(color: c.accent)),
                        ),
                      ],
                    ),
                  ),
                ),
                data: (result) {
                  if (result.planRequired) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.s6),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: c.accentDim,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(Icons.lock_rounded,
                                  color: c.accent, size: 28),
                            ),
                            const SizedBox(height: AppSpacing.s4),
                            Text('Pro Feature',
                                style: AppTypography.headingSm
                                    .copyWith(color: c.textPrimary)),
                            const SizedBox(height: AppSpacing.s2),
                            Text(
                              'AI Tariff Analysis is available on the Pro plan.',
                              style: AppTypography.md
                                  .copyWith(color: c.textSecondary),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: AppSpacing.s5),
                            FilledButton(
                              onPressed: () {
                                Navigator.of(context).pop();
                                UpgradeSheet.show(context,
                                    feature: 'exposure_ai');
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: c.accent,
                                foregroundColor: Colors.black,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(
                                        AppRadius.md)),
                              ),
                              child: const Text('View Plans'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return ListView(
                  controller: scrollController,
                  padding: EdgeInsets.fromLTRB(
                      AppSpacing.s5,
                      AppSpacing.s5,
                      AppSpacing.s5,
                      AppSpacing.s5 + MediaQuery.of(sheetCtx).padding.bottom),
                  children: [
                    // Summary card
                    if (result.summary.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(AppSpacing.s4),
                        decoration: BoxDecoration(
                          color: c.surfaceCard,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          result.summary,
                          style: AppTypography.sm
                              .copyWith(color: c.textSecondary, height: 1.6),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.s5),
                    ],

                    // Comps table header
                    if (result.comps.isNotEmpty) ...[
                      Text('Key Exposed Companies',
                          style: AppTypography.labelMd
                              .copyWith(color: c.textMuted)),
                      const SizedBox(height: AppSpacing.s3),
                      _CompsHeader(c: c),
                      const SizedBox(height: AppSpacing.s2),
                      ...result.comps.map((comp) => _CompRow(comp: comp, c: c)),
                    ],

                    const SizedBox(height: AppSpacing.s4),
                    Text(
                      'Estimates based on public disclosures and analyst consensus. '
                      'Not financial advice.',
                      style: AppTypography.xs
                          .copyWith(color: c.textFaint, height: 1.5),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.s3),
                  ],
                );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompsHeader extends StatelessWidget {
  const _CompsHeader({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text('Company',
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
          ),
          SizedBox(
            width: 72,
            child: Text('Rev. Exp.',
                textAlign: TextAlign.right,
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
          ),
          SizedBox(
            width: 72,
            child: Text('EPS Impact',
                textAlign: TextAlign.right,
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _CompRow extends StatelessWidget {
  const _CompRow({required this.comp, required this.c});
  final _CompEntry comp;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final impactColor = comp.earningsImpactPct >= 0 ? c.positive : c.danger;

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
            flex: 5,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(comp.name,
                    style: AppTypography.labelSm
                        .copyWith(color: c.textPrimary)),
                Text(comp.ticker,
                    style: AppTypography.xs
                        .copyWith(color: c.textMuted)),
              ],
            ),
          ),
          SizedBox(
            width: 72,
            child: Text(
              '${comp.revenueExposurePct.toStringAsFixed(0)}%',
              textAlign: TextAlign.right,
              style: AppTypography.labelSm.copyWith(color: c.textSecondary),
            ),
          ),
          SizedBox(
            width: 72,
            child: Text(
              '${comp.earningsImpactPct >= 0 ? '+' : ''}${comp.earningsImpactPct.toStringAsFixed(1)}%',
              textAlign: TextAlign.right,
              style: AppTypography.labelSm.copyWith(
                  color: impactColor, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}
