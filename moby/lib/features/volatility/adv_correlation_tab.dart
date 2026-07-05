import 'dart:async';
import 'package:dio/dio.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/adv_correlation_models.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../providers/custom_correlation_symbols_provider.dart';
import '../../shared/widgets/app_shell_insets.dart';
import '../../shared/widgets/correlation_matrix_grid.dart';
import '../../shared/widgets/error_view.dart';

/// New, additive "Adv Correlation" tab — sits next to the existing
/// CorrelationTab (untouched). Bigger market-cap-ranked universe, a
/// timeframe selector, a real scrollable matrix, user-pinned custom
/// symbols, and a rolling-correlation drill-down.

// ── Providers ─────────────────────────────────────────────────────────────────

final _advCorrelationProvider =
    FutureProvider.autoDispose.family<AdvCorrelationData, String>((ref, window) {
  ref.keepAlive(); // server-cached 4h; stable within a session
  return TradingRepository.instance.fetchAdvCorrelation(window: window);
});

final _advCorrelationCustomProvider = FutureProvider.autoDispose
    .family<AdvCorrelationData, ({String symbolsCsv, String window})>((ref, args) {
  final symbols = args.symbolsCsv.split(',').where((s) => s.isNotEmpty).toList();
  return TradingRepository.instance.fetchAdvCorrelationCustom(
    symbols: symbols,
    window: args.window,
  );
});

final _advCorrelationHistoryProvider = FutureProvider.autoDispose
    .family<CorrelationHistoryData, ({String a, String b})>((ref, args) {
  return TradingRepository.instance.fetchAdvCorrelationHistory(a: args.a, b: args.b);
});

final _advSearchProvider = FutureProvider.autoDispose
    .family<List<StockSearchResult>, String>(
  (_, query) => TradingRepository.instance.searchStocks(query),
);

// ── Tab Widget ────────────────────────────────────────────────────────────────

const _kWindows = <(String, String)>[
  ('1m', '1M'), ('3m', '3M'), ('6m', '6M'), ('1y', '1Y'),
];
const _kCategories = <String>[
  'All', 'Commodities', 'Indices', 'Crypto', 'Forex', 'Stocks',
];

class AdvCorrelationTab extends ConsumerStatefulWidget {
  const AdvCorrelationTab({super.key});

  @override
  ConsumerState<AdvCorrelationTab> createState() => _AdvCorrelationTabState();
}

