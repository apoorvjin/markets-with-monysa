import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/market_item.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/markets_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/app_logo_badge.dart';
import '../../shared/widgets/chart_modal.dart';
import '../../shared/widgets/chip_row.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/pro_blur_overlay.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/sparkline_chart.dart';
import 'treemap_tab.dart';

// ── Providers ─────────────────────────────────────────────────────────────────
// Non-autoDispose: data survives tab switches so switching tabs never re-fetches.

final _indicesProvider = FutureProvider<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchIndices());

final _commoditiesProvider = FutureProvider<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchCommodities());

final _forexProvider = FutureProvider<List<MarketItem>>(
    (_) => MarketsRepository.instance.fetchForex());

final _cotProvider = FutureProvider<CotData>(
    (_) => MarketsRepository.instance.fetchCotData());

final _cbRatesProvider = FutureProvider<Map<String, CbRateInfo>>(
    (_) => MarketsRepository.instance.fetchCentralBankRates());

enum _MarketSort { name, price, change, relevance }

// ── Screen ────────────────────────────────────────────────────────────────────

class MarketsScreen extends ConsumerStatefulWidget {
  const MarketsScreen({super.key});

  @override
  ConsumerState<MarketsScreen> createState() => _MarketsScreenState();
}

class _MarketsScreenState extends ConsumerState<MarketsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 5, vsync: this);
    // Pre-warm all tabs in parallel so switching never triggers a fresh fetch.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(_indicesProvider);
      ref.read(_commoditiesProvider);
      ref.read(_forexProvider);
      ref.read(_cotProvider);
      ref.read(_cbRatesProvider);
    });
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
      // See feedback_keyboard_squish memory: without this, the TabBar appBar
      // + keyboard leaves almost no body height for the search field + list,
      // rendering as an empty black gap. Same fix as TradingScreen/MacroScreen.
      resizeToAvoidBottomInset: false,
      backgroundColor: c.background,
      appBar: AppBar(
        centerTitle: true,
        leading: const AppLogoBadge(),
        title: Text('Markets',
            style: AppTypography.headingLg
                .copyWith(color: c.textPrimary, fontWeight: FontWeight.w800)),
        backgroundColor: c.headerBg,
        actions: const [_GlobalSearchButton(), _AboutButton()],
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: 'Heatmap'),
            Tab(text: 'Indices'),
            Tab(text: 'Commodities'),
            Tab(text: 'Forex'),
            Tab(text: 'CFTC'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [
          TreemapTab(),
          _IndicesTab(),
          _CommoditiesTab(),
          _ForexTab(),
          _CftcTab(),
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
    this.assetLabel = 'ASSET',
    this.priceLabel = 'PRICE',
    this.changeLabel = '% CHG',
  });
  final _MarketSort sortBy;
  final bool ascending;
  final void Function(_MarketSort) onSortChange;
  final String assetLabel;
  final String priceLabel;
  final String changeLabel;

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
            child: _SortBtn(
              label: assetLabel,
              active: sortBy == _MarketSort.name,
              ascending: ascending,
              onTap: () => onSortChange(_MarketSort.name),
              palette: c,
              align: TextAlign.start,
            ),
          ),
          SizedBox(
            width: 80,
            child: _SortBtn(
              label: priceLabel,
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
              label: changeLabel,
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
  // Server already returns items in a curated relevance order (indices by
  // market cap — WORLD_INDICES; forex by liquidity — FOREX_PAIRS, both in
  // markets.ts) — preserve that fetched order as-is rather than re-sorting.
  if (sortBy == _MarketSort.relevance) return items;
  final sorted = [...items];
  sorted.sort((a, b) {
    if (sortBy == _MarketSort.name) {
      return ascending ? a.name.compareTo(b.name) : b.name.compareTo(a.name);
    }
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
  // Indices default to the server's market-cap-ordered list rather than
  // being pre-sorted by daily % change.
  _MarketSort _sortBy = _MarketSort.relevance;
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
      loading: () => const ShimmerList(count: 10),
      error: (e, _) => ErrorView(
        message: 'Failed to load indices',
        onRetry: () => ref.invalidate(_indicesProvider),
      ),
      data: (items) {
        final repo = MarketsRepository.instance;
        final filtered = _query.isEmpty
            ? items
            : items
                .where((i) =>
                    i.name.toLowerCase().contains(_query) ||
                    i.symbol.toLowerCase().contains(_query))
                .toList();
        final sorted = _sortItems(filtered, _sortBy, _ascending);
        // Grouped-by-region cards only make sense on the untouched
        // market-cap order — sorting by Value/% 1D is a "find the biggest
        // mover globally" intent, which grouping would work against, so an
        // explicit sort (or an active search) falls back to a flat list.
        final grouped = _sortBy == _MarketSort.relevance && _query.isEmpty;
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
            _SortHeader(
              sortBy: _sortBy,
              ascending: _ascending,
              onSortChange: _handleSort,
              assetLabel: 'INDEX',
              priceLabel: 'VALUE',
              changeLabel: '% 1D',
            ),
            if (repo.isIndicesStale)
              _StaleBanner(onRefresh: () => ref.invalidate(_indicesProvider))
            else if (repo.indicesLastUpdated != null)
              FreshnessBar(lastUpdated: repo.indicesLastUpdated!),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? _NoSearchResults(query: _query)
                  : RefreshIndicator(
                      color: c.accent,
                      backgroundColor: c.surface,
                      onRefresh: () => ref.refresh(_indicesProvider.future),
                      child: grouped
                          ? _GroupedIndexList(items: sorted)
                          : _FlatIndexList(items: sorted),
                    ),
            ),
          ],
        );
      },
    );
  }
}

