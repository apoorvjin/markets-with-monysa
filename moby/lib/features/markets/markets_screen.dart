import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/market_item.dart';
import '../../data/repositories/markets_repository.dart';
import '../../shared/widgets/chart_modal.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/theme_toggle.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _indicesProvider = FutureProvider.autoDispose<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchIndices());

final _commoditiesProvider = FutureProvider.autoDispose<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchCommodities());

final _forexProvider = FutureProvider.autoDispose<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchForex());

final _cotProvider = FutureProvider.autoDispose<List<CotMetal>>(
    (_) => MarketsRepository.instance.fetchCotMetals());

final _sectorsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
    (_) => MarketsRepository.instance.fetchSectors());

// Central bank rates for FX differentials
const _cbRates = {
  'USD': {'label': 'Fed', 'rate': 4.33},
  'EUR': {'label': 'ECB', 'rate': 2.40},
  'GBP': {'label': 'BoE', 'rate': 4.25},
  'JPY': {'label': 'BoJ', 'rate': 0.50},
  'CHF': {'label': 'SNB', 'rate': 0.00},
  'AUD': {'label': 'RBA', 'rate': 4.10},
  'NZD': {'label': 'RBNZ', 'rate': 3.50},
  'CAD': {'label': 'BoC', 'rate': 2.75},
};

enum _MarketSort { price, change }

// ── Screen ────────────────────────────────────────────────────────────────────

class MarketsScreen extends StatefulWidget {
  const MarketsScreen({super.key});

  @override
  State<MarketsScreen> createState() => _MarketsScreenState();
}

class _MarketsScreenState extends State<MarketsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Markets',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        actions: const [_AboutButton(), ThemeToggleButton()],
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Indices'),
            Tab(text: 'Commodities'),
            Tab(text: 'Forex'),
            Tab(text: 'Sectors'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [
          _IndicesTab(),
          _CommoditiesTab(),
          _ForexTab(),
          _SectorsTab(),
        ],
      ),
    );
  }
}

// ── Search Field ──────────────────────────────────────────────────────────────

class _SearchField extends StatelessWidget {
  const _SearchField({required this.onChanged});
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s3, AppSpacing.s5, AppSpacing.s2),
      child: TextField(
        onChanged: onChanged,
        style: AppTypography.md.copyWith(color: c.textPrimary),
        decoration: InputDecoration(
          hintText: 'Search by name or symbol...',
          hintStyle: AppTypography.md.copyWith(color: c.textMuted),
          prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
          filled: true,
          fillColor: c.searchBg,
          contentPadding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            borderSide: BorderSide(color: c.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            borderSide: BorderSide(color: c.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            borderSide: BorderSide(color: c.accent, width: 1.5),
          ),
        ),
      ),
    );
  }
}

// ── Sort Header ───────────────────────────────────────────────────────────────

class _SortHeader extends StatelessWidget {
  const _SortHeader({
    required this.sortBy,
    required this.ascending,
    required this.onSortChange,
  });
  final _MarketSort sortBy;
  final bool ascending;
  final void Function(_MarketSort) onSortChange;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text('ASSET',
                style: AppTypography.labelXs.copyWith(color: c.textMuted)),
          ),
          SizedBox(
            width: 80,
            child: _SortBtn(
              label: 'PRICE',
              active: sortBy == _MarketSort.price,
              ascending: ascending,
              onTap: () => onSortChange(_MarketSort.price),
              palette: c,
              align: TextAlign.end,
            ),
          ),
          const SizedBox(width: AppSpacing.s3),
          SizedBox(
            width: 70,
            child: _SortBtn(
              label: '% CHG',
              active: sortBy == _MarketSort.change,
              ascending: ascending,
              onTap: () => onSortChange(_MarketSort.change),
              palette: c,
              align: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _SortBtn extends StatelessWidget {
  const _SortBtn({
    required this.label,
    required this.active,
    required this.ascending,
    required this.onTap,
    required this.palette,
    this.align = TextAlign.start,
  });
  final String label;
  final bool active;
  final bool ascending;
  final VoidCallback onTap;
  final AppPalette palette;
  final TextAlign align;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.max,
        mainAxisAlignment: align == TextAlign.end
            ? MainAxisAlignment.end
            : align == TextAlign.center
                ? MainAxisAlignment.center
                : MainAxisAlignment.start,
        children: [
          Text(label,
              style: AppTypography.labelXs.copyWith(
                  color: active ? c.accent : c.textMuted)),
          if (active)
            Icon(
              ascending ? Icons.arrow_upward : Icons.arrow_downward,
              size: 10,
              color: c.accent,
            ),
        ],
      ),
    );
  }
}

