import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/country_health.dart';
import '../../data/repositories/bis_repository.dart';
import '../../data/sources/tariffs_data.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/app_shell_insets.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/pro_blur_overlay.dart';

/// "Country Health" — BIS (Bank for International Settlements) macro
/// conditions for one country at a time: policy rate, private credit/GDP,
/// debt service ratio, property prices, REER. Every row is a real published
/// number plus one mechanical comparison and a label from a fixed threshold —
/// deliberately no blended 0-10 "risk score" (see the scoping discussion this
/// was built from — an invented composite has no BIS methodology behind it).
/// BIS covers ~40-70 economies depending on the series, not FinBrio's full
/// 113-country tariff list, so the picker is restricted to codes the free
/// /coverage endpoint actually reports data for.

const _kSyntheticUsEntry = (name: 'United States', code: 'US');

// ── Providers ─────────────────────────────────────────────────────────────────

final _tariffCountriesProvider =
    FutureProvider<List<CountryTariff>>((_) => TariffsData.instance.load());

// Coverage barely changes (BIS updates monthly/quarterly, server caches 24h).
final _bisCoverageProvider = FutureProvider.autoDispose<Set<String>>((ref) {
  ref.keepAlive();
  return BisRepository.instance.fetchCoverage().then((c) => c.toSet());
});

final _countryHealthProvider = FutureProvider.autoDispose
    .family<CountryHealthData, String>(
        (_, code) => BisRepository.instance.fetchCountryHealth(code));

// Pro-gated server-side — only ever watched when the entitlement check below
// already passed, same reasoning as the per-country panel.
final _rankingProvider = FutureProvider.autoDispose<List<CountryHealthRanking>>(
    (_) => BisRepository.instance.fetchRanking());

// ── Tab ───────────────────────────────────────────────────────────────────────

class CountryHealthTab extends ConsumerStatefulWidget {
  const CountryHealthTab({super.key});

  @override
  ConsumerState<CountryHealthTab> createState() => _CountryHealthTabState();
}

class _CountryHealthTabState extends ConsumerState<CountryHealthTab> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String? _selectedCode;
  String? _selectedName;
  String _selectedFlag = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 200), () {
        if (mounted) setState(() => _query = _searchCtrl.text.trim());
      });
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _select(String code, String name, String flag) {
    setState(() {
      _selectedCode = code;
      _selectedName = name;
      _selectedFlag = flag;
      _searchCtrl.clear();
      _query = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bottomInset =
        appShellBottomInset(context) + MediaQuery.of(context).viewInsets.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(AppSpacing.s4, AppSpacing.s4, AppSpacing.s4,
          AppSpacing.s4 + bottomInset),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Country Health',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: 2),
          Text('BIS macro conditions — one country at a time',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.s4),
          TextField(
            controller: _searchCtrl,
            style: AppTypography.sm.copyWith(color: c.textPrimary),
            decoration: InputDecoration(
              hintText: 'Search a country…',
              hintStyle: AppTypography.sm.copyWith(color: c.textFaint),
              prefixIcon:
                  Icon(Icons.search_rounded, size: 18, color: c.textMuted),
              filled: true,
              fillColor: c.searchBg,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s3, vertical: AppSpacing.s3),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          if (_selectedCode == null && _query.isEmpty) ...[
            _MostFlaggedSection(onSelect: _select),
            const SizedBox(height: AppSpacing.s4),
          ],
          if (_selectedCode != null && _query.isEmpty)
            _SelectedHeader(
              name: _selectedName!,
              flag: _selectedFlag,
              onChange: () => setState(() => _selectedCode = null),
            )
          else
            _CountryPicker(query: _query, onSelect: _select),
          if (_selectedCode != null && _query.isEmpty) ...[
            const SizedBox(height: AppSpacing.s4),
            _CountryHealthPanel(code: _selectedCode!),
          ],
        ],
      ),
    );
  }
}