/// Stable group-by-category (server already returns items in market-cap
/// order, so both the group order — by first-occurrence — and each group's
/// internal order fall out of that for free, no extra sort needed).
Map<String, List<MarketItem>> _groupByCategory(List<MarketItem> items) {
  final groups = <String, List<MarketItem>>{};
  for (final item in items) {
    (groups[item.category ?? 'Other'] ??= []).add(item);
  }
  return groups;
}

class _GroupedIndexList extends StatelessWidget {
  const _GroupedIndexList({required this.items});
  final List<MarketItem> items;

  @override
  Widget build(BuildContext context) {
    final groups = _groupByCategory(items);
    return ListView.builder(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).padding.bottom +
              MediaQuery.of(context).viewInsets.bottom +
              AppSpacing.s3),
      itemCount: groups.length,
      itemBuilder: (ctx, i) {
        final entry = groups.entries.elementAt(i);
        return _IndexGroupSection(label: entry.key, items: entry.value);
      },
    );
  }
}

class _IndexGroupSection extends StatelessWidget {
  const _IndexGroupSection({required this.label, required this.items});
  final String label;
  final List<MarketItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s2),
          child: Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                    color: c.accent, borderRadius: BorderRadius.circular(3)),
              ),
              const SizedBox(width: AppSpacing.s2),
              Text(label.toUpperCase(),
                  style: AppTypography.labelSm.copyWith(
                      color: c.textSecondary, letterSpacing: 0.4)),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
          child: Column(
            children: items
                .map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.s2),
                      child: _IndexCard(key: ValueKey(item.symbol), item: item),
                    ))
                .toList(),
          ),
        ),
      ],
    );
  }
}

class _FlatIndexList extends StatelessWidget {
  const _FlatIndexList({required this.items});
  final List<MarketItem> items;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: EdgeInsets.fromLTRB(AppSpacing.s4, AppSpacing.s3, AppSpacing.s4,
          MediaQuery.of(context).padding.bottom +
              MediaQuery.of(context).viewInsets.bottom +
              AppSpacing.s3),
      itemCount: items.length,
      itemBuilder: (ctx, i) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.s2),
        child: _IndexCard(key: ValueKey(items[i].symbol), item: items[i]),
      ),
    );
  }
}