List<MarketItem> _sortItems(
    List<MarketItem> items, _MarketSort sortBy, bool ascending) {
  final sorted = [...items];
  sorted.sort((a, b) {
    double aVal, bVal;
    if (sortBy == _MarketSort.price) {
      aVal = a.price ?? double.negativeInfinity;
      bVal = b.price ?? double.negativeInfinity;
    } else {
      aVal = a.changePercent ?? double.negativeInfinity;
      bVal = b.changePercent ?? double.negativeInfinity;
    }
    return ascending ? aVal.compareTo(bVal) : bVal.compareTo(aVal);
  });
  return sorted;
}

// ── Indices Tab ───────────────────────────────────────────────────────────────

class _IndicesTab extends ConsumerStatefulWidget {
  const _IndicesTab();

  @override
  ConsumerState<_IndicesTab> createState() => _IndicesTabState();
}

class _IndicesTabState extends ConsumerState<_IndicesTab> {
  String _query = '';
  _MarketSort _sortBy = _MarketSort.change;
  bool _ascending = false;

  void _handleSort(_MarketSort field) {
    setState(() {
      if (_sortBy == field) {
        _ascending = !_ascending;
      } else {
        _sortBy = field;
        _ascending = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_indicesProvider);
    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load indices',
        onRetry: () => ref.invalidate(_indicesProvider),
      ),
      data: (items) {
        final filtered = _query.isEmpty
            ? items
            : items
                .where((i) =>
                    i.name.toLowerCase().contains(_query) ||
                    i.symbol.toLowerCase().contains(_query))
                .toList();
        final sorted = _sortItems(filtered, _sortBy, _ascending);
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
            _SortHeader(
              sortBy: _sortBy,
              ascending: _ascending,
              onSortChange: _handleSort,
            ),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? Center(
                      child: Text('No results for "$_query"',
                          style: AppTypography.sm.copyWith(color: c.textMuted)))
                  : RefreshIndicator(
                      color: c.accent,
                      backgroundColor: c.surface,
                      onRefresh: () => ref.refresh(_indicesProvider.future),
                      child: ListView.builder(
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).padding.bottom +
                                AppSpacing.s3),
                        itemCount: sorted.length,
                        itemBuilder: (ctx, i) => _MarketRow(item: sorted[i]),
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }
}

// ── Commodities Tab ───────────────────────────────────────────────────────────

class _CommoditiesTab extends ConsumerStatefulWidget {
  const _CommoditiesTab();

  @override
  ConsumerState<_CommoditiesTab> createState() => _CommoditiesTabState();
}

class _CommoditiesTabState extends ConsumerState<_CommoditiesTab> {
  String _query = '';
  _MarketSort _sortBy = _MarketSort.change;
  bool _ascending = false;

  void _handleSort(_MarketSort field) {
    setState(() {
      if (_sortBy == field) {
        _ascending = !_ascending;
      } else {
        _sortBy = field;
        _ascending = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_commoditiesProvider);
    final cotAsync = ref.watch(_cotProvider);

    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load commodities',
        onRetry: () => ref.invalidate(_commoditiesProvider),
      ),
      data: (items) {
        final filtered = _query.isEmpty
            ? items
            : items
                .where((i) =>
                    i.name.toLowerCase().contains(_query) ||
                    i.symbol.toLowerCase().contains(_query))
                .toList();
        final sorted = _sortItems(filtered, _sortBy, _ascending);
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
            _SortHeader(
              sortBy: _sortBy,
              ascending: _ascending,
              onSortChange: _handleSort,
            ),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? Center(
                      child: Text('No results for "$_query"',
                          style: AppTypography.sm.copyWith(color: c.textMuted)))
                  : RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () async {
                  ref.invalidate(_commoditiesProvider);
                  ref.invalidate(_cotProvider);
                },
                child: ListView(
                  padding: EdgeInsets.only(
                      bottom: MediaQuery.of(context).padding.bottom +
                          AppSpacing.s3),
                  children: [
                    ...sorted.map((item) => _MarketRow(item: item)),
                    if (_query.isEmpty) ...[
                      const SizedBox(height: AppSpacing.s5),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
                        child: Text('CFTC METALS POSITIONING',
                            style: AppTypography.labelSm.copyWith(
                                color: c.textMuted, letterSpacing: 1.2)),
                      ),
                      const SizedBox(height: AppSpacing.s3),
                      cotAsync.when(
                        loading: () => Center(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: CircularProgressIndicator(color: c.accent),
                            )),
                        error: (_, __) => Padding(
                          padding: const EdgeInsets.all(AppSpacing.s5),
                          child: Text('COT data unavailable',
                              style: AppTypography.md.copyWith(color: c.textMuted)),
                        ),
                        data: (metals) => Column(
                          children: metals.map((m) => _CotCard(metal: m)).toList(),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Forex Tab ─────────────────────────────────────────────────────────────────

class _ForexTab extends ConsumerStatefulWidget {
  const _ForexTab();

  @override
  ConsumerState<_ForexTab> createState() => _ForexTabState();
}

class _ForexTabState extends ConsumerState<_ForexTab> {
  String _query = '';
  _MarketSort _sortBy = _MarketSort.change;
  bool _ascending = false;

  void _handleSort(_MarketSort field) {
    setState(() {
      if (_sortBy == field) {
        _ascending = !_ascending;
      } else {
        _sortBy = field;
        _ascending = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_forexProvider);
    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load forex',
        onRetry: () => ref.invalidate(_forexProvider),
      ),
      data: (items) {
        final filtered = _query.isEmpty
            ? items
            : items
                .where((i) =>
                    i.name.toLowerCase().contains(_query) ||
                    i.symbol.toLowerCase().contains(_query))
                .toList();
        final sorted = _sortItems(filtered, _sortBy, _ascending);

        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
            _SortHeader(
              sortBy: _sortBy,
              ascending: _ascending,
              onSortChange: _handleSort,
            ),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? Center(
                      child: Text('No results for "$_query"',
                          style: AppTypography.sm.copyWith(color: c.textMuted)))
                  : RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () => ref.refresh(_forexProvider.future),
                child: _query.isEmpty
                    ? ListView(
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).padding.bottom +
                                AppSpacing.s3),
                        children: (() {
                          final grouped = <String, List<MarketItem>>{};
                          for (final item in items) {
                            (grouped[item.region ?? 'Other'] ??= []).add(item);
                          }
                          // Sort within each group
                          for (final key in grouped.keys) {
                            grouped[key] = _sortItems(grouped[key]!, _sortBy, _ascending);
                          }
                          return grouped.entries.expand((entry) => [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                  AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, AppSpacing.s2),
                              child: Text(
                                entry.key.toUpperCase(),
                                style: AppTypography.labelSm
                                    .copyWith(color: c.textMuted, letterSpacing: 1.2),
                              ),
                            ),
                            ...entry.value.map((item) => _MarketRow(item: item, isForex: true)),
                          ]).toList();
                        })(),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).padding.bottom +
                                AppSpacing.s3),
                        itemCount: sorted.length,
                        itemBuilder: (ctx, i) =>
                            _MarketRow(item: sorted[i], isForex: true),
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Market Row ────────────────────────────────────────────────────────────────

class _MarketRow extends StatelessWidget {
  const _MarketRow({required this.item, this.isForex = false});
  final MarketItem item;
  final bool isForex;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = item.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr = pct == null
        ? '--'
        : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';

    return InkWell(
      onTap: () => ChartModal.show(context, symbol: item.symbol, name: item.name),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
        ),
        child: Row(
          children: [
            if (item.flag != null) ...[
              Text(item.flag!, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: AppSpacing.s3),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name,
                      style: AppTypography.labelLg
                          .copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(item.symbol,
                      style: AppTypography.sm.copyWith(color: c.textMuted)),
                  if (isForex) ...[
                    const SizedBox(height: 2),
                    _FxDifferential(symbol: item.symbol),
                  ],
                ],
              ),
            ),
            // Price column
            SizedBox(
              width: 80,
              child: Text(
                _formatPrice(item.price, item.unit),
                style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                textAlign: TextAlign.end,
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            // % Change column
            SizedBox(
              width: 70,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isUp ? c.positiveDim : c.dangerDim,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(pctStr,
                    style: AppTypography.sm.copyWith(
                        color: pctColor, fontWeight: FontWeight.w600),
                    textAlign: TextAlign.center),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(double? price, String? unit) {
    if (price == null) return '--';
    if (unit == 'JPY' || price > 1000) {
      return price.toStringAsFixed(0);
    }
    if (price < 1) return price.toStringAsFixed(4);
    return price.toStringAsFixed(2);
  }
}

// ── COT Card ──────────────────────────────────────────────────────────────────

class _CotCard extends StatelessWidget {
  const _CotCard({required this.metal});
  final CotMetal metal;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sentimentColor = metal.sentiment.toLowerCase().contains('bull')
        ? c.positive
        : metal.sentiment.toLowerCase().contains('bear')
            ? c.danger
            : c.warning;

    return Container(
      margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('${metal.emoji} ${metal.name}',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: sentimentColor.withAlpha(30),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text(metal.sentiment,
                    style: AppTypography.sm
                        .copyWith(color: sentimentColor, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          _SentimentBar(longPct: metal.longPct, palette: c),
          const SizedBox(height: AppSpacing.s3),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Stat('Long', '${metal.longContracts.toStringAsFixed(0)}', c.positive, c),
              _Stat('Short', '${metal.shortContracts.toStringAsFixed(0)}', c.danger, c),
              _Stat('Net', '${metal.netPosition > 0 ? '+' : ''}${metal.netPosition}',
                  metal.netPosition >= 0 ? c.positive : c.danger, c),
            ],
          ),
        ],
      ),
    );
  }
}

class _SentimentBar extends StatelessWidget {
  const _SentimentBar({required this.longPct, required this.palette});
  final double longPct;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Long ${longPct.toStringAsFixed(1)}%',
                style: AppTypography.xs.copyWith(color: c.positive)),
            Text('Short ${(100 - longPct).toStringAsFixed(1)}%',
                style: AppTypography.xs.copyWith(color: c.danger)),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Row(
            children: [
              Expanded(
                flex: (longPct * 100).toInt(),
                child: Container(height: 6, color: c.positive),
              ),
              Expanded(
                flex: ((100 - longPct) * 100).toInt(),
                child: Container(height: 6, color: c.danger),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.color, this.palette);
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.xs.copyWith(color: palette.textMuted)),
        Text(value,
            style: AppTypography.sm.copyWith(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// ── FX Rate Differential ──────────────────────────────────────────────────────

class _FxDifferential extends StatelessWidget {
  const _FxDifferential({required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    // Parse base/quote from symbol like EURUSD=X, GBPUSD=X, USDJPY=X
    // Strip trailing =X suffix and take first 3 / next 3 chars
    final clean = symbol.replaceAll('=X', '');
    if (clean.length < 6) return const SizedBox.shrink();

    final base = clean.substring(0, 3).toUpperCase();
    final quote = clean.substring(3, 6).toUpperCase();

    final baseInfo = _cbRates[base];
    final quoteInfo = _cbRates[quote];
    if (baseInfo == null || quoteInfo == null) return const SizedBox.shrink();

    final baseRate = (baseInfo['rate'] as num).toDouble();
    final quoteRate = (quoteInfo['rate'] as num).toDouble();
    final diff = baseRate - quoteRate;
    final diffColor = diff >= 0 ? c.positive : c.danger;
    final diffStr = '${diff >= 0 ? '+' : ''}${diff.toStringAsFixed(2)}%';

    return Text(
      "${baseInfo['label']} ${baseRate.toStringAsFixed(2)}% vs ${quoteInfo['label']} ${quoteRate.toStringAsFixed(2)}% ($diffStr) · May 2026",
      style: AppTypography.xs.copyWith(color: diffColor),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

// ── Sectors Tab ───────────────────────────────────────────────────────────────

class _SectorsTab extends ConsumerStatefulWidget {
  const _SectorsTab();

  @override
  ConsumerState<_SectorsTab> createState() => _SectorsTabState();
}

class _SectorsTabState extends ConsumerState<_SectorsTab> {
  // Sort: null = default (1M perf), otherwise the field name
  String _sortField = 'perf1M';
  bool _ascending = false;

  void _handleSort(String field) {
    setState(() {
      if (_sortField == field) {
        _ascending = !_ascending;
      } else {
        _sortField = field;
        _ascending = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_sectorsProvider);
    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load sector data',
        onRetry: () => ref.invalidate(_sectorsProvider),
      ),
      data: (sectors) {
        final sorted = [...sectors]..sort((a, b) {
            final aVal = (a[_sortField] as num?)?.toDouble() ?? double.negativeInfinity;
            final bVal = (b[_sortField] as num?)?.toDouble() ?? double.negativeInfinity;
            return _ascending ? aVal.compareTo(bVal) : bVal.compareTo(aVal);
          });
        return Column(
          children: [
            _SectorSortHeader(
              sortField: _sortField,
              ascending: _ascending,
              onSort: _handleSort,
            ),
            Expanded(
              child: RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () => ref.refresh(_sectorsProvider.future),
                child: ListView.builder(
                  padding: EdgeInsets.only(
                      bottom: MediaQuery.of(context).padding.bottom +
                          AppSpacing.s3),
                  itemCount: sorted.length,
                  itemBuilder: (_, i) =>
                      _SectorRow(sector: sorted[i], rank: i + 1, sortField: _sortField),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SectorSortHeader extends StatelessWidget {
  const _SectorSortHeader({
    required this.sortField,
    required this.ascending,
    required this.onSort,
  });
  final String sortField;
  final bool ascending;
  final void Function(String) onSort;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fields = [
      ('1D', 'changePercent'),
      ('1W', 'perf1W'),
      ('1M', 'perf1M'),
      ('3M', 'perf3M'),
      ('6M', 'perf6M'),
      ('1Y', 'perf1Y'),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text('SECTOR',
                style: AppTypography.labelXs.copyWith(color: c.textMuted)),
          ),
          ...fields.map((f) => GestureDetector(
                onTap: () => onSort(f.$2),
                child: Padding(
                  padding: const EdgeInsets.only(left: AppSpacing.s4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(f.$1,
                          style: AppTypography.labelXs.copyWith(
                              color: sortField == f.$2 ? c.accent : c.textMuted)),
                      if (sortField == f.$2)
                        Icon(
                          ascending ? Icons.arrow_upward : Icons.arrow_downward,
                          size: 9,
                          color: c.accent,
                        ),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }
}

class _SectorRow extends StatelessWidget {
  const _SectorRow({
    required this.sector,
    required this.rank,
    required this.sortField,
  });
  final Map<String, dynamic> sector;
  final int rank;
  final String sortField;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final activePerf = (sector[sortField] as num?)?.toDouble() ?? 0;
    final isTop = rank <= 3;
    final isBottom = rank >= 9;

    return Container(
      margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s1),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      decoration: BoxDecoration(
        color: isTop
            ? c.positive.withAlpha(15)
            : isBottom
                ? c.danger.withAlpha(15)
                : c.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Text(sector['emoji'] as String? ?? '',
              style: const TextStyle(fontSize: 20)),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text(sector['name'] as String? ?? '',
                style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          ),
          _PctCell(
              label: '1D',
              value: (sector['changePercent'] as num?)?.toDouble(),
              active: sortField == 'changePercent',
              palette: c),
          const SizedBox(width: AppSpacing.s4),
          _PctCell(
              label: '1W',
              value: (sector['perf1W'] as num?)?.toDouble(),
              active: sortField == 'perf1W',
              palette: c),
          const SizedBox(width: AppSpacing.s4),
          _PctCell(
              label: '1M',
              value: (sector['perf1M'] as num?)?.toDouble(),
              active: sortField == 'perf1M',
              palette: c),
          const SizedBox(width: AppSpacing.s4),
          _PctCell(
              label: '3M',
              value: (sector['perf3M'] as num?)?.toDouble(),
              active: sortField == 'perf3M',
              palette: c),
          const SizedBox(width: AppSpacing.s4),
          _PctCell(
              label: '6M',
              value: (sector['perf6M'] as num?)?.toDouble(),
              active: sortField == 'perf6M',
              palette: c),
          const SizedBox(width: AppSpacing.s4),
          _PctCell(
              label: '1Y',
              value: (sector['perf1Y'] as num?)?.toDouble(),
              active: sortField == 'perf1Y',
              palette: c),
        ],
      ),
    );
  }
}

class _PctCell extends StatelessWidget {
  const _PctCell({
    required this.label,
    required this.value,
    required this.palette,
    this.active = false,
  });
  final String label;
  final double? value;
  final AppPalette palette;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final color = v == null
        ? palette.textMuted
        : (v >= 0 ? palette.positive : palette.danger);
    final str = v == null
        ? '--'
        : '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
    return SizedBox(
      width: 36,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(label,
              style: AppTypography.xs.copyWith(
                  color: active ? palette.accent : palette.textMuted,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400)),
          Text(str,
              style: AppTypography.sm.copyWith(
                  color: color, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ── About / Privacy ───────────────────────────────────────────────────────────

class _AboutButton extends StatelessWidget {
  const _AboutButton();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.info_outline_rounded, size: 20),
      tooltip: 'About & Privacy',
      onPressed: () => _showAbout(context),
    );
  }
}

void _showAbout(BuildContext context) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) {
      final c = ctx.colors;
      return Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.lg)),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: c.border,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.s5),
                Text('Moby — Market Intelligence',
                    style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
                const SizedBox(height: AppSpacing.s2),
                Text('Real-time tariff exposure, global markets, and AI trading signals.',
                    style: AppTypography.sm.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.s5),
                Text('DATA SOURCES',
                    style: AppTypography.labelXs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'Market prices from Yahoo Finance · CFTC Disaggregated COT Report · '
                  'US Treasury FiscalData API · Tariff data reflects April 2025 USTR schedules.',
                  style: AppTypography.sm.copyWith(color: c.textSecondary),
                ),
                const SizedBox(height: AppSpacing.s4),
                Text('PRIVACY',
                    style: AppTypography.labelXs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'Moby does not collect, store, or share any personal data. '
                  'No account or registration is required. All market data is fetched '
                  'in real time from public APIs and is not retained on our servers.',
                  style: AppTypography.sm.copyWith(color: c.textSecondary),
                ),
                const SizedBox(height: AppSpacing.s4),
                Text('DISCLAIMER',
                    style: AppTypography.labelXs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'Trading signals are for informational purposes only and do not '
                  'constitute financial advice. Past performance is not indicative '
                  'of future results.',
                  style: AppTypography.sm.copyWith(color: c.textSecondary),
                ),
                const SizedBox(height: AppSpacing.s5),
              ],
            ),
          ),
        ),
      );
    },
  );
}