class _SelectedHeader extends StatelessWidget {
  const _SelectedHeader(
      {required this.name, required this.flag, required this.onChange});
  final String name;
  final String flag;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text(flag, style: const TextStyle(fontSize: 20)),
        const SizedBox(width: AppSpacing.s2),
        Expanded(
          child: Text(name,
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        ),
        GestureDetector(
          onTap: onChange,
          child: Text('Change',
              style: AppTypography.sm
                  .copyWith(color: c.accent, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}

// ── Country Picker ───────────────────────────────────────────────────────────

class _CountryPicker extends ConsumerWidget {
  const _CountryPicker({required this.query, required this.onSelect});
  final String query;
  final void Function(String code, String name, String flag) onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final tariffsAsync = ref.watch(_tariffCountriesProvider);
    final coverageAsync = ref.watch(_bisCoverageProvider);

    return tariffsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.s5),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => ErrorView(
        message: 'Could not load country list',
        onRetry: () => ref.invalidate(_tariffCountriesProvider),
      ),
      data: (tariffCountries) => coverageAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: AppSpacing.s5),
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (_, __) => ErrorView(
          message: 'Could not load BIS coverage',
          onRetry: () => ref.invalidate(_bisCoverageProvider),
        ),
        data: (coverage) {
          // tariffs.json is "countries the US tariffs" and deliberately
          // excludes the US itself — add it back so it's pickable here.
          final all = <({String name, String code})>[
            _kSyntheticUsEntry,
            for (final t in tariffCountries)
              (name: t.countryName, code: t.countryCode),
          ];
          final available = all.where((e) => coverage.contains(e.code)).toList()
            ..sort((a, b) => a.name.compareTo(b.name));
          final q = query.toLowerCase();
          final filtered = q.isEmpty
              ? available
              : available
                  .where((e) =>
                      e.name.toLowerCase().contains(q) ||
                      e.code.toLowerCase().contains(q))
                  .toList();

          if (filtered.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.s5),
              child: Center(
                child: Text('No matching country has BIS data',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
            );
          }

          // No cap: BIS coverage is ~50-70 countries total, small enough to
          // show in full — an arbitrary .take(N) here just silently hides
          // everything past it with no way to reach it (real bug, caught by
          // screenshot: list went dead alphabetically at "Luxembourg").
          return Column(
            children: [
              for (final e in filtered)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Text(_flagOf(e.code),
                      style: const TextStyle(fontSize: 18)),
                  title: Text(e.name,
                      style: AppTypography.sm.copyWith(color: c.textPrimary)),
                  onTap: () => onSelect(e.code, e.name, _flagOf(e.code)),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _flagOf(String code) {
  if (code.length != 2) return '';
  const base = 0x1F1E6 - 0x41;
  return String.fromCharCode(base + code.codeUnitAt(0)) +
      String.fromCharCode(base + code.codeUnitAt(1));
}

// ── Most Flagged (ranking) ────────────────────────────────────────────────────
// "N of M flagged" is a plain COUNT of metrics landing on their single most-
// stressed label — never a weighted score. Pro-gated server-side, so this
// section is skipped entirely for free users rather than shown as a locked
// teaser (the panel itself already carries the full paywall experience).

class _MostFlaggedSection extends ConsumerWidget {
  const _MostFlaggedSection({required this.onSelect});
  final void Function(String code, String name, String flag) onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!EntitlementService.can('country_financial_conditions')) {
      return const SizedBox.shrink();
    }
    final c = context.colors;
    final async = ref.watch(_rankingProvider);
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (rankings) {
        final top = rankings.take(8).toList();
        if (top.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Most Flagged',
                style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
            const SizedBox(height: 2),
            Text('Count of stressed metrics, not a weighted score',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
            const SizedBox(height: AppSpacing.s3),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: top.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(width: AppSpacing.s2),
                itemBuilder: (ctx, i) {
                  final r = top[i];
                  return GestureDetector(
                    onTap: () => onSelect(
                        r.countryCode, r.countryName, _flagOf(r.countryCode)),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.s3, vertical: AppSpacing.s2),
                      decoration: BoxDecoration(
                        color: c.surfaceCard,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                        border: Border.all(color: c.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_flagOf(r.countryCode),
                              style: const TextStyle(fontSize: 14)),
                          const SizedBox(width: 6),
                          Text(r.countryName,
                              style: AppTypography.sm
                                  .copyWith(color: c.textPrimary)),
                          const SizedBox(width: 6),
                          Text('${r.flaggedCount}/${r.availableCount}',
                              style: AppTypography.labelSm.copyWith(
                                  color: r.flaggedCount > 0
                                      ? c.danger
                                      : c.textMuted,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

class _CountryHealthPanel extends ConsumerWidget {
  const _CountryHealthPanel({required this.code});
  final String code;

  bool get _isPro => EntitlementService.can('country_financial_conditions');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    // Server-side 403s for free devices — check the gate before ever calling
    // the endpoint, same reasoning as the AI Macro Briefing (never fire a
    // request that's guaranteed to fail), and show a static locked teaser
    // that still communicates the shape of what's behind it.
    if (!_isPro) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: ProBlurOverlay(
          isPositive: true,
          feature: 'country_financial_conditions',
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: _PanelSkeleton(),
        ),
      );
    }

    final async = ref.watch(_countryHealthProvider(code));
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.s5),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => ErrorView(
        message: 'Could not load Country Health data',
        onRetry: () => ref.invalidate(_countryHealthProvider(code)),
      ),
      data: (data) {
        final anyAvailable = data.metrics.any((m) => m.available);
        if (!anyAvailable) {
          return Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Text(
              'Financial conditions data not available for this country — '
              'BIS covers a subset of major and emerging economies.',
              style: AppTypography.sm.copyWith(color: c.textMuted),
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final m in data.metrics) ...[
              _MetricRow(metric: m),
              const SizedBox(height: AppSpacing.s2),
            ],
          ],
        );
      },
    );
  }
}

class _PanelSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < 5; i++)
          Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.s2),
            height: 56,
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
      ],
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.metric});
  final CountryHealthMetric metric;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (!metric.available) {
      return Container(
        padding: const EdgeInsets.all(AppSpacing.s3),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(metric.label,
                  style: AppTypography.sm.copyWith(color: c.textMuted)),
            ),
            Text('Not available',
                style: AppTypography.xs.copyWith(color: c.textFaint)),
          ],
        ),
      );
    }

    final comparison = metric.change12m != null
        ? '${metric.change3m?.toStringAsFixed(0) ?? "—"}bp (3M) · ${metric.change12m!.toStringAsFixed(0)}bp (12M)'
        : metric.deviation10y != null
            ? '${metric.deviation10y! >= 0 ? "+" : ""}${metric.deviation10y!.toStringAsFixed(1)} vs 10Y avg'
            : null;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(metric.label,
                    style:
                        AppTypography.labelSm.copyWith(color: c.textPrimary)),
              ),
              Text('${metric.value!.toStringAsFixed(2)} ${metric.unit}',
                  style: AppTypography.numericLg.copyWith(
                      color: c.textPrimary, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              if (comparison != null)
                Expanded(
                  child: Text(comparison,
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                ),
              if (metric.tag != null) _Tag(text: metric.tag!),
            ],
          ),
          if (metric.asOf != null) ...[
            const SizedBox(height: 2),
            Text('as of ${metric.asOf}',
                style: AppTypography.xs.copyWith(color: c.textFaint)),
          ],
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.accent.withAlpha(25),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(text,
          style: AppTypography.xs
              .copyWith(color: c.accent, fontWeight: FontWeight.w600)),
    );
  }
}