class _AdvCorrelationTabState extends ConsumerState<AdvCorrelationTab> {
  String _window = '3m';
  String _categoryFilter = 'All';
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  String _debouncedQuery = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.removeListener(_onSearchChanged);
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _debouncedQuery = _searchCtrl.text.trim());
    });
  }

  void _showPairHistory(BuildContext context, AdvCorrelationSymbol a, AdvCorrelationSymbol b) {
    showAppBottomSheet(
      context: context,
      builder: (_) => _PairHistorySheet(a: a, b: b),
    );
  }

  void _showInfo(BuildContext context) {
    showAppBottomSheet(
      context: context,
      builder: (sheetContext) => const _AdvCorrelationInfoSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_advCorrelationProvider(_window));
    final pinned = ref.watch(customCorrelationSymbolsProvider);

    return Column(
      children: [
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Adv Correlation',
                        style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                    const SizedBox(height: 2),
                    Text('180+ assets · market-cap-ranked stocks',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => _showInfo(context),
                child: Icon(Icons.info_outline_rounded, size: 20, color: c.textMuted),
              ),
            ],
          ),
        ),
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, 0, AppSpacing.s4, AppSpacing.s3),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (int i = 0; i < _kWindows.length; i++) ...[
                  _Chip(
                    label: _kWindows[i].$2,
                    active: _window == _kWindows[i].$1,
                    onTap: () => setState(() => _window = _kWindows[i].$1),
                  ),
                  if (i < _kWindows.length - 1) const SizedBox(width: AppSpacing.s2),
                ],
              ],
            ),
          ),
        ),
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (int i = 0; i < _kCategories.length; i++) ...[
                  _Chip(
                    label: _kCategories[i],
                    active: _categoryFilter == _kCategories[i],
                    onTap: () => setState(() => _categoryFilter = _kCategories[i]),
                  ),
                  if (i < _kCategories.length - 1) const SizedBox(width: AppSpacing.s2),
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
              message: e is DioException && e.response?.statusCode == 503
                  ? 'Correlation data is still warming up after a deploy — this can take a couple of minutes. Try again shortly.'
                  : 'Failed to load correlation data',
              onRetry: () => ref.invalidate(_advCorrelationProvider(_window)),
            ),
            data: (data) => _AdvCorrelationContent(
              data: data,
              categoryFilter: _categoryFilter,
              pinnedSymbols: pinned,
              window: _window,
              searchCtrl: _searchCtrl,
              debouncedQuery: _debouncedQuery,
              onClearSearch: () {
                _searchCtrl.clear();
                setState(() => _debouncedQuery = '');
              },
              onCellTap: (a, b) => _showPairHistory(context, a, b),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Content ───────────────────────────────────────────────────────────────────

class _AdvCorrelationContent extends ConsumerWidget {
  const _AdvCorrelationContent({
    required this.data,
    required this.categoryFilter,
    required this.pinnedSymbols,
    required this.window,
    required this.searchCtrl,
    required this.debouncedQuery,
    required this.onClearSearch,
    required this.onCellTap,
  });

  final AdvCorrelationData data;
  final String categoryFilter;
  final List<String> pinnedSymbols;
  final String window;
  final TextEditingController searchCtrl;
  final String debouncedQuery;
  final VoidCallback onClearSearch;
  final void Function(AdvCorrelationSymbol a, AdvCorrelationSymbol b) onCellTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final visible = categoryFilter == 'All'
        ? List<int>.generate(data.symbols.length, (i) => i)
        : [
            for (int i = 0; i < data.symbols.length; i++)
              if (data.symbols[i].category == categoryFilter) i,
          ];
    final visSymbols = [for (final i in visible) data.symbols[i]];
    final visMatrix = [
      for (final i in visible)
        [for (final j in visible) (i < data.matrix.length && j < data.matrix[i].length) ? data.matrix[i][j] : 0.0],
    ];

    // Scaffold has resizeToAvoidBottomInset: false (see volatility_screen.dart),
    // so this scroll view must push its own content above the keyboard —
    // otherwise the search field near the bottom (Your Custom Picks) is
    // covered instead of being scrolled into view.
    final bottomInset = appShellBottomInset(context) + MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          AppSpacing.s4, AppSpacing.s4, AppSpacing.s4, AppSpacing.s4 + bottomInset),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (data.staleSymbols.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: AppSpacing.s3),
              padding: const EdgeInsets.all(AppSpacing.s3),
              decoration: BoxDecoration(
                color: c.warningDim,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(
                'Data delayed for: ${data.staleSymbols.join(", ")}',
                style: AppTypography.xs.copyWith(color: c.warning),
              ),
            ),
          Text('${visSymbols.length} assets · ${data.lastUpdated}',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.s4),
          _StrongestPairsCard(symbols: visSymbols, matrix: visMatrix),
          const SizedBox(height: AppSpacing.s5),
          Text('Correlation Matrix',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          Container(
            height: 440,
            decoration: BoxDecoration(
              border: Border.all(color: c.border),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            clipBehavior: Clip.antiAlias,
            child: CorrelationMatrixGrid(
              symbols: visSymbols,
              matrix: visMatrix,
              onCellTap: onCellTap,
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          _CustomPicksCard(
            pinnedSymbols: pinnedSymbols,
            window: window,
            searchCtrl: searchCtrl,
            debouncedQuery: debouncedQuery,
            onClearSearch: onClearSearch,
            onCellTap: onCellTap,
          ),
        ],
      ),
    );
  }
}

// ── Strongest Pairs ───────────────────────────────────────────────────────────

class _StrongestPairsCard extends StatelessWidget {
  const _StrongestPairsCard({required this.symbols, required this.matrix});
  final List<AdvCorrelationSymbol> symbols;
  final List<List<double>> matrix;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pairs = <(AdvCorrelationSymbol, AdvCorrelationSymbol, double)>[];
    for (int i = 0; i < symbols.length; i++) {
      for (int j = i + 1; j < symbols.length; j++) {
        if (i < matrix.length && j < matrix[i].length) {
          pairs.add((symbols[i], symbols[j], matrix[i][j]));
        }
      }
    }
    pairs.sort((a, b) => b.$3.abs().compareTo(a.$3.abs()));
    final top = pairs.take(5).toList();