/// Sparkline Rows pattern: elevated card + inline 1-month sparkline, used by
/// any tab whose items carry a `sparkline` (Indices, Commodities). Forex
/// keeps using the flat `_MarketRow` — it doesn't fetch a sparkline.
class _IndexCard extends StatelessWidget {
  const _IndexCard({required this.item, super.key});
  final MarketItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = item.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr =
        pct == null ? '--' : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';
    final subtitle =
        [item.symbol, item.region ?? item.unit].whereType<String>().join(' · ');

    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.md),
      onTap: () {
        HapticFeedback.selectionClick();
        ChartModal.show(context, symbol: item.symbol, name: item.name);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.surfaceElevated,
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Text(item.flag ?? '', style: const TextStyle(fontSize: 18)),
            ),
            const SizedBox(width: AppSpacing.s3),
            SizedBox(
              width: 108,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(item.name,
                      style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: AppTypography.xs.copyWith(color: c.textMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s2),
                child: LayoutBuilder(
                  builder: (ctx, constraints) => SparklineChart(
                    data: item.sparkline ?? const [],
                    color: pctColor,
                    width: constraints.maxWidth,
                    height: 26,
                  ),
                ),
              ),
            ),
            SizedBox(
              width: 76,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_formatPrice(item.price, null),
                      style: AppTypography.numericLg.copyWith(color: c.textPrimary)),
                  const SizedBox(height: 5),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isUp ? c.positiveDim : c.dangerDim,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(pctStr,
                        style: AppTypography.sm.copyWith(
                            color: pctColor, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(double? price, String? unit) {
    if (price == null) return '--';
    if (unit == 'JPY' || price > 1000) return price.toStringAsFixed(0);
    if (price < 1) return price.toStringAsFixed(4);
    return price.toStringAsFixed(2);
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

    return async.when(
      loading: () => const ShimmerList(count: 10),
      error: (e, _) => ErrorView(
        message: 'Failed to load commodities',
        onRetry: () => ref.invalidate(_commoditiesProvider),
      ),
      data: (items) {
        final repo = MarketsRepository.instance;
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
              assetLabel: 'COMMODITY',
            ),
            if (repo.isCommoditiesStale)
              _StaleBanner(onRefresh: () => ref.invalidate(_commoditiesProvider))
            else if (repo.commoditiesLastUpdated != null)
              FreshnessBar(lastUpdated: repo.commoditiesLastUpdated!),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? _NoSearchResults(query: _query)
                  : RefreshIndicator(
                      color: c.accent,
                      backgroundColor: c.surface,
                      onRefresh: () => ref.refresh(_commoditiesProvider.future),
                      child: ListView.builder(
                        padding: EdgeInsets.fromLTRB(
                            AppSpacing.s4, AppSpacing.s3, AppSpacing.s4,
                            MediaQuery.of(context).padding.bottom +
                                MediaQuery.of(context).viewInsets.bottom +
                                AppSpacing.s3),
                        itemCount: sorted.length,
                        itemBuilder: (ctx, i) => Padding(
                              padding: const EdgeInsets.only(bottom: AppSpacing.s2),
                              child: _IndexCard(
                                  key: ValueKey(sorted[i].symbol),
                                  item: sorted[i]),
                            ),
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
  // Default to the server's curated liquidity order (Majors first — see
  // FOREX_PAIRS in markets.ts) rather than pre-sorting by daily % change.
  _MarketSort _sortBy = _MarketSort.relevance;
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
      loading: () => const ShimmerList(count: 12),
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

        final repo = MarketsRepository.instance;
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
            _SortHeader(
              sortBy: _sortBy,
              ascending: _ascending,
              onSortChange: _handleSort,
            ),
            if (repo.isForexStale)
              _StaleBanner(onRefresh: () => ref.invalidate(_forexProvider))
            else if (repo.forexLastUpdated != null)
              FreshnessBar(lastUpdated: repo.forexLastUpdated!),
            Expanded(
              child: filtered.isEmpty && _query.isNotEmpty
                  ? _NoSearchResults(query: _query)
                  : RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () => ref.refresh(_forexProvider.future),
                child: _query.isEmpty
                    ? ListView(
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).padding.bottom +
                                MediaQuery.of(context).viewInsets.bottom +
                                AppSpacing.s3),
                        children: (() {
                          final grouped = <String, List<MarketItem>>{};
                          for (final item in items) {
                            (grouped[item.category ?? 'Other'] ??= []).add(item);
                          }
                          // Sort within each group
                          for (final key in grouped.keys) {
                            grouped[key] = _sortItems(grouped[key]!, _sortBy, _ascending);
                          }
                          var revealed = false;
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
                            ...entry.value.map((item) {
                              final reveal = !revealed;
                              revealed = true;
                              return _MarketRow(
                                  key: ValueKey(item.symbol),
                                  item: item,
                                  isForex: true,
                                  revealFxLabel: reveal);
                            }),
                          ]).toList();
                        })(),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).padding.bottom +
                                MediaQuery.of(context).viewInsets.bottom +
                                AppSpacing.s3),
                        itemCount: sorted.length,
                        itemBuilder: (ctx, i) => _MarketRow(
                              key: ValueKey(sorted[i].symbol),
                              item: sorted[i],
                              isForex: true,
                              revealFxLabel: i == 0),
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

class _MarketRow extends StatefulWidget {
  const _MarketRow({
    required this.item,
    this.isForex = false,
    this.revealFxLabel = false,
    super.key,
  });
  final MarketItem item;
  final bool isForex;
  /// When true, shows the FX rate-comparison label unblurred even for free
  /// users — exactly one row (the first rendered) is always free.
  final bool revealFxLabel;

  @override
  State<_MarketRow> createState() => _MarketRowState();
}

class _MarketRowState extends State<_MarketRow> {
  Color? _flashColor;

  @override
  void didUpdateWidget(_MarketRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldPrice = oldWidget.item.price;
    final newPrice = widget.item.price;
    // Flash briefly when the price ticks up or down on refresh.
    if (oldPrice != null && newPrice != null && oldPrice != newPrice) {
      final c = context.colors;
      final isUp = newPrice > oldPrice;
      setState(() => _flashColor = isUp
          ? c.positive.withAlpha(36)
          : c.danger.withAlpha(36));
      Future.delayed(const Duration(milliseconds: 700), () {
        if (mounted) setState(() => _flashColor = null);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final item = widget.item;
    final pct = item.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr = pct == null
        ? '--'
        : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';

    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        ChartModal.show(context, symbol: item.symbol, name: item.name);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        color: _flashColor ?? Colors.transparent,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
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
                  if (widget.isForex) ...[
                    const SizedBox(height: 2),
                    _FxDifferential(
                        symbol: item.symbol,
                        forceReveal: widget.revealFxLabel),
                  ],
                ],
              ),
            ),
            // Price column
            SizedBox(
              width: 80,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    _formatPrice(item.price, item.unit),
                    key: ValueKey(item.price),
                    style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            // % Change badge
            SizedBox(
              width: 70,
              child: Container(
                width: double.infinity,
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

// ── No Search Results ─────────────────────────────────────────────────────────

class _NoSearchResults extends StatelessWidget {
  const _NoSearchResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: c.accentDim,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.search_off_rounded, color: c.accent, size: 26),
            ),
            const SizedBox(height: AppSpacing.s4),
            Text(
              'No results for "$query"',
              style: AppTypography.lg.copyWith(color: c.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'Try the full ticker symbol\ne.g. AAPL, GC=F, EURUSD=X',
              style: AppTypography.sm.copyWith(color: c.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
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
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
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
                  if (metal.usdBias != null) ...[
                    const SizedBox(height: 3),
                    Text(metal.usdBias!,
                        style: AppTypography.xs.copyWith(
                            color: metal.netPosition >= 0 ? c.positive : c.danger)),
                  ],
                ],
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

// Different metric from _CotCard above (cash-market net buy/sell, not
// futures long/short positioning) — deliberately a distinct card layout
// (no sentiment bar / long-short split) rather than shoehorned into CotMetal.
class _RegionalFlowCard extends StatelessWidget {
  const _RegionalFlowCard({required this.group});
  final RegionalFlowGroup group;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
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
              Expanded(
                child: Text('${group.flag ?? ''} ${group.region} — ${group.market}',
                    style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              ),
              if (group.date != null)
                Text(group.date!,
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          ...group.items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.s3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.label,
                              style: AppTypography.sm.copyWith(color: c.textPrimary)),
                          Text('(${item.category})',
                              style: AppTypography.xs.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ),
                    Expanded(
                      child: _Stat('Buy', item.buyValue.toStringAsFixed(2), c.positive, c),
                    ),
                    Expanded(
                      child: _Stat('Sell', item.sellValue.toStringAsFixed(2), c.danger, c),
                    ),
                    Expanded(
                      child: _Stat(
                        'Net',
                        '${item.netValue >= 0 ? '+' : ''}${item.netValue.toStringAsFixed(2)}',
                        item.netValue >= 0 ? c.positive : c.danger,
                        c,
                      ),
                    ),
                  ],
                ),
              )),
          Text('Values in ${group.unit}',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
          if (group.source != null) ...[
            const SizedBox(height: 2),
            Text('Source: ${group.source}',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
          ],
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

class _FxDifferential extends ConsumerWidget {
  const _FxDifferential({required this.symbol, this.forceReveal = false});
  final String symbol;
  final bool forceReveal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rates = ref.watch(_cbRatesProvider).valueOrNull;
    if (rates == null) return const SizedBox.shrink();

    // Parse base/quote from symbol like EURUSD=X, GBPUSD=X, USDJPY=X
    final clean = symbol.replaceAll('=X', '');
    if (clean.length < 6) return const SizedBox.shrink();

    final base = clean.substring(0, 3).toUpperCase();
    final quote = clean.substring(3, 6).toUpperCase();

    final baseInfo = rates[base];
    final quoteInfo = rates[quote];
    if (baseInfo == null || quoteInfo == null) return const SizedBox.shrink();

    final diff = baseInfo.rate - quoteInfo.rate;
    final diffColor = diff >= 0 ? c.positive : c.danger;
    final diffStr = '${diff >= 0 ? '+' : ''}${diff.toStringAsFixed(2)}%';

    final label = Text(
      "${baseInfo.label} ${baseInfo.rate.toStringAsFixed(2)}% vs "
      "${quoteInfo.label} ${quoteInfo.rate.toStringAsFixed(2)}% ($diffStr)",
      style: AppTypography.xs.copyWith(color: diffColor),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    if (forceReveal || EntitlementService.can('forex_rate_comparison')) {
      return label;
    }

    return SizedBox(
      width: double.infinity,
      child: ProBlurOverlay(
        isPositive: diff >= 0,
        feature: 'forex_rate_comparison',
        child: label,
      ),
    );
  }
}

// ── CFTC Positions Tab ────────────────────────────────────────────────────────

enum _CotCategory { metals, energy, agriculture, currencies, indices, regionalFlows }

class _CftcTab extends ConsumerStatefulWidget {
  const _CftcTab();

  @override
  ConsumerState<_CftcTab> createState() => _CftcTabState();
}

class _CftcTabState extends ConsumerState<_CftcTab> {
  _CotCategory _category = _CotCategory.metals;

  static const _chips = [
    (_CotCategory.metals,        'Metals'),
    (_CotCategory.energy,        'Energy'),
    (_CotCategory.indices,       'Indices & Rates'),
    (_CotCategory.agriculture,   'Agriculture'),
    (_CotCategory.currencies,    'Currencies'),
    (_CotCategory.regionalFlows, 'Regional Flows'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_cotProvider);
    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load COT data',
        onRetry: () => ref.invalidate(_cotProvider),
      ),
      data: (cot) {
        final isRegionalFlows = _category == _CotCategory.regionalFlows;
        final items = switch (_category) {
          _CotCategory.metals        => cot.metals,
          _CotCategory.energy        => cot.energy,
          _CotCategory.agriculture   => cot.agriculture,
          _CotCategory.currencies    => cot.currencies,
          _CotCategory.indices       => cot.indicesRates,
          _CotCategory.regionalFlows => const <CotMetal>[],
        };

        return RefreshIndicator(
          color: c.accent,
          backgroundColor: c.surface,
          onRefresh: () => ref.refresh(_cotProvider.future),
          child: ListView(
            padding: EdgeInsets.only(
              top: AppSpacing.s3,
              bottom: MediaQuery.of(context).padding.bottom + AppSpacing.s3,
            ),
            children: [
              // Category chips
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
                child: Wrap(
                  spacing: AppSpacing.s2,
                  runSpacing: AppSpacing.s2,
                  children: _chips.map((chip) {
                    final selected = _category == chip.$1;
                    return AppChip(
                      label: chip.$2,
                      active: selected,
                      onTap: () => setState(() => _category = chip.$1),
                      textStyle: AppTypography.labelSm,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              if (isRegionalFlows)
                if (cot.regionalFlows.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.s8),
                    child: Center(
                      child: Text('No regional flow data available right now',
                          style: AppTypography.sm.copyWith(color: c.textMuted)),
                    ),
                  )
                else
                  ...cot.regionalFlows.map((g) => _RegionalFlowCard(group: g))
              else if (items.isNotEmpty)
                ...items.asMap().entries.map((entry) {
                  final card = _CotCard(metal: entry.value);
                  final revealed = entry.key == 0 ||
                      EntitlementService.can('cftc_categories');
                  if (revealed) return card;
                  return ProBlurOverlay(
                    isPositive: entry.value.netPosition >= 0,
                    feature: 'cftc_categories',
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: card,
                  );
                })
              else
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.s8),
                  child: Center(
                    child: Text('No data available',
                        style: AppTypography.sm.copyWith(color: c.textMuted)),
                  ),
                ),
              if (!isRegionalFlows && cot.reportDate != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, 0),
                  child: Text('CFTC report date: ${cot.reportDate}',
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                ),
            ],
          ),
        );
      },
    );
  }
}

// ── Freshness / Stale Indicators ──────────────────────────────────────────────

class _StaleBanner extends StatelessWidget {
  const _StaleBanner({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onRefresh,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        color: c.warning.withAlpha(20),
        child: Row(
          children: [
            Icon(Icons.wifi_off_rounded, size: 12, color: c.warning),
            const SizedBox(width: AppSpacing.s2),
            Expanded(
              child: Text(
                'Showing cached data — tap to retry',
                style: AppTypography.xs.copyWith(color: c.warning),
              ),
            ),
            Icon(Icons.refresh_rounded, size: 12, color: c.warning),
          ],
        ),
      ),
    );
  }
}

// ── Global Stock Search ───────────────────────────────────────────────────────

class _GlobalSearchButton extends StatelessWidget {
  const _GlobalSearchButton();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.search_rounded, size: 24),
      tooltip: 'Search any symbol',
      onPressed: () => _showSearchSheet(context),
    );
  }
}

void _showSearchSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    enableDrag: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _GlobalSearchSheet(),
  );
}

class _GlobalSearchSheet extends StatefulWidget {
  const _GlobalSearchSheet();

  @override
  State<_GlobalSearchSheet> createState() => _GlobalSearchSheetState();
}

class _GlobalSearchSheetState extends State<_GlobalSearchSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<StockSearchResult> _results = [];
  bool _loading = false;
  String? _error;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      setState(() { _query = ''; _results = []; _error = null; _loading = false; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(q));
  }

  Future<void> _search(String q) async {
    setState(() { _query = q; _loading = true; _error = null; });
    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.stockSearch,
        params: {'q': q},
      ) as Map<String, dynamic>;
      final list = (data['results'] as List? ?? [])
          .map((e) => StockSearchResult.fromJson(e as Map<String, dynamic>))
          .toList();
      if (mounted) setState(() { _results = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Search failed — check connection'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final maxHeight = MediaQuery.of(context).size.height * 0.85;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 4),
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
            ),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
            child: Row(
              children: [
                Expanded(
                  child: Text('Search Markets',
                      style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                ),
                IconButton(
                  icon: Icon(Icons.close, size: 20, color: c.textMuted),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          // Search field
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s3),
            child: TextField(
              controller: _controller,
              autofocus: true,
              onChanged: _onChanged,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                hintText: 'Symbol or company name...',
                hintStyle: AppTypography.md.copyWith(color: c.textMuted),
                prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
                suffixIcon: _loading
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: c.accent),
                        ),
                      )
                    : null,
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
          ),
          Divider(height: 1, color: c.border),
          // Results
          Flexible(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.s5),
                      child: Text(_error!,
                          style: AppTypography.sm.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center),
                    ),
                  )
                : _query.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s8),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.candlestick_chart_rounded,
                                  size: 40, color: c.textMuted),
                              const SizedBox(height: AppSpacing.s3),
                              Text('Search stocks, ETFs, indices, forex',
                                  style: AppTypography.sm
                                      .copyWith(color: c.textMuted),
                                  textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                      )
                    : _results.isEmpty && !_loading
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.s5),
                              child: Text('No results for "$_query"',
                                  style: AppTypography.sm
                                      .copyWith(color: c.textMuted)),
                            ),
                          )
                        : ListView.builder(
                            padding: EdgeInsets.only(
                                bottom: MediaQuery.of(context).padding.bottom +
                                    AppSpacing.s3),
                            itemCount: _results.length,
                            itemBuilder: (ctx, i) {
                              final r = _results[i];
                              return ListTile(
                                onTap: () {
                                  Navigator.of(context).pop();
                                  ChartModal.show(context,
                                      symbol: r.symbol, name: r.name);
                                },
                                title: Text(r.symbol,
                                    style: AppTypography.labelLg
                                        .copyWith(color: c.textPrimary)),
                                subtitle: Text(r.name,
                                    style: AppTypography.sm
                                        .copyWith(color: c.textMuted),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    if (r.exchange.isNotEmpty)
                                      Text(r.exchange,
                                          style: AppTypography.xs
                                              .copyWith(color: c.textMuted)),
                                    Text(r.type,
                                        style: AppTypography.xs
                                            .copyWith(color: c.accent)),
                                  ],
                                ),
                              );
                            },
                          ),
          ),
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
      icon: const Icon(Icons.info_outline_rounded, size: 22),
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
                Text('FinBrio — Market Intelligence',
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
                  'US Treasury FiscalData API · Tariff data from USTR Section 301 schedules (see Investing → Exposure for freshness).',
                  style: AppTypography.sm.copyWith(color: c.textSecondary),
                ),
                const SizedBox(height: AppSpacing.s4),
                Text('PRIVACY',
                    style: AppTypography.labelXs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'FinBrio does not collect, store, or share any personal data. '
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
