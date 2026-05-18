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

// ── Indices Tab ───────────────────────────────────────────────────────────────

class _IndicesTab extends ConsumerStatefulWidget {
  const _IndicesTab();

  @override
  ConsumerState<_IndicesTab> createState() => _IndicesTabState();
}

class _IndicesTabState extends ConsumerState<_IndicesTab> {
  String _query = '';

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
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
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
                        padding:
                            const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                        itemCount: filtered.length,
                        itemBuilder: (ctx, i) => _MarketRow(item: filtered[i]),
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
        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
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
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                  children: [
                    ...filtered.map((item) => _MarketRow(item: item)),
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

        return Column(
          children: [
            _SearchField(onChanged: (v) => setState(() => _query = v.toLowerCase())),
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
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                        children: (() {
                          final grouped = <String, List<MarketItem>>{};
                          for (final item in items) {
                            (grouped[item.region ?? 'Other'] ??= []).add(item);
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
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                        itemCount: filtered.length,
                        itemBuilder: (ctx, i) =>
                            _MarketRow(item: filtered[i], isForex: true),
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
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _formatPrice(item.price, item.unit),
                  style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                ),
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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

class _SectorsTab extends ConsumerWidget {
  const _SectorsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_sectorsProvider);
    return async.when(
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load sector data',
        onRetry: () => ref.invalidate(_sectorsProvider),
      ),
      data: (sectors) {
        final sorted = [...sectors]..sort((a, b) =>
            ((b['perf1M'] as num?) ?? 0).compareTo((a['perf1M'] as num?) ?? 0));
        return RefreshIndicator(
          color: c.accent,
          backgroundColor: c.surface,
          onRefresh: () => ref.refresh(_sectorsProvider.future),
          child: ListView.builder(
            itemCount: sorted.length,
            itemBuilder: (_, i) => _SectorRow(sector: sorted[i], rank: i + 1),
          ),
        );
      },
    );
  }
}

class _SectorRow extends StatelessWidget {
  const _SectorRow({required this.sector, required this.rank});
  final Map<String, dynamic> sector;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final perf1M = (sector['perf1M'] as num?)?.toDouble() ?? 0;
    final isTop = rank <= 3;
    final isBottom = rank >= 9;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.s4, vertical: AppSpacing.s1),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
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
          Text(sector['emoji'] as String? ?? '', style: const TextStyle(fontSize: 20)),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text(sector['name'] as String? ?? '',
                style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          ),
          _PctCell(
              label: '1D', value: (sector['changePercent'] as num?)?.toDouble(), palette: c),
          const SizedBox(width: AppSpacing.s3),
          _PctCell(label: '1W', value: (sector['perf1W'] as num?)?.toDouble(), palette: c),
          const SizedBox(width: AppSpacing.s3),
          _PctCell(label: '1M', value: perf1M, palette: c),
        ],
      ),
    );
  }
}

class _PctCell extends StatelessWidget {
  const _PctCell({required this.label, required this.value, required this.palette});
  final String label;
  final double? value;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final color = v == null ? palette.textMuted : (v >= 0 ? palette.positive : palette.danger);
    final str = v == null ? '--' : '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(label, style: AppTypography.xs.copyWith(color: palette.textMuted)),
        Text(str,
            style: AppTypography.sm.copyWith(color: color, fontWeight: FontWeight.w600)),
      ],
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
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s4,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
      );
    },
  );
}