    if (top.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Strongest Relationships',
              style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          for (final p in top)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.s2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${p.$1.flag} ${p.$1.symbol}  ↔  ${p.$2.flag} ${p.$2.symbol}',
                      style: AppTypography.sm.copyWith(color: c.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    p.$3.toStringAsFixed(2),
                    style: AppTypography.labelSm.copyWith(
                      color: p.$3 >= 0 ? c.positive : c.danger,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Custom Picks ──────────────────────────────────────────────────────────────

class _CustomPicksCard extends ConsumerWidget {
  const _CustomPicksCard({
    required this.pinnedSymbols,
    required this.window,
    required this.searchCtrl,
    required this.debouncedQuery,
    required this.onClearSearch,
    required this.onCellTap,
  });

  final List<String> pinnedSymbols;
  final String window;
  final TextEditingController searchCtrl;
  final String debouncedQuery;
  final VoidCallback onClearSearch;
  final void Function(AdvCorrelationSymbol a, AdvCorrelationSymbol b) onCellTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final searchAsync = debouncedQuery.length >= 2
        ? ref.watch(_advSearchProvider(debouncedQuery))
        : null;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your Custom Picks',
              style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          TextField(
            controller: searchCtrl,
            style: AppTypography.sm.copyWith(color: c.textPrimary),
            decoration: InputDecoration(
              hintText: 'Search any symbol to add (max 12)…',
              hintStyle: AppTypography.sm.copyWith(color: c.textFaint),
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
          if (searchAsync != null)
            searchAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.s3),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, __) => const SizedBox.shrink(),
              data: (results) => Column(
                children: [
                  for (final r in results.take(8))
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.symbol,
                          style: AppTypography.sm.copyWith(color: c.textPrimary)),
                      subtitle: Text(r.name,
                          style: AppTypography.xs.copyWith(color: c.textMuted)),
                      onTap: () {
                        ref
                            .read(customCorrelationSymbolsProvider.notifier)
                            .add(r.symbol);
                        onClearSearch();
                      },
                    ),
                ],
              ),
            ),
          if (pinnedSymbols.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s3),
            Wrap(
              spacing: AppSpacing.s2,
              runSpacing: AppSpacing.s2,
              children: [
                for (final s in pinnedSymbols)
                  _Chip(
                    label: '$s ✕',
                    active: true,
                    onTap: () => ref
                        .read(customCorrelationSymbolsProvider.notifier)
                        .remove(s),
                  ),
              ],
            ),
          ],
          if (pinnedSymbols.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s4),
            _CustomMatrix(symbols: pinnedSymbols, window: window, onCellTap: onCellTap),
          ],
        ],
      ),
    );
  }
}

class _CustomMatrix extends ConsumerWidget {
  const _CustomMatrix({required this.symbols, required this.window, required this.onCellTap});
  final List<String> symbols;
  final String window;
  final void Function(AdvCorrelationSymbol a, AdvCorrelationSymbol b) onCellTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final args = (symbolsCsv: symbols.join(','), window: window);
    final async = ref.watch(_advCorrelationCustomProvider(args));

    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.s4),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Text('Could not load custom correlations',
          style: AppTypography.xs.copyWith(color: c.textMuted)),
      data: (data) => Container(
        height: 320,
        decoration: BoxDecoration(
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        clipBehavior: Clip.antiAlias,
        child: CorrelationMatrixGrid(
          symbols: data.symbols,
          matrix: data.matrix,
          onCellTap: onCellTap,
        ),
      ),
    );
  }
}

// ── Pair History Drill-down ───────────────────────────────────────────────────

class _PairHistorySheet extends ConsumerWidget {
  const _PairHistorySheet({required this.a, required this.b});
  final AdvCorrelationSymbol a;
  final AdvCorrelationSymbol b;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async =
        ref.watch(_advCorrelationHistoryProvider((a: a.symbol, b: b.symbol)));
    final bottomInset = appShellBottomInset(context);

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      padding: EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s4 + bottomInset),
      child: SingleChildScrollView(
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
            Text('${a.symbol} vs ${b.symbol}',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            Text('30-day rolling correlation',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
            const SizedBox(height: AppSpacing.s4),
            SizedBox(
              height: 240,
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => Center(
                  child: Text('Could not load history',
                      style: AppTypography.sm.copyWith(color: c.textMuted)),
                ),
                data: (data) => _RollingCorrelationChart(data: data),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RollingCorrelationChart extends StatelessWidget {
  const _RollingCorrelationChart({required this.data});
  final CorrelationHistoryData data;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (data.points.isEmpty) {
      return Center(
        child: Text('Not enough overlapping history',
            style: AppTypography.sm.copyWith(color: c.textMuted)),
      );
    }
    final spots = data.points
        .asMap()
        .entries
        .map((e) => FlSpot(e.key.toDouble(), e.value.r))
        .toList();

    return LineChart(
      LineChartData(
        minY: -1,
        maxY: 1,
        gridData: FlGridData(
          horizontalInterval: 0.5,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(color: c.border, strokeWidth: 0.5),
        ),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              interval: 0.5,
              reservedSize: 36,
              getTitlesWidget: (v, _) => Text(v.toStringAsFixed(1),
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              interval: (data.points.length / 4).clamp(1, double.infinity),
              reservedSize: 24,
              getTitlesWidget: (v, _) {
                final i = v.toInt();
                if (i < 0 || i >= data.points.length) return const SizedBox.shrink();
                return Text(data.points[i].date.substring(5),
                    style: AppTypography.xs.copyWith(color: c.textMuted));
              },
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            curveSmoothness: 0.25,
            color: c.accent,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(show: true, color: c.accentDim18),
          ),
        ],
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (spots) => spots
                .map((s) => LineTooltipItem(
                      s.y.toStringAsFixed(2),
                      AppTypography.xs.copyWith(color: c.textPrimary),
                    ))
                .toList(),
          ),
        ),
      ),
    );
  }
}

// ── Page Info Sheet ───────────────────────────────────────────────────────────

class _AdvCorrelationInfoSheet extends StatelessWidget {
  const _AdvCorrelationInfoSheet();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bottomInset = appShellBottomInset(context);
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s5 + bottomInset),
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
            Text('How Adv Correlation Works',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            const SizedBox(height: AppSpacing.s3),
            Text(
              'A much bigger, auto-updating correlation matrix than the original '
              'Correlation tab — 180+ symbols across commodities, indices, crypto, '
              'forex, and market-cap-ranked stocks (top constituents of Dow/Nasdaq '
              '100, FTSE 100, Nikkei 225, Nifty 50, and Hang Seng, re-ranked weekly).',
              style: AppTypography.sm.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.s4),
            _InfoRow(
              c: c,
              icon: Icons.schedule_rounded,
              title: 'Timeframe chips (1M/3M/6M/1Y)',
              desc: 'Recompute the same 180+ symbols\' Pearson correlation over a '
                  'shorter or longer daily-close window.',
            ),
            _InfoRow(
              c: c,
              icon: Icons.filter_alt_outlined,
              title: 'Category chips',
              desc: 'Filter the matrix down to one asset class at a time.',
            ),
            _InfoRow(
              c: c,
              icon: Icons.grid_on_rounded,
              title: 'Matrix',
              desc: 'Tap any flag/symbol header for its full name. Tap any cell '
                  '(not the diagonal) to see how that pair\'s correlation has '
                  'shifted over the past year.',
            ),
            _InfoRow(
              c: c,
              icon: Icons.add_circle_outline_rounded,
              title: 'Your Custom Picks',
              desc: 'Search and pin up to 12 symbols of your own. They\'re '
                  'correlated against each other plus a fixed set of macro '
                  'anchors (SPY, QQQ, Gold, Oil, USD, Bitcoin, VIX, 10Y yield, '
                  'EUR/USD, Copper) — not the full 180-symbol universe, to keep '
                  'this on-demand lookup fast.',
            ),
            const SizedBox(height: AppSpacing.s3),
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
                  Icon(Icons.lightbulb_outline_rounded, size: 16, color: c.accent),
                  const SizedBox(width: AppSpacing.s2),
                  Expanded(
                    child: Text(
                      'The base matrix refreshes every 4 hours in the background — '
                      'if a symbol\'s data briefly fails to fetch, it shows the last '
                      'known values and is flagged under "Data delayed for".',
                      style: AppTypography.xs.copyWith(color: c.accent),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.c,
    required this.icon,
    required this.title,
    required this.desc,
  });
  final AppPalette c;
  final IconData icon;
  final String title;
  final String desc;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: c.textMuted),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: AppTypography.labelSm.copyWith(color: c.textPrimary)),
                const SizedBox(height: 2),
                Text(desc, style: AppTypography.xs.copyWith(color: c.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Chip ──────────────────────────────────────────────────────────────────────

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});
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
